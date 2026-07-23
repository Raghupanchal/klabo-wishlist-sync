import crypto from 'crypto';

/**
 * Reusable Shopify App Proxy HMAC Verification Module for KLABO Serverless APIs.
 *
 * Shopify App Proxy appends signed query parameters to proxied requests:
 * - logged_in_customer_id: Verified customer ID string (e.g. '80152887509') or '' if guest
 * - shop: Store domain (e.g. 'klabo-3.myshopify.com')
 * - timestamp: Epoch timestamp in seconds
 * - path_prefix: Proxy subpath (e.g. '/apps/klabo-sync')
 * - signature: HMAC SHA-256 hex digest of sorted key=value pairs
 *
 * @param {import('http').IncomingMessage} req
 * @returns {{ isValid: boolean, customerId: string, isGuest: boolean, shop: string, error?: string }}
 */
export function verifyShopifyAppProxy(req) {
  const secret = process.env.SHOPIFY_APP_SECRET;

  if (!secret) {
    console.error('[ShopifyAuth][ERROR] SHOPIFY_APP_SECRET environment variable is missing.');
    return {
      isValid: false,
      customerId: 'guest',
      isGuest: true,
      shop: '',
      error: 'Server configuration error: SHOPIFY_APP_SECRET missing'
    };
  }

  // Parse query parameters from req.url (supports duplicate keys for array parameters per Shopify spec)
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const queryParams = {};
  for (const key of urlObj.searchParams.keys()) {
    const values = urlObj.searchParams.getAll(key);
    queryParams[key] = values.length > 1 ? values : values[0];
  }

  const signature = queryParams.signature;
  if (!signature) {
    return {
      isValid: false,
      customerId: 'guest',
      isGuest: true,
      shop: '',
      error: 'Unauthorized: Missing Shopify App Proxy signature'
    };
  }

  // Timestamp validation to prevent replay attacks (configurable, defaults to 24 hour window)
  const timestamp = Number(queryParams.timestamp);
  if (!timestamp || isNaN(timestamp)) {
    return {
      isValid: false,
      customerId: 'guest',
      isGuest: true,
      shop: '',
      error: 'Unauthorized: Missing or invalid timestamp parameter'
    };
  }

  const maxAgeSeconds = process.env.SHOPIFY_AUTH_MAX_AGE_SECONDS
    ? Number(process.env.SHOPIFY_AUTH_MAX_AGE_SECONDS)
    : 86400;

  const currentTime = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentTime - timestamp);
  if (timeDifference > maxAgeSeconds) {
    return {
      isValid: false,
      customerId: 'guest',
      isGuest: true,
      shop: '',
      error: 'Unauthorized: Shopify App Proxy timestamp expired'
    };
  }

  // Sort remaining query keys alphabetically according to Shopify App Proxy HMAC spec
  const keysToSign = Object.keys(queryParams)
    .filter((key) => key !== 'signature')
    .sort();

  // Concatenate sorted key=value pairs without any separator
  const message = keysToSign
    .map((key) => {
      const val = queryParams[key];
      const formattedVal = Array.isArray(val) ? val.join(',') : String(val);
      return `${key}=${formattedVal}`;
    })
    .join('');

  // Compute HMAC SHA-256 hex digest using SHOPIFY_APP_SECRET
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');

  // Timing-safe HMAC comparison to prevent timing side-channel attacks
  let isHmacValid = false;
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHmac, 'hex');
    if (signatureBuffer.length === calculatedBuffer.length) {
      isHmacValid = crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);
    }
  } catch (err) {
    isHmacValid = false;
  }

  if (!isHmacValid) {
    return {
      isValid: false,
      customerId: 'guest',
      isGuest: true,
      shop: '',
      error: 'Unauthorized: Invalid Shopify App Proxy HMAC signature'
    };
  }

  // Extract verified logged_in_customer_id provided by Shopify App Proxy
  const loggedInCustomerId = queryParams.logged_in_customer_id
    ? String(queryParams.logged_in_customer_id).trim()
    : '';

  const verifiedCustomerId = loggedInCustomerId || 'guest';

  return {
    isValid: true,
    customerId: verifiedCustomerId,
    isGuest: verifiedCustomerId === 'guest',
    shop: String(queryParams.shop || '')
  };
}
