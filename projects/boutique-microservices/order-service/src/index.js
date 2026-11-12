'use strict';

// Order service: shopping cart and checkout. Owns the cart_items table in
// orders_db. Checkout coordinates product-service (stock) and orders (order
// records); there is no distributed transaction, so failed steps are undone
// by compensating calls.

const { createService, HttpError } = require('./lib/platform');
const { createDb } = require('./lib/db');
const { loadSecret, requireAuth } = require('./lib/auth');
const { createServiceClient } = require('./lib/service-client');

const PORT = Number(process.env.PORT || 3004);
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://boutique:boutique@localhost/orders_db';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3003';
const ORDERS_URL = process.env.ORDERS_URL || 'http://localhost:3005';
const MAX_QUANTITY = 99;

const { app, logger, start } = createService('order-service', { readiness: () => db.isReady() });
const db = createDb(DATABASE_URL, logger);
const auth = requireAuth(loadSecret('JWT_SECRET', logger));
const internalToken = loadSecret('INTERNAL_API_TOKEN', logger);
const products = createServiceClient('product-service', PRODUCT_SERVICE_URL, { internalToken });
const orders = createServiceClient('orders', ORDERS_URL, { internalToken });

function parseProductId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid product id');
  return id;
}

function parseQuantity(value, { allowZero = false } = {}) {
  const quantity = Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(quantity) || quantity < min || quantity > MAX_QUANTITY) {
    throw new HttpError(400, `quantity must be an integer between ${min} and ${MAX_QUANTITY}`);
  }
  return quantity;
}

// Cart rows only hold ids and quantities; names, prices and stock always come
// fresh from product-service.
async function loadCart(userId) {
  const { rows } = await db.pool.query(
    'SELECT product_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY added_at',
    [userId],
  );
  if (rows.length === 0) return { items: [], totalCents: 0 };

  const ids = rows.map((r) => r.product_id).join(',');
  const { products: catalog } = await products(`/api/products?ids=${ids}`);
  const byId = new Map(catalog.map((p) => [p.id, p]));

  // Products removed from the catalog silently drop out of the cart.
  const items = rows
    .filter((r) => byId.has(r.product_id))
    .map((r) => {
      const product = byId.get(r.product_id);
      return { product, quantity: r.quantity, lineTotalCents: product.priceCents * r.quantity };
    });
  return { items, totalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0) };
}

async function restoreCart(userId, items) {
  for (const { productId, quantity } of items) {
    await db.pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, ${MAX_QUANTITY})`,
      [userId, productId, quantity],
    );
  }
}

app.get('/api/cart', auth, async (req, res) => {
  res.json(await loadCart(req.user.id));
});

app.post('/api/cart/items', auth, async (req, res) => {
  const productId = parseProductId(req.body?.productId);
  const quantity = parseQuantity(req.body?.quantity ?? 1);
  await products(`/api/products/${productId}`); // 404s if the product doesn't exist

  await db.pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, ${MAX_QUANTITY})`,
    [req.user.id, productId, quantity],
  );
  res.status(201).json(await loadCart(req.user.id));
});

app.put('/api/cart/items/:productId', auth, async (req, res) => {
  const productId = parseProductId(req.params.productId);
  const quantity = parseQuantity(req.body?.quantity, { allowZero: true });

  const result = quantity === 0
    ? await db.pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, productId])
    : await db.pool.query(
      'UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND product_id = $2',
      [req.user.id, productId, quantity],
    );
  if (result.rowCount === 0) throw new HttpError(404, 'Item is not in the cart');
  res.json(await loadCart(req.user.id));
});

app.delete('/api/cart/items/:productId', auth, async (req, res) => {
  const productId = parseProductId(req.params.productId);
  await db.pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
  res.json(await loadCart(req.user.id));
});

// Checkout:
//   1. claim the cart (delete it, so a double-click can't order twice)
//   2. reserve stock in product-service        -> on failure: restore cart
//   3. create the order in the orders service  -> on failure: release stock, restore cart
app.post('/api/checkout', auth, async (req, res) => {
  const userId = req.user.id;
  const { rows } = await db.pool.query(
    'DELETE FROM cart_items WHERE user_id = $1 RETURNING product_id, quantity',
    [userId],
  );
  if (rows.length === 0) throw new HttpError(400, 'Your cart is empty');
  const cart = rows.map((r) => ({ productId: r.product_id, quantity: r.quantity }));

  let reserved;
  try {
    ({ items: reserved } = await products('/internal/inventory/reserve', { method: 'POST', body: { items: cart } }));
  } catch (err) {
    await restoreCart(userId, cart);
    throw err;
  }

  try {
    const { order } = await orders('/internal/orders', { method: 'POST', body: { userId, items: reserved } });
    logger.info('checkout completed', { user_id: userId, order_id: order.id, total_cents: order.totalCents });
    res.status(201).json({ order });
  } catch (err) {
    logger.error('order creation failed, rolling back checkout', { user_id: userId, error: err.message });
    await products('/internal/inventory/release', { method: 'POST', body: { items: cart } })
      .catch((releaseErr) => logger.error('failed to release stock', { user_id: userId, items: cart, error: releaseErr.message }));
    await restoreCart(userId, cart);
    throw err;
  }
});

start(PORT, { onShutdown: db.close });
