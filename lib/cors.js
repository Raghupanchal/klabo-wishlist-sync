/**
 * Centralized CORS Security Helper for KLABO Serverless Microservices
 * Enforces strict origin allowlisting, handles preflight OPTIONS requests,
 * sets Vary: Origin headers, and rejects unauthorized cross-origin calls.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://klabo.in',
  'https://www.klabo.in',
  'https://klabo-3.myshopify.com'
];

const DEV_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const SHOPIFY_MYSHOPIFY_REGEX = /^https:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/;

/**
 * Returns the array of explicitly allowed origins, including values
 * provided via the ALLOWED_ORIGINS environment variable.
 */
function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins])];
}

/**
 * Checks whether an incoming origin is trusted.
 * @param {string|undefined} origin
 * @returns {boolean}
 */
export function isOriginAllowed(origin) {
  // Requests without an Origin header (e.g. same-origin server-to-server calls, curl, non-browser)
  if (!origin) {
    return true;
  }

  const allowedList = getAllowedOrigins();
  if (allowedList.includes(origin)) {
    return true;
  }

  // Allow all Shopify admin preview / theme preview subdomains (*.myshopify.com)
  if (SHOPIFY_MYSHOPIFY_REGEX.test(origin)) {
    return true;
  }

  // Allow local development ports (http://localhost:*, http://127.0.0.1:*)
  if (DEV_ORIGIN_REGEX.test(origin)) {
    return true;
  }

  return false;
}

/**
 * Main CORS handler for serverless API routes.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {Object} [options]
 * @param {string[]} [options.allowedMethods]
 * @param {string[]} [options.allowedHeaders]
 * @returns {boolean} Returns true if request processing should continue, false if request was handled (OPTIONS or 403 Forbidden).
 */
export function handleCors(req, res, options = {}) {
  const origin = req.headers.origin;
  const allowedMethods = options.allowedMethods || ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
  const allowedHeaders = options.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With'];

  // Validate origin if present
  if (origin) {
    if (!isOriginAllowed(origin)) {
      res.setHeader('Content-Type', 'application/json');
      res.status(403).json({
        success: false,
        error: 'Forbidden: Origin not allowed'
      });
      return false;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  // Always set Vary: Origin to prevent CDN cache poisoning across different origin requests
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  return true;
}
