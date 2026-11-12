'use strict';

const { HttpError } = require('./platform');

// Small JSON client for service-to-service calls.
// Client errors from the other service (404, 409...) are passed through so the
// user sees e.g. "out of stock"; anything else becomes a 502.
function createServiceClient(name, baseUrl, { internalToken, timeoutMs = 5000 } = {}) {
  return async function call(path, { method = 'GET', body } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (internalToken) headers['x-internal-token'] = internalToken;

    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const wrapped = new HttpError(502, `${name} is unavailable`);
      wrapped.cause = err;
      throw wrapped;
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
      throw new HttpError(res.status, data.error || `${name} rejected the request`);
    }
    throw new HttpError(502, `${name} returned ${res.status}`);
  };
}

module.exports = { createServiceClient };
