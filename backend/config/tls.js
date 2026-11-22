'use strict';

const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');

const httpsEnabled = env => env.HTTPS_ENABLED === 'true';

/**
 * Local Node HTTPS uses a certificate generated on the developer's own Mac.
 * Production reverse proxies (Render, nginx, etc.) terminate TLS externally,
 * so they should leave HTTPS_ENABLED unset and set COOKIE_SECURE/TRUST_PROXY.
 */
function loadTlsOptions(env = process.env, projectRoot = path.resolve(__dirname, '../..')) {
  if (!httpsEnabled(env)) return null;
  const certName = env.TLS_CERT_PATH || 'certs/localhost.pem';
  const keyName = env.TLS_KEY_PATH || 'certs/localhost-key.pem';
  const read = (value, kind) => {
    const filename = path.resolve(projectRoot, value);
    try { return fs.readFileSync(filename); }
    catch (_) { throw new Error(`${kind} file is missing or unreadable at ${filename}. Run npm run https:setup on your own machine.`); }
  };
  const cert = read(certName, 'TLS certificate');
  const key = read(keyName, 'TLS private key');
  try { tls.createSecureContext({cert, key}); }
  catch (_) { throw new Error('TLS certificate and private key are invalid or do not match. Regenerate them with npm run https:setup.'); }
  return { cert, key, minVersion: 'TLSv1.2' };
}

function validateHttpsEnvironment(env = process.env) {
  if (!httpsEnabled(env)) return;
  const port = String(env.PORT || '8000');
  let base;
  try { base = new URL(env.BASE_URL); }
  catch (_) { throw new Error(`HTTPS_ENABLED=true requires BASE_URL=https://localhost:${port} (or your matching HTTPS host).`); }
  if (base.protocol !== 'https:' || base.port !== port || base.pathname !== '/' || base.search || base.hash) {
    throw new Error(`BASE_URL must use HTTPS and the configured PORT (${port}) when HTTPS_ENABLED=true.`);
  }
  const redirect = env.GOOGLE_REDIRECT_URI;
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && redirect) {
    let callback;
    try { callback = new URL(redirect); }
    catch (_) { throw new Error('GOOGLE_REDIRECT_URI must be a valid HTTPS URL when HTTPS_ENABLED=true.'); }
    if (callback.protocol !== 'https:' || callback.origin !== base.origin || callback.pathname !== '/api/auth/google/callback' || callback.search || callback.hash) {
      throw new Error(`Google OAuth callback must be ${base.origin}/api/auth/google/callback when using local HTTPS. Add this exact URL to Google Cloud OAuth Clients.`);
    }
  }
}

module.exports = { httpsEnabled, loadTlsOptions, validateHttpsEnvironment };
