'use strict';

const { configurationStatus } = require('../services/googleIdentity');

/**
 * Preserve OAuth callback reliability: a different local port is a different
 * registered redirect URI. Silently choosing the next free port causes users
 * to hit Google error 400 or a refused callback connection.
 */
function resolveListeningPort(preferred, available, environment = process.env) {
  if (available === preferred) return available;
  if (environment.HTTPS_ENABLED === 'true' || configurationStatus(environment).configured) {
    throw new Error(
      `Port ${preferred} is occupied. HTTPS/Google OAuth requires a fixed port, so RoleSphere will not silently start on port ${available}. ` +
      'Stop the service using that port, or change PORT, BASE_URL and GOOGLE_REDIRECT_URI to the same free port and register that redirect URI in Google Cloud.'
    );
  }
  return available;
}

module.exports = { resolveListeningPort };
