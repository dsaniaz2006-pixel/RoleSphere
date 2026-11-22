const { createHash, createPublicKey, createVerify } = require('node:crypto');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const KEY_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
let cachedKeys = null;
let cachedUntil = 0;

// Return safe, actionable configuration feedback without exposing OAuth credentials.
// This check is also used by the local "npm run doctor:google" command.
function configurationStatus(env = process.env) {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
  const missing = required.filter(name => {
    const value = typeof env[name] === 'string' ? env[name].trim() : '';
    return !value || /^(your[_ -]|replace[_ -]|<.*>)/i.test(value);
  });
  if (missing.length) return {
    configured: false,
    code: 'missing_settings',
    message: `Missing Google OAuth settings in the server .env: ${missing.join(', ')}. Add your RoleSphere OAuth client credentials, save .env, and restart npm start.`
  };
  let url;
  try { url = new URL(env.GOOGLE_REDIRECT_URI); }
  catch { return { configured: false, code: 'invalid_redirect', message: 'GOOGLE_REDIRECT_URI is not a valid URL. Use a full URL such as https://localhost:8001/api/auth/google/callback for local HTTPS.' }; }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.pathname !== '/api/auth/google/callback' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal))) {
    return { configured: false, code: 'invalid_redirect', message: 'GOOGLE_REDIRECT_URI must end with /api/auth/google/callback and use HTTPS (or HTTP on localhost). Check your .env and Google Cloud redirect URI.' };
  }
  if (env.HTTPS_ENABLED === 'true' && url.protocol !== 'https:') {
    return { configured: false, code: 'scheme_mismatch', message: 'Local HTTPS is enabled, but GOOGLE_REDIRECT_URI still uses HTTP. Update it to https://localhost:<PORT>/api/auth/google/callback and register that exact URI in Google Cloud.' };
  }
  // For local development a different port cannot receive the OAuth callback.
  // External HTTPS deployments may use a proxy and a different internal port.
  const currentPort = String(env.PORT || '').trim();
  if (isLocal && currentPort && url.port !== currentPort) {
    return {
      configured: false,
      code: 'port_mismatch',
      message: `Google callback points to port ${url.port || (url.protocol === 'https:' ? '443' : '80')}, but RoleSphere is running on port ${currentPort}. Set GOOGLE_REDIRECT_URI=${url.protocol}//localhost:${currentPort}/api/auth/google/callback in .env, add the same exact URI to Google Cloud OAuth Clients, then restart.`
    };
  }
  return { configured: true, code: 'ready', message: 'Google OAuth settings are present and use the current server port.' };
}
function config() {
  if (!configurationStatus().configured) return null;
  return {
    clientId: process.env.GOOGLE_CLIENT_ID.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    redirectUri: new URL(process.env.GOOGLE_REDIRECT_URI).href
  };
}

function challenge(verifier) { return createHash('sha256').update(verifier).digest('base64url'); }
function authorizationUrl({ clientId, redirectUri }, { state, nonce, codeVerifier }) {
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid email profile', state, nonce,
    code_challenge: challenge(codeVerifier), code_challenge_method: 'S256',
    access_type: 'online', prompt: 'select_account'
  });
  return `${AUTH_ENDPOINT}?${params}`;
}
async function exchangeCode(settings, code, verifier) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri, code, code_verifier: verifier, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Google token exchange failed');
  const tokens = await response.json();
  if (typeof tokens.id_token !== 'string') throw new Error('Google did not return an ID token');
  // We only need an ID token. Do not store Google access or refresh tokens.
  return tokens.id_token;
}
async function publicKeys() {
  if (cachedKeys && Date.now() < cachedUntil) return cachedKeys;
  const response = await fetch(KEY_ENDPOINT, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Unable to load Google signing keys');
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error('Unexpected Google signing-key response');
  cachedKeys = data.keys;
  const match = /max-age=(\d+)/i.exec(response.headers?.get('cache-control') || '');
  cachedUntil = Date.now() + Math.min(3600, Math.max(60, Number(match?.[1]) || 300)) * 1000;
  return cachedKeys;
}
function jsonPart(base64url) {
  if (!/^[a-zA-Z0-9_-]+$/.test(base64url) || base64url.length > 8192) throw new Error('Invalid Google ID token');
  return JSON.parse(Buffer.from(base64url, 'base64url').toString('utf8'));
}
async function verifyIdToken(idToken, { clientId, nonce }) {
  if (typeof idToken !== 'string' || idToken.length > 15000) throw new Error('Invalid Google ID token');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Google ID token');
  const header = jsonPart(parts[0]);
  const claims = jsonPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256) throw new Error('Unsupported Google token signing algorithm');
  const keys = await publicKeys();
  const jwk = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
  if (!jwk) throw new Error('Unrecognized Google signing key');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(parts[0] + '.' + parts[1]);
  verifier.end();
  if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid Google token signature');
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
      claims.aud !== clientId || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      claims.nonce !== nonce || typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255 ||
      typeof claims.email !== 'string' || claims.email.length > 254 || claims.email_verified !== true) {
    throw new Error('Invalid or unverified Google account');
  }
  return { sub: claims.sub, email: claims.email.trim().toLowerCase() };
}
module.exports = { config, configurationStatus, authorizationUrl, exchangeCode, verifyIdToken };
