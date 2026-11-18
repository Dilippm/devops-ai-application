-- Boutique schema and seed data.
--
-- Docker Compose: mounted into /docker-entrypoint-initdb.d, so PostgreSQL runs
-- it once, the first time the data volume is created. To re-run it:
--   docker compose down -v && docker compose up -d
--
-- One database per service (database-per-service pattern). Each service only
-- ever connects to its own database.

CREATE DATABASE auth_db;
CREATE DATABASE products_db;
CREATE DATABASE orders_db;
CREATE DATABASE users_db;

-- ---------------------------------------------------------------------------
-- auth_db (auth service): credentials
-- ---------------------------------------------------------------------------
\connect auth_db

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Demo account: demo@boutique.local / demo1234 (bcrypt, cost 10)
INSERT INTO users (email, password_hash) VALUES
  ('demo@boutique.local', '$2b$10$NndmuFx6FTKsnyNHdR.Nf.B.ovaXm9g3na943DbUJpEI1CJTYZekC');

-- ---------------------------------------------------------------------------
-- products_db (product-service): catalog and inventory
-- ---------------------------------------------------------------------------
\connect products_db

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  emoji       TEXT NOT NULL DEFAULT '🛍️',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX products_category_idx ON products (category);

INSERT INTO products (sku, name, description, category, price_cents, stock, emoji) VALUES
  ('APP-001', 'Linen Overshirt',      'Relaxed-fit overshirt in washed European linen.',       'Apparel',     6800, 25, '👕'),
  ('APP-002', 'Merino Crew Socks',    'Soft, breathable merino socks. Pack of three.',          'Apparel',     2400, 60, '🧦'),
  ('APP-003', 'Canvas Sneakers',      'Low-top sneakers with a vulcanised rubber sole.',        'Apparel',     7900, 18, '👟'),
  ('ACC-001', 'Leather Tote',         'Full-grain leather tote that ages beautifully.',         'Accessories', 14500, 10, '👜'),
  ('ACC-002', 'Polarised Sunglasses', 'Acetate frames with UV400 polarised lenses.',            'Accessories', 9200, 22, '🕶️'),
  ('ACC-003', 'Field Watch',          'Automatic movement, 38mm steel case, canvas strap.',     'Accessories', 21000,  6, '⌚'),
  ('HOM-001', 'Ceramic Pour-Over',    'Hand-thrown ceramic dripper for slow mornings.',         'Home',        3800, 30, '☕'),
  ('HOM-002', 'Soy Wax Candle',       'Cedar and fig candle, around 50 hours of burn time.',    'Home',        2900, 45, '🕯️'),
  ('HOM-003', 'Wool Throw Blanket',   'Heavyweight lambswool throw, woven in Scotland.',        'Home',        11800,  8, '🧶'),
  ('BTY-001', 'Botanical Hand Cream', 'Fast-absorbing hand cream with shea and calendula.',     'Beauty',      1900, 80, '🧴'),
  ('BTY-002', 'Bamboo Hairbrush',     'Paddle brush with natural bamboo bristles.',             'Beauty',      2200, 35, '🪮'),
  ('BTY-003', 'Eau de Parfum',        'Warm amber and sandalwood, 50ml.',                       'Beauty',      8600,  3, '🌸');

-- ---------------------------------------------------------------------------
-- orders_db: orders + order_items (orders service), cart_items (order-service)
-- ---------------------------------------------------------------------------
\connect orders_db

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('placed', 'cancelled')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);

-- name and price are copied at checkout, so later catalog changes never
-- rewrite order history.
CREATE TABLE order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE cart_items (
  user_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- users_db (user-service): profiles
-- ---------------------------------------------------------------------------
\connect users_db

CREATE TABLE profiles (
  user_id    INTEGER PRIMARY KEY,
  email      TEXT NOT NULL,
  full_name  TEXT,
  phone      TEXT,
  address    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO profiles (user_id, email, full_name, address) VALUES
  (1, 'demo@boutique.local', 'Demo Shopper', '1 Market Street, Springfield');
