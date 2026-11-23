'use strict';

// CORS does not prevent cross-site HTML form submissions. Validate browser
// writes against the canonical public origin. Some legitimate browser form
// navigations serialize Origin as "null" (for example, opaque contexts or
// privacy/referrer-policy cases); in that case use Fetch Metadata, then an
// exact Referer-origin match as a compatibility fallback. Never allow null
// solely because it is present.
function sameOriginWrites(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.get('Origin');
  if (origin == null) return next(); // compatibility for non-browser API clients

  let expectedOrigin;
  try {
    if (process.env.BASE_URL) {
      const configuredUrl = new URL(process.env.BASE_URL);
      if (!['http:', 'https:'].includes(configuredUrl.protocol) ||
          configuredUrl.username || configuredUrl.password) {
        throw new Error('Invalid BASE_URL');
      }
      expectedOrigin = configuredUrl.origin;
    } else {
      const host = req.get('host');
      const protocol = req.socket?.encrypted ? 'https' : req.protocol;
      if (!host || !['http', 'https'].includes(protocol)) {
        throw new Error('Missing or invalid request origin information');
      }
      expectedOrigin = new URL(`${protocol}://${host}`).origin;
    }
  } catch (error) {
    console.warn('[sameOriginWrites] Rejected malformed request origin configuration:', {
      origin, reason: error.message
    });
    return res.status(403).json({ success: false, error: 'Cross-origin write request rejected.' });
  }

  if (origin === 'null') {
    // Fetch Metadata is browser-controlled (scripts cannot set Sec-* headers).
    // Accept only an explicitly same-origin browser request.
    const fetchSite = req.get('Sec-Fetch-Site');
    if (fetchSite === 'same-origin') return next();

    // Compatibility fallback for clients/browsers without Fetch Metadata:
    // require a Referer whose parsed origin exactly matches this application.
    const referer = req.get('Referer');
    try {
      if (referer && new URL(referer).origin === expectedOrigin) return next();
    } catch (_) { /* malformed Referer remains rejected */ }

    console.warn('[sameOriginWrites] Rejected opaque-origin write:', {
      fetchSite: fetchSite || null,
      refererOrigin: (() => { try { return referer ? new URL(referer).origin : null; } catch (_) { return null; } })(),
      expectedOrigin
    });
    return res.status(403).json({ success: false, error: 'Cross-origin write request rejected.' });
  }

  let suppliedOrigin;
  try {
    suppliedOrigin = new URL(origin);
    if (!['http:', 'https:'].includes(suppliedOrigin.protocol) ||
        suppliedOrigin.origin === 'null' ||
        suppliedOrigin.username || suppliedOrigin.password) {
      throw new Error('Invalid Origin header');
    }
  } catch (error) {
    console.warn('[sameOriginWrites] Rejected malformed Origin header:', {
      origin, reason: error.message
    });
    return res.status(403).json({ success: false, error: 'Cross-origin write request rejected.' });
  }

  if (suppliedOrigin.origin !== expectedOrigin) {
    console.warn('[sameOriginWrites] Rejected cross-origin write:', {
      origin: suppliedOrigin.origin, expectedOrigin
    });
    return res.status(403).json({ success: false, error: 'Cross-origin write request rejected.' });
  }

  return next();
}

module.exports = { sameOriginWrites };
