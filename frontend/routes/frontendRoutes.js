const express = require("express");

const adminRoutes = require("./admin");
const passwordResetRoutes = require("./passwordResetRoutes");

const router = express.Router();

// Homepage
router.get("/", (req, res) => {
  res.render("index");
});

// Login Page
router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// Register Page
router.get("/register", (req, res) => {
  res.render("register", { error: null });
});
// Add after line 37:
router.get("/register-pending", (req, res) => {
  res.render("register-pending");
});

// Dashboard (Protected Route)
router.get("/dashboard", (req, res) => {
  if (req.session.admin) return res.redirect("/api/admin/dashboard");
  if (!req.session.user) {
    return res.redirect("/login");
  }

  // Redirect based on role
  switch (req.session.user.role) {
    case "Admin": return res.redirect("/admin/dashboard");
    case "HR": return res.redirect("/hr/dashboard");
    case "Manager": return res.redirect("/manager/dashboard");
    case "Employee": return res.redirect("/employee/dashboard");
    default: return res.redirect("/dashboard");
  }
});

// One canonical registration handler prevents legacy routes from granting Admin access.
router.post('/register', require('../../backend/routes/authRoutes').register);

// Keep legacy frontend sign-in on the same verified implementation.
router.post('/login', require('../../backend/routes/authRoutes').login);

// Logout
router.get('/logout', require('../../backend/services/logout').logout);

// Role-based Login Page
router.get("/login/:role", (req, res) => {
  const { role } = req.params;
  if (!["Admin", "HR", "Manager", "Employee"].includes(role)) return res.redirect("/login");
  const hint = req.session.loginHint;
  const loginHint = hint && hint.role === role && hint.expiresAt > Date.now() ? hint : null;
  if (hint && (loginHint || hint.expiresAt <= Date.now())) delete req.session.loginHint;
  const googleNotice = req.session.googleAuthNotice;
  const googleError = googleNotice?.role === role ? googleNotice.message : null;
  if (googleError) delete req.session.googleAuthNotice;
  res.render('role-login', { role, error: googleError, loginHint });
});

// Role-based Register Page
router.get("/register/:role", (req, res) => {
  const { role } = req.params;
  if (!["Admin", "HR", "Manager", "Employee"].includes(role)) return res.redirect("/register");
  if (role === "Admin") return res.redirect("/login/Admin");
  res.render("role-register", { role, error: null });
});

// Use admin routes
router.use("/admin", adminRoutes);
router.use("/", passwordResetRoutes);

// Reports page — accessible by Admin and HR
router.get("/admin/reports", (req, res) => {
  // Admin session can be stored as req.session.admin OR req.session.user with role Admin
  const adminSession = req.session.admin || (req.session.user?.role === "Admin" ? req.session.user : null);
  if (adminSession) {
    return res.render("reports", { user: { name: adminSession.name, role: "Admin" } });
  }
  if (req.session.user?.role === "HR") {
    return res.render("reports", { user: { name: req.session.user.name, role: "HR" } });
  }
  res.redirect("/login");
});

router.get("/hr/reports", (req, res) => {
  if (req.session.user?.role === "HR") {
    return res.render("reports", { user: { name: req.session.user.name, role: "HR" } });
  }
  res.redirect("/login");
});

module.exports = router;
