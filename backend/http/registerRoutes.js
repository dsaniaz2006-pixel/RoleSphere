'use strict';
const rateLimit = require('express-rate-limit');
const { requireRole } = require('../middleware/authMiddleware');
const authRoutes = require('../routes/authRoutes');
const googleAuthRoutes = require('../routes/googleAuthRoutes');
const leaveRoutes = require('../routes/leaveRoutes');
const adminRoutes = require('../routes/adminRoutes');
const hrRoutes = require('../routes/hrRoutes');
const employeeRoutes = require('../routes/employeeRoutes');
const frontendRoutes = require('../../frontend/routes/frontendRoutes');
const managerRoutes = require('../routes/managerRoutes');
const attendanceRoutes = require('../routes/attendanceRoutes');
const overviewRoutes = require('../routes/overviewRoutes');
const complaintRoutes = require('../routes/complaintRoutes');
const transferRoutes = require('../routes/transferRoutes');
const notificationRoutes = require('../routes/notificationRoutes');
const performanceRoutes = require('../routes/performanceRoutes');

/** Mount route groups in their legacy order; endpoint paths stay backward-compatible. */
function registerRoutes(app) {
  // ── Login rate limiting ───────────────────────────────────────────────────────
  // Scoped to the login endpoints, not applied globally — the dashboards poll, and
  // a global limiter would throttle the app's own traffic long before it inconve-
  // nienced anyone guessing passwords.
  //
  // There are four separate login POSTs in this codebase. Limiting one would just
  // move the brute force to the other three, so all four are listed.
  //
  // skipSuccessfulRequests makes the budget 10 *failed* attempts per window. A
  // shared office IP therefore cannot lock itself out by logging in normally.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many login attempts. Please try again in 15 minutes." }
  });

  // POST only. GET /api/admin/login renders the login page, and rate-limiting a
  // page render would lock people out of the form they need.
  app.post([
    "/api/auth/login",
    "/api/admin/login",
    "/hr/login",
    "/manager/login", "/login"
  ], loginLimiter);

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use(require('../middleware/auditMutations'));
  app.use(require('../middleware/legacyPagination'));
  app.post(['/employee/applyLeave','/hr/applyLeave'], (req, res, next) => { req.body.leaveType ||= 'Annual'; leaveRoutes.apply(req, res, next); });
  app.post(['/manager/updateLeaveStatus','/api/admin/updateLeaveStatus'], (req, res, next) => leaveRoutes.updateStatus(req, res, next));
  // Legacy login/register URLs share one validated implementation.
  app.post(['/login', '/hr/login', '/manager/login', '/api/admin/login'], (req, res, next) => {
    const roles = { '/hr/login':'HR', '/manager/login':'Manager', '/api/admin/login':'Admin' };
    req.body.role = roles[req.path] || req.body.role;
    return authRoutes.login(req, res, next);
  });
  app.post(['/register', '/hr/register', '/manager/register', '/employee/register'], (req, res, next) => {
    const roles = { '/hr/register':'HR', '/manager/register':'Manager', '/employee/register':'Employee' };
    req.body.role = roles[req.path] || req.body.role;
    return authRoutes.register(req, res, next);
  });
  app.use('/api/analytics', require('../routes/analyticsRoutes'));
  app.use('/api/workbench', require('../routes/workbenchRoutes'));
  app.get('/workbench', requireRole('Admin','HR','Manager','Employee'), (req,res)=>res.render('workbench',{user:req.currentUser}));
  app.get('/account/login-methods', requireRole('Admin','HR','Manager','Employee'), (req,res)=>res.render('login-methods',{user:req.currentUser}));
  app.use('/api/dashboard', require('../routes/dashboardRoutes'));
  app.use('/api/activity', require('../routes/auditRoutes'));
  app.use('/api/search', require('../routes/searchRoutes'));
  app.use('/api/board', require('../routes/boardRoutes'));
  app.use('/api/people', require('../routes/peopleRoutes'));
  app.get('/workspace', requireRole('Admin','HR','Manager','Employee'), (req, res) => res.render('workspace', { user: req.currentUser }));
  // OAuth callback is a GET navigation, not a cross-origin POST from Google.
  app.use('/api/auth/google', rateLimit({ windowMs: 15 * 60 * 1000, limit: 45, standardHeaders: 'draft-7', legacyHeaders: false }), googleAuthRoutes);
  app.use("/api/auth",          authRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/employee",          employeeRoutes);
  app.use("/api/admin",         adminRoutes);
  app.use("/hr",                hrRoutes);
  app.use("/manager",           managerRoutes);
  app.use("/api/attendance",    attendanceRoutes);
  app.use("/api/overview",      overviewRoutes);
  app.use("/api/complaints",    complaintRoutes);
  app.use("/api/transfer",      transferRoutes);
  app.use("/api/leave",         leaveRoutes);
  app.use("/",                  frontendRoutes);
  app.use("/api/performance", performanceRoutes);
  app.use("/api/reports",     require("../routes/reportRoutes"));

  // ── Global logout ─────────────────────────────────────────────────────────────
  app.get('/logout', require('../services/logout').logout);
}
module.exports = { registerRoutes };
