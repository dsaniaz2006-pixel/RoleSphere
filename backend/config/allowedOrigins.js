'use strict';

// The website and Socket.IO run on the same origin by default. Do not allow
// insecure localhost origins for an HTTPS installation with credentialed CORS.
function allowedOrigins(env = process.env) {
  if (env.BASE_URL) {
    try { return [new URL(env.BASE_URL).origin]; } catch (_) { return []; }
  }
  return [env.HTTPS_ENABLED === 'true' ? `https://localhost:${env.PORT || 8000}` : `http://localhost:${env.PORT || 8000}`];
}
module.exports = { allowedOrigins };
