'use strict';

// Shared service plumbing: JSON logging, Prometheus metrics, health/readiness
// endpoints, error handling and graceful shutdown.
//
// Every service keeps its own copy of this file so each one can be built and
// deployed on its own (one Dockerfile, one build context per service).

const express = require('express');
const helmet = require('helmet');
const client = require('prom-client');

// Probe and scrape traffic would drown out real traffic in the dashboards.
const UNTRACKED_PATHS = new Set(['/metrics', '/health', '/ready']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createLogger(service) {
  const write = (level, msg, fields) => {
    const entry = { time: new Date().toISOString(), level, service, msg, ...fields };
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
  };
  return {
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}

function createMetrics(service) {
  const register = new client.Registry();
  register.setDefaultLabels({ service });
  // Node.js runtime metrics: heap, event loop lag, GC, CPU, open handles...
  client.collectDefaultMetrics({ register });

  const labelNames = ['method', 'route', 'status_code'];
  return {
    register,
    requests: new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames,
      registers: [register],
    }),
    duration: new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [register],
    }),
    active: new client.Gauge({
      name: 'http_active_requests',
      help: 'Number of in-flight HTTP requests',
      registers: [register],
    }),
  };
}

// Use the route pattern (/api/products/:id), never the raw URL, so the
// number of metric series stays bounded.
function routeLabel(req) {
  if (req.metricsRoute) return req.metricsRoute;
  if (req.route && req.route.path) return req.route.path;
  return 'unmatched';
}

function trackRequests(metrics, logger) {
  return (req, res, next) => {
    if (UNTRACKED_PATHS.has(req.path)) return next();

    const startedAt = process.hrtime.bigint();
    metrics.active.inc();

    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      metrics.active.dec();

      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const labels = {
        method: req.method,
        route: routeLabel(req),
        status_code: String(res.statusCode),
      };
      metrics.requests.inc(labels);
      metrics.duration.observe(labels, seconds);

      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]('request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Math.round(seconds * 1000),
      });
    };
    // 'close' covers clients that disconnect before the response finishes.
    res.on('finish', record);
    res.on('close', record);
    next();
  };
}

/**
 * Creates an Express app with the common middleware and endpoints.
 *
 * @param {string} service       service name, used in logs and metrics
 * @param {object} options
 * @param {() => Promise<boolean>} [options.readiness] dependency check for /ready
 * @param {boolean} [options.parseJson=true] the gateway turns this off so
 *        request bodies are streamed untouched to the backend services
 */
function createService(service, { readiness, parseJson = true } = {}) {
  const logger = createLogger(service);
  const metrics = createMetrics(service);
  const app = express();

  app.set('trust proxy', true);
  app.use(helmet());
  app.use(trackRequests(metrics, logger));

  // Liveness: the process is up. Never checks dependencies, so a database
  // outage does not make Kubernetes restart every pod.
  app.get('/health', (req, res) => res.json({ status: 'ok', service }));

  // Readiness: the service can do useful work right now.
  app.get('/ready', async (req, res) => {
    const ready = readiness ? await readiness() : true;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready', service });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  if (parseJson) app.use(express.json({ limit: '100kb' }));

  function start(port, { onShutdown } = {}) {
    app.use((req, res) => res.status(404).json({ error: 'Not found' }));

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      // HttpError from our routes, or 400/413 from the JSON body parser.
      const status = err.status || err.statusCode || 500;
      if (status >= 500) {
        logger.error('unhandled error', { error: err.message, stack: err.stack, path: req.originalUrl });
        return res.status(status).json({ error: 'Internal server error' });
      }
      return res.status(status).json({ error: err.expose === false ? 'Bad request' : err.message });
    });

    const server = app.listen(port, () => logger.info('listening', { port }));

    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('shutting down', { signal });
      setTimeout(() => process.exit(1), 10_000).unref();
      server.close(async () => {
        try {
          if (onShutdown) await onShutdown();
        } finally {
          process.exit(0);
        }
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    return server;
  }

  return { app, logger, start };
}

module.exports = { createService, HttpError };
