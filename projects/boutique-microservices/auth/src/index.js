'use strict';

// Auth service: registration, login and token issuing. Owns auth_db.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createService, HttpError } = require('./lib/platform');
const { createDb } = require('./lib/db');
const { loadSecret, requireAuth } = require('./lib/auth');

const PORT = Number(process.env.PORT || 3002);
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://boutique:boutique@localhost/auth_db';
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '12h';
const BCRYPT_ROUNDS = 10;

const { app, logger, start } = createService('auth', { readiness: () => db.isReady() });
const db = createDb(DATABASE_URL, logger);
const JWT_SECRET = loadSecret('JWT_SECRET', logger);

// Compared against when the email is unknown, so "no such user" and
// "wrong password" take the same time and can't be told apart.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new HttpError(400, 'A valid email is required');
  }
  // bcrypt only uses the first 72 bytes of a password.
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new HttpError(400, 'Password must be between 8 and 72 characters');
  }
  return { email, password };
}

const toUser = (row) => ({ id: row.id, email: row.email, createdAt: row.created_at });

function issueToken(user) {
  return jwt.sign({ email: user.email }, JWT_SECRET, {
    subject: String(user.id),
    expiresIn: TOKEN_TTL,
    algorithm: 'HS256',
  });
}

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = readCredentials(req.body);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { rows } = await db.pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, created_at`,
    [email, hash],
  );
  if (rows.length === 0) throw new HttpError(409, 'An account with this email already exists');

  const user = toUser(rows[0]);
  logger.info('user registered', { user_id: user.id });
  res.status(201).json({ token: issueToken(user), user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = readCredentials(req.body);
  const { rows } = await db.pool.query(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
    [email],
  );

  const valid = await bcrypt.compare(password, rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !valid) throw new HttpError(401, 'Invalid email or password');

  const user = toUser(rows[0]);
  res.json({ token: issueToken(user), user });
});

app.get('/api/auth/me', requireAuth(JWT_SECRET), async (req, res) => {
  const { rows } = await db.pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: toUser(rows[0]) });
});

start(PORT, { onShutdown: db.close });
