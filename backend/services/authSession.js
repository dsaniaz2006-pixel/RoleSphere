const crypto = require('node:crypto');
const { audit } = require('./auditService');
const redirects = Object.freeze({ Admin: '/api/admin/dashboard', HR: '/hr/dashboard', Manager: '/manager/dashboard', Employee: '/employee/dashboard' });
async function establishSession(req, user, role, { remember = false, method = 'password' } = {}) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  const actor = { id: String(user._id), name: user.name, email: user.email, role, isDemo: user.isDemo === true, ...(user.demoKey ? { demoKey: user.demoKey } : {}) };
  req.session.welcomeToken = crypto.randomUUID();
  // The app config provides a 14-day default for transient sessions, but a
  // regular login must produce a browser-session cookie (no Expires/Max-Age).
  // Explicitly clear the default after regeneration, or regular sign-ins will
  // stay logged in after the browser closes. Keep Remember Me at 30 days.
  req.session.cookie.maxAge = remember ? 30 * 86400000 : null;
  if (role === 'Admin') req.session.admin = actor; else req.session.user = actor;
  req.currentUser = actor;
  await audit(req, 'login.success', {}, { method });
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  return redirects[role];
}
module.exports = { establishSession };
