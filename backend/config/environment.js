'use strict';

const REQUIRED = ['MONGO_URI', 'SESSION_SECRET', 'JWT_SECRET'];
const isPlaceholder = value => /^(?:your_|paste_|change_me|changeme|example|replace_me|supersecretkey123|rolesphere_jwt_secret_2024)/i.test(String(value || '').trim());

function assertServerEnvironment(env = process.env) {
  for (const key of REQUIRED) if (!env[key]?.trim()) throw new Error(`${key} is required; copy .env.example to .env`);
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI)) throw new Error('MONGO_URI must be a valid MongoDB connection URI');
  const port = Number(env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  if (env.NODE_ENV === 'production') {
    for (const key of ['SESSION_SECRET', 'JWT_SECRET']) {
      if (env[key].length < 32 || isPlaceholder(env[key])) throw new Error(`${key} must be a unique, strong secret (at least 32 characters) in production`);
    }
    if (env.COOKIE_SECURE !== 'true' && env.HTTPS_ENABLED !== 'true') {
      throw new Error('Production requires secure cookies: set COOKIE_SECURE=true behind a trusted HTTPS reverse proxy');
    }
  }
  return { port };
}
module.exports = { assertServerEnvironment, isPlaceholder };
