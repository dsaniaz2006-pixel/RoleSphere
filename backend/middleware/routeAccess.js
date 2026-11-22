'use strict';
const { requireRole, requireSession } = require('./authMiddleware');

/** Compatibility checks for legacy URL shapes. Protects role and record ownership. */
function enforceRouteAccess(app) {
  app.use(require('./validation').validateWrite);
  // Canonical guards cover legacy handlers which previously trusted body emails.
  app.use('/employee', (req, res, next) => {
    if (req.path === '/register') return next();
    requireRole('Employee')(req, res, () => {
      if (req.body.email && req.body.email !== req.currentUser.email) return res.status(403).json({ error: 'You may only access your own data' });
      req.body.email = req.currentUser.email;
      next();
    });
  });
  for (const [prefix, role] of [['/manager','Manager'], ['/hr','HR'], ['/api/admin','Admin'], ['/admin','Admin']]) {
    app.use(prefix, (req, res, next) => {
      if (['/login','/register'].includes(req.path)) return next();
      requireRole(role)(req, res, next);
    });
  }
  app.use(['/api/complaints','/api/transfer','/api/leave','/api/overview','/api/performance'], requireSession);
}
module.exports = { enforceRouteAccess };
