'use strict';

// Orders service: order history and management. Owns the orders and
// order_items tables in orders_db. New orders only arrive from order-service
// through POST /internal/orders, never directly from users.

const { createService, HttpError } = require('./lib/platform');
const { createDb } = require('./lib/db');
const { loadSecret, requireAuth, requireInternal } = require('./lib/auth');
const { createServiceClient } = require('./lib/service-client');

const PORT = Number(process.env.PORT || 3005);
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://boutique:boutique@localhost/orders_db';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3003';

const { app, logger, start } = createService('orders', { readiness: () => db.isReady() });
const db = createDb(DATABASE_URL, logger);
const auth = requireAuth(loadSecret('JWT_SECRET', logger));
const internalToken = loadSecret('INTERNAL_API_TOKEN', logger);
const internalOnly = requireInternal(internalToken);
const products = createServiceClient('product-service', PRODUCT_SERVICE_URL, { internalToken });

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}

// Loads orders together with their line items.
async function findOrders(whereSql, params) {
  const { rows: orderRows } = await db.pool.query(
    `SELECT id, user_id, status, total_cents, created_at, updated_at FROM orders
     WHERE ${whereSql} ORDER BY created_at DESC, id DESC`,
    params,
  );
  if (orderRows.length === 0) return [];

  const { rows: itemRows } = await db.pool.query(
    `SELECT order_id, product_id, name, price_cents, quantity FROM order_items
     WHERE order_id = ANY($1::int[]) ORDER BY id`,
    [orderRows.map((o) => o.id)],
  );
  const itemsByOrder = new Map();
  for (const item of itemRows) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push({
      productId: item.product_id,
      name: item.name,
      priceCents: item.price_cents,
      quantity: item.quantity,
    });
  }

  return orderRows.map((o) => ({
    id: o.id,
    userId: o.user_id,
    status: o.status,
    totalCents: o.total_cents,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: itemsByOrder.get(o.id) || [],
  }));
}

async function findUserOrder(orderId, userId) {
  const [order] = await findOrders('id = $1 AND user_id = $2', [orderId, userId]);
  // 404 (not 403) for other users' orders, so ids can't be probed.
  if (!order) throw new HttpError(404, 'Order not found');
  return order;
}

app.get('/api/orders', auth, async (req, res) => {
  res.json({ orders: await findOrders('user_id = $1', [req.user.id]) });
});

app.get('/api/orders/:id', auth, async (req, res) => {
  res.json({ order: await findUserOrder(parseId(req.params.id), req.user.id) });
});

app.post('/api/orders/:id/cancel', auth, async (req, res) => {
  const orderId = parseId(req.params.id);
  // The status check in the WHERE clause makes cancelling idempotent:
  // two concurrent cancels can't both release the stock.
  const { rowCount } = await db.pool.query(
    `UPDATE orders SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'placed'`,
    [orderId, req.user.id],
  );
  const order = await findUserOrder(orderId, req.user.id);
  if (rowCount === 0) throw new HttpError(409, `Order is already ${order.status}`);

  const items = order.items.map(({ productId, quantity }) => ({ productId, quantity }));
  try {
    await products('/internal/inventory/release', { method: 'POST', body: { items } });
  } catch (err) {
    // The order stays cancelled; the stock needs fixing by hand.
    logger.error('order cancelled but stock was not released', { order_id: orderId, items, error: err.message });
  }

  logger.info('order cancelled', { order_id: orderId, user_id: req.user.id });
  res.json({ order });
});

// Called by order-service at checkout with prices confirmed by product-service.
app.post('/internal/orders', internalOnly, async (req, res) => {
  const userId = parseId(req.body?.userId);
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'items are required');
  for (const item of items) {
    const valid = Number.isInteger(item?.productId) && typeof item?.name === 'string'
      && Number.isInteger(item?.priceCents) && item.priceCents >= 0
      && Number.isInteger(item?.quantity) && item.quantity > 0;
    if (!valid) throw new HttpError(400, 'Invalid order item');
  }
  const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

  const orderId = await db.withTransaction(async (conn) => {
    const { rows } = await conn.query(
      'INSERT INTO orders (user_id, status, total_cents) VALUES ($1, $2, $3) RETURNING id',
      [userId, 'placed', totalCents],
    );
    for (const item of items) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, name, price_cents, quantity) VALUES ($1, $2, $3, $4, $5)',
        [rows[0].id, item.productId, item.name, item.priceCents, item.quantity],
      );
    }
    return rows[0].id;
  });

  logger.info('order created', { order_id: orderId, user_id: userId, total_cents: totalCents });
  res.status(201).json({ order: await findUserOrder(orderId, userId) });
});

start(PORT, { onShutdown: db.close });
