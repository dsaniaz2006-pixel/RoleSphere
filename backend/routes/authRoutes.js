const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const Admin    = require("../models/Admin");
const HR       = require("../models/HR");
const Manager  = require("../models/Manager");
const Employee = require("../models/Employee");

const router = express.Router();

const { audit } = require('../services/auditService');
const { body } = require('express-validator');
const { finish } = require('../middleware/validation');
const models = { Admin, HR, Manager, Employee };
const { establishSession } = require("../services/authSession");
const getRoleModel = role => typeof role === 'string' && Object.prototype.hasOwnProperty.call(models, role) ? models[role] : null;
const invalid = (res, role, error, status = 401) => res.status(status).render('role-login', { role, error });

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const Model = getRoleModel(role);
    if (!Model || role === 'Admin') return res.status(403).json({ error: 'Public administrator registration is disabled. Use the seed script to create an administrator.' });
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Valid name, email and password (8-128 characters) required' });
    if (await Model.exists({ email })) return res.status(409).json({ error: 'User already exists' });

    const isEmployee = role === 'Employee';

    const user = await Model.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      isApproved: isEmployee ? true : false,
      status: isEmployee ? 'approved' : 'pending',
      role
    });

    if (isEmployee) {
      // Immediately authenticate and send to the Employee dashboard.
      const destination = await establishSession(req, user, role, { method: 'password' });
      return res.redirect(destination);
    }

    // HR and Manager remain pending for Admin approval.
    res.redirect('/register-pending');
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'User already exists' });
    next(err);
  }
}

async function login(req, res, next) {
  const { password, role } = req.body;
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const Model = getRoleModel(role);
  if (!Model || typeof email !== 'string' || typeof password !== 'string' || !email || !password || password.length > 128) return res.status(400).json({ error: 'Email, password and valid role required' });
  try {
    const user = await Model.findOne({ email }).select("+password");
    if (!user || !user.password || !await bcrypt.compare(password, user.password)) {
      // Reveal a different role only after verifying its credentials. Never look up
      // an email alone and disclose its department, or carry a password into a URL.
      const matches = [];
      for (const [candidateRole, Candidate] of Object.entries(models)) {
        if (candidateRole === role) continue;
        const candidate = await Candidate.findOne({ email }).select('+password');
        if (candidate?.password && await bcrypt.compare(password, candidate.password)) matches.push(candidateRole);
      }
      await audit(req, 'login.failure', {}, { attemptedEmail: email, attemptedRole: role, reason: matches.length === 1 ? 'wrong-role' : 'invalid-credentials' });
      if (matches.length === 1) {
        const correctRole = matches[0];
        const redirect = '/login/' + correctRole;
        const message = `You selected ${role}, but these credentials belong to ${correctRole}. Opening the ${correctRole} sign-in page.`;
        req.session.loginHint = { role: correctRole, email, message: `Your account belongs to ${correctRole}. Please sign in here to continue.`, expiresAt: Date.now() + 120000 };
        return req.session.save(error => {
          if (error) return next(error);
          if (req.get('Accept')?.includes('application/json')) return res.status(409).json({ code: 'WRONG_ROLE', error: message, role: correctRole, redirect });
          return res.redirect(303, redirect);
        });
      }
      return invalid(res, role, matches.length > 1 ? 'These credentials match more than one role. Choose the role you want to use.' : 'Invalid credentials');
    }
    
    if (user.isDemo === true && process.env.DEMO_MODE !== 'true') {
      await audit(req, 'login.failure', {}, { attemptedEmail: email, attemptedRole: role, reason: 'demo-mode-disabled' });
      return invalid(res, role, 'Public demo accounts are currently unavailable.', 403);
    }

    // MODIFIED: Allow Employees to log in immediately without approval. Keep restriction for HR and Manager.
    if (role !== 'Admin' && role !== 'Employee' && (!user.isApproved || user.status !== 'approved')) {
      await audit(req, 'login.failure', {}, { attemptedEmail: email, attemptedRole: role, reason: 'not-approved' });
      return invalid(res, role, 'Your account is pending approval or has been rejected.', 403);
    }
    
    const remember = req.body.rememberMe === true || req.body.rememberMe === 'on' || req.body.rememberMe === 'true';
    res.redirect(await establishSession(req, user, role, { remember, method: 'password' }));
  } catch (err) { next(err); }
}

router.post('/register', register);
router.post('/login', login);
router.login = login;
router.register = register;

// ── POST /api/auth/change-password ───────────────────────────────────────────
// All roles — change password while logged in
router.post("/change-password", async (req, res) => {
  const sessionUser = req.session.admin || req.session.user;
  if (!sessionUser) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: "Both fields required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
  }

  try {
    const role  = req.session.admin ? "Admin" : req.session.user.role;
    const Model = getRoleModel(role);
    const user  = await Model.findById(sessionUser.id).select("+password");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const isMatch = user.password && await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    await audit(req, "password.change", { type: role, id: user._id });
    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Returns current logged-in user data (used by frontend JS to know who's logged in)
router.get("/me", (req, res) => {
  if (req.session.admin) {
    return res.json({ success: true, user: { ...req.session.admin, role: "Admin" } });
  }
  if (req.session.user) {
    return res.json({ success: true, user: req.session.user });
  }
  res.status(401).json({ success: false, error: "Not authenticated" });
});

// ── GET /api/auth/logout ──────────────────────────────────────────────────────
router.get('/logout', require('../services/logout').logout);

module.exports = router;