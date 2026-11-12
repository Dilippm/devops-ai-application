'use strict';

// API gateway: the single entry point for the frontend. Routes /api/* to the
// owning service and streams requests through untouched (it never parses
// bodies or checks tokens; each service authenticates for itself).
// /internal/* is deliberately never routed, so those endpoints stay private.

const { createProxyMiddleware } = require('http-proxy-middleware');
const { createService } = require('./lib/platform');

const PORT = Number(process.env.PORT || 3001);
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 10_000);

const SERVICES = {
  auth: process.env.AUTH_URL || 'http://localhost:3002',
  'product-service': process.env.PRODUCT_SERVICE_URL || 'http://localhost:3003',
  'order-service': process.env.ORDER_SERVICE_URL || 'http://localhost:3004',
  orders: process.env.ORDERS_URL || 'http://localhost:3005',
  'user-service': process.env.USER_SERVICE_URL || 'http://localhost:3006',
};

const ROUTES = [
  { prefix: '/api/auth', service: 'auth' },
  { prefix: '/api/products', service: 'product-service' },
  { prefix: '/api/cart', service: 'order-service' },
  { prefix: '/api/checkout', service: 'order-service' },
  { prefix: '/api/orders', service: 'orders' },
  { prefix: '/api/users', service: 'user-service' },
];

const matches = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

const { app, logger, start } = createService('gateway', { parseJson: false });

// Label proxied requests by route prefix so the metrics stay low-cardinality.
app.use((req, res, next) => {
  const route = ROUTES.find((r) => matches(req.path, r.prefix));
  if (route) req.metricsRoute = route.prefix;
  next();
});

// Readiness of every backend in one call, handy for local smoke tests.
app.get('/api/status', async (req, res) => {
  const checks = await Promise.all(Object.entries(SERVICES).map(async ([name, url]) => {
    try {
      const r = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(2000) });
      return [name, r.ok ? 'ready' : 'not ready'];
    } catch {
      return [name, 'unreachable'];
    }
  }));
  const services = Object.fromEntries(checks);
  const healthy = checks.every(([, state]) => state === 'ready');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', services });
});

for (const { prefix, service } of ROUTES) {
  app.use(createProxyMiddleware({
    target: SERVICES[service],
    pathFilter: (path) => matches(path, prefix),
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: PROXY_TIMEOUT_MS,
    on: {
      error: (err, req, res) => {
        logger.error('upstream request failed', { service, path: req.originalUrl, error: err.message });
        if (typeof res.status === 'function' && !res.headersSent) {
          res.status(502).json({ error: `${service} is unavailable` });
        }
      },
    },
  }));
}

start(PORT);
