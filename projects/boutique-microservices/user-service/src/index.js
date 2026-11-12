'use strict';

// User service: profiles and account details. Owns users_db.
// A profile is created the first time a user opens it, so auth and
// user-service never need to call each other.

const { createService, HttpError } = require('./lib/platform');
const { createDb } = require('./lib/db');
const { loadSecret, requireAuth } = require('./lib/auth');

const PORT = Number(process.env.PORT || 3006);
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://boutique:boutique@localhost/users_db';

const { app, start, logger } = createService('user-service', { readiness: () => db.isReady() });
const db = createDb(DATABASE_URL, logger);
const auth = requireAuth(loadSecret('JWT_SECRET', logger));

const FIELDS = {
  fullName: { column: 'full_name', max: 200 },
  phone: { column: 'phone', max: 30 },
  address: { column: 'address', max: 500 },
};

const toProfile = (row) => ({
  userId: row.user_id,
  email: row.email,
  fullName: row.full_name,
  phone: row.phone,
  address: row.address,
  updatedAt: row.updated_at,
});

// Creates the profile if missing and keeps the email in sync with the token.
async function ensureProfile(user) {
  const { rows } = await db.pool.query(
    `INSERT INTO profiles (user_id, email) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [user.id, user.email],
  );
  return rows[0];
}

app.get('/api/users/me', auth, async (req, res) => {
  res.json({ profile: toProfile(await ensureProfile(req.user)) });
});

app.put('/api/users/me', auth, async (req, res) => {
  const sets = [];
  const params = [req.user.id];
  for (const [key, { column, max }] of Object.entries(FIELDS)) {
    if (req.body?.[key] === undefined) continue;
    const value = req.body[key];
    if (value !== null && (typeof value !== 'string' || value.length > max)) {
      throw new HttpError(400, `${key} must be a string of at most ${max} characters`);
    }
    params.push(value === null ? null : value.trim());
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) throw new HttpError(400, `Provide at least one of: ${Object.keys(FIELDS).join(', ')}`);

  await ensureProfile(req.user);
  const { rows } = await db.pool.query(
    `UPDATE profiles SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1 RETURNING *`,
    params,
  );
  res.json({ profile: toProfile(rows[0]) });
});

start(PORT, { onShutdown: db.close });
