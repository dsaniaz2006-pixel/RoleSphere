'use strict';
const session = require('express-session');
const MongoStore = require('connect-mongo').default;

/** Attach Mongo-backed sessions. Browser-session cookie unless Remember Me is chosen. */
function attachSession(app, { store } = {}) {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.HTTPS_ENABLED === 'true';
  const sessionStore = store || MongoStore.create({
    mongoUrl: process.env.MONGO_URI, collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60, autoRemove: 'native', touchAfter: 24 * 60 * 60
  });
  sessionStore.on('error', error => console.error('Session store error:', error.message));
  // Trust reverse proxies only when explicitly enabled and not using direct local TLS.
  if (process.env.TRUST_PROXY === 'true' && process.env.HTTPS_ENABLED !== 'true') app.set('trust proxy', 1);
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
    store: sessionStore, cookie: { secure, httpOnly: true, sameSite: 'lax' }
  });
  app.use(sessionMiddleware);
  app.use((req, res, next) => {
    const actor = req.session.admin || req.session.user;
    res.locals.welcome = { token: req.session.welcomeToken || '', name: actor?.name || '' };
    next();
  });
  app.set('sessionMiddleware', sessionMiddleware);
  app.set('sessionStore', sessionStore);
  return sessionMiddleware;
}
module.exports = { attachSession };
