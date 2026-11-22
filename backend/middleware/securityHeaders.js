'use strict';
const helmet = require('helmet');

/** Keep HTTP/HTTPS security headers in one place for all routes and assets. */
function createSecurityHeaders(env = process.env) {
  const COOKIE_SECURE = env.COOKIE_SECURE === 'true' || env.HTTPS_ENABLED === 'true';
  const IS_LOCAL_DIRECT_HTTPS = env.HTTPS_ENABLED === 'true' &&
    /^https:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/i.test(env.BASE_URL || '');
  return helmet({
    contentSecurityPolicy: { directives: {
      upgradeInsecureRequests: COOKIE_SECURE ? [] : null,
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      scriptSrcAttr: ["'none'"],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...(COOKIE_SECURE ? ['wss:'] : ['ws:', 'wss:'])],
      objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"]
    }},
    strictTransportSecurity: COOKIE_SECURE && !IS_LOCAL_DIRECT_HTTPS
      ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false
  });
}
module.exports = { createSecurityHeaders };
