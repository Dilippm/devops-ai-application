'use strict';

// Product service: catalog and inventory. Owns products_db.
// Stock is only changed through the /internal endpoints, called by
// order-service at checkout and by orders when an order is cancelled.

const { createService, HttpError } = require('./lib/platform');
const { createDb } = require('./lib/db');
const { loadSecret, requireInternal } = require('./lib/auth');

const PORT = Number(process.env.PORT || 3003);
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://boutique:boutique@localhost/products_db';

const { app, logger, start } = createService('product-service', { readiness: () => db.isReady() });
const db = createDb(DATABASE_URL, logger);
const internalOnly = requireInternal(loadSecret('INTERNAL_API_TOKEN', logger));

const COLUMNS = 'id, sku, name, description, category, price_cents, stock, emoji';
const toProduct = (row) => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  description: row.description,
  category: row.category,
  priceCents: row.price_cents,
  stock: row.stock,
  emoji: row.emoji,
});

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid product id');
  return id;
}

// Validates [{ productId, quantity }] and merges duplicate products.
function readItems(body) {
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new HttpError(400, 'items must be a non-empty array (max 50)');
  }
  const merged = new Map();
  for (const item of items) {
    const productId = parseId(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, 'quantity must be an integer between 1 and 99');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  // Sorted ids give every transaction the same lock order, avoiding deadlocks.
  return [...merged.entries()]
    .sort(([a], [b]) => a - b)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

// GET /api/products?category=Home&ids=1,2,3
app.get('/api/products', async (req, res) => {
  const where = [];
  const params = [];

  if (typeof req.query.category === 'string' && req.query.category) {
    params.push(req.query.category);
    where.push(`category = $${params.length}`);
  }
  if (typeof req.query.ids === 'string' && req.query.ids) {
    const ids = req.query.ids.split(',').slice(0, 100).map(parseId);
    params.push(ids);
    where.push(`id = ANY($${params.length}::int[])`);
  }

  const sql = `SELECT ${COLUMNS} FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
  const { rows } = await db.pool.query(sql, params);
  res.json({ products: rows.map(toProduct) });
});

app.get('/api/products/categories', async (req, res) => {
  const { rows } = await db.pool.query('SELECT DISTINCT category FROM products ORDER BY category');
  res.json({ categories: rows.map((r) => r.category) });
});

app.get('/api/products/:id', async (req, res) => {
  const { rows } = await db.pool.query(`SELECT ${COLUMNS} FROM products WHERE id = $1`, [parseId(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  res.json({ product: toProduct(rows[0]) });
});

// Atomically takes stock for every item, or none of them.
// Returns the current name and price so orders record what was actually paid.
app.post('/internal/inventory/reserve', internalOnly, async (req, res) => {
  const items = readItems(req.body);

  const reserved = await db.withTransaction(async (conn) => {
    const result = [];
    for (const { productId, quantity } of items) {
      const { rows } = await conn.query(
        `UPDATE products SET stock = stock - $2, updated_at = now()
         WHERE id = $1 AND stock >= $2
         RETURNING id, name, price_cents`,
        [productId, quantity],
      );
      if (!rows[0]) {
        const exists = await conn.query('SELECT name, stock FROM products WHERE id = $1', [productId]);
        if (!exists.rows[0]) throw new HttpError(404, `Product ${productId} not found`);
        const { name, stock } = exists.rows[0];
        throw new HttpError(409, `Not enough stock for ${name} (${stock} left)`);
      }
      result.push({ productId, name: rows[0].name, priceCents: rows[0].price_cents, quantity });
    }
    return result;
  });

  logger.info('stock reserved', { items: reserved.length });
  res.json({ items: reserved });
});

app.post('/internal/inventory/release', internalOnly, async (req, res) => {
  const items = readItems(req.body);
  await db.withTransaction(async (conn) => {
    for (const { productId, quantity } of items) {
      await conn.query('UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1', [productId, quantity]);
    }
  });
  logger.info('stock released', { items: items.length });
  res.json({ released: items.length });
});

start(PORT, { onShutdown: db.close });
