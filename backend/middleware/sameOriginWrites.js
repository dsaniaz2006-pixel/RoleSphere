'use strict';

// CORS does not prevent cross-site HTML form submissions. Require a matching
// Origin for browser write requests, while retaining Origin-less API clients.
function sameOriginWrites(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.get('Origin');
  if (origin == null) return next();

  const host = req.get('host');
  let suppliedOrigin;
  let expectedOrigin;

  try {
    if (!host) throw new Error('Missing Host header');

    suppliedOrigin = new URL(origin);

    // A direct Node HTTPS connection is authoritative even if proxy headers
    // are present. For TLS-terminating deployments, req.protocol reflects
    // X-Forwarded-Proto only when the configured proxy is trusted by Express.
    const protocol = req.socket?.encrypted ? 'https' : req.protocol;
    if (protocol !== 'http' && protocol !== 'https') {
      throw new Error('Invalid request protocol');
    }

    expectedOrigin = new URL(`${protocol}://${host}`);
  } catch (_) {
    console.warn('[sameOriginWrites] Rejected malformed or incomplete origin:', {
      origin,
      host,
      protocol: req.protocol,
      directTls: Boolean(req.socket?.encrypted)
    });
    return res.status(403).json({
      success: false,
      error: 'Cross-origin write request rejected.'
    });
  }

  if (suppliedOrigin.origin !== expectedOrigin.origin) {
    console.warn('[sameOriginWrites] Rejected cross-origin write:', {
      origin: suppliedOrigin.origin,
      expectedOrigin: expectedOrigin.origin,
      host,
      protocol: req.protocol,
      directTls: Boolean(req.socket?.encrypted)
    });
    return res.status(403).json({
      success: false,
      error: 'Cross-origin write request rejected.'
    });
  }

  return next();
}

module.exports = { sameOriginWrites };
