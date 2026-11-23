'use strict';

// CORS does not prevent cross-site HTML form submissions. Validate browser
// write requests against the configured public origin when available. This is
// important for HTTPS deployments and TLS-terminating reverse proxies, where
// the Express socket may see HTTP while the browser used HTTPS.
function sameOriginWrites(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.get('Origin');
  // Preserve compatibility for non-browser clients that do not send Origin.
  if (origin == null) return next();

  let suppliedOrigin;
  let expectedOrigin;

  try {
    suppliedOrigin = new URL(origin);
    if (!['http:', 'https:'].includes(suppliedOrigin.protocol) ||
        suppliedOrigin.origin === 'null' ||
        suppliedOrigin.username || suppliedOrigin.password) {
      throw new Error('Invalid Origin header');
    }

    if (process.env.BASE_URL) {
      // BASE_URL is the canonical externally visible origin. Do not derive
      // this from req.protocol: that can describe the proxy-to-app hop.
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
    console.warn('[sameOriginWrites] Rejected malformed or incomplete origin:', {
      origin,
      reason: error.message
    });
    return res.status(403).json({
      success: false,
      error: 'Cross-origin write request rejected.'
    });
  }

  if (suppliedOrigin.origin !== expectedOrigin) {
    console.warn('[sameOriginWrites] Rejected cross-origin write:', {
      origin: suppliedOrigin.origin,
      expectedOrigin
    });
    return res.status(403).json({
      success: false,
      error: 'Cross-origin write request rejected.'
    });
  }

  return next();
}

module.exports = { sameOriginWrites };
