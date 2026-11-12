'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { HttpError } = require('./platform');

// Reads a secret from the environment. Production images (NODE_ENV=production)
// refuse to start without it; local `npm run dev` falls back to a dev value.
function loadSecret(name, logger) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set`);
  }
  logger.warn(`${name} is not set, using an insecure development default`);
  return `dev-only-${name.toLowerCase()}`;
}

// Verifies the user's JWT. Every service checks the token itself instead of
// trusting the gateway: a request is only as trusted as its signature.
function requireAuth(secret) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new HttpError(401, 'Authentication required'));
    }
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      req.user = { id: Number(payload.sub), email: payload.email };
      return next();
    } catch {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
  };
}

// Guards /internal/* endpoints that only other services may call. The gateway
// never routes /internal, and this shared token stops anything else on the
// network from calling them.
function requireInternal(token) {
  const expected = Buffer.from(token);
  return (req, res, next) => {
    const given = Buffer.from(req.get('x-internal-token') || '');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return next(new HttpError(403, 'Forbidden'));
    }
    return next();
  };
}

module.exports = { loadSecret, requireAuth, requireInternal };
