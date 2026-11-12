'use strict';

const { Pool } = require('pg');

// The pool reconnects on its own, so a service that starts before PostgreSQL
// is ready recovers without a restart. /ready reports 503 until then.
function createDb(connectionString, logger) {
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 10),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
  });

  // Without this listener an idle-client error (e.g. the DB restarts)
  // would crash the whole process.
  pool.on('error', (err) => logger.error('postgres pool error', { error: err.message }));

  async function isReady() {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async function withTransaction(fn) {
    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');
      const result = await fn(conn);
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  return { pool, isReady, withTransaction, close: () => pool.end() };
}

module.exports = { createDb };
