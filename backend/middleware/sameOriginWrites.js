'use strict';

// CORS cannot stop cross-site form POSTs. Enforce a same-origin Origin when supplied.
// Allow non-browser clients without an Origin header for backward compatibility.
function sameOriginWrites(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('Origin');
  if (origin == null) return next();
  const host = req.get('host');
  const expected = host ? `${req.protocol}://${host}` : '';
  if (origin !== expected) return res.status(403).json({ success: false, error: 'Cross-origin write request rejected.' });
  next();
}
module.exports = { sameOriginWrites };
