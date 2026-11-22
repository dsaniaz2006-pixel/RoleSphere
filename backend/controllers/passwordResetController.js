const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const Admin    = require("../models/Admin");
const HR       = require("../models/HR");
const Manager  = require("../models/Manager");
const Employee = require("../models/Employee");
const PasswordResetToken = require("../models/PasswordResetToken");
const { sendPasswordResetEmail } = require("../services/emailService");

// Helper: find user by email across all role models
const findUserByEmail = async (email) => {
  const models = [
    { model: Admin,    role: "Admin"    },
    { model: HR,       role: "HR"       },
    { model: Manager,  role: "Manager"  },
    { model: Employee, role: "Employee" },
  ];

  for (const { model, role } of models) {
    const user = await model.findOne({ email });
    if (user) return { user, role };
  }
  return null;
};

// Helper: get model by role
const getModelByRole = (role) => {
  switch (role) {
    case "Admin":    return Admin;
    case "HR":       return HR;
    case "Manager":  return Manager;
    case "Employee": return Employee;
    default:         return null;
  }
};

// ─────────────────────────────────────────────────────────────
// GET /forgot-password  →  show the "enter your email" form
// ─────────────────────────────────────────────────────────────
exports.getForgotPassword = (req, res) => {
  res.render("forgot-password", { error: null, success: null });
};

// ─────────────────────────────────────────────────────────────
// POST /forgot-password  →  generate token & send email
// ─────────────────────────────────────────────────────────────
exports.postForgotPassword = async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).render('forgot-password', { error:'Enter a valid work email address.', success:null });

  try {
    const result = await findUserByEmail(email.toLowerCase().trim());

    // Always show success to prevent email enumeration attacks
    const successMsg = "If that email is registered, a reset link has been sent.";

    if (!result) {
      return res.render("forgot-password", { error: null, success: successMsg });
    }

    const { role } = result;

    // Delete any existing token for this email
    await PasswordResetToken.deleteMany({ email: email.toLowerCase().trim() });

    // Generate secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    await PasswordResetToken.create({
      email: email.toLowerCase().trim(),
      role,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    const baseUrl = process.env.BASE_URL || `${process.env.HTTPS_ENABLED === 'true' ? 'https' : 'http'}://localhost:${process.env.PORT || 3000}`;
    const resetLink = `${baseUrl}/reset-password/${rawToken}`;

    await sendPasswordResetEmail(email.toLowerCase().trim(), resetLink);

    return res.render("forgot-password", { error: null, success: successMsg });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.render("forgot-password", {
      error: "Something went wrong. Please try again.",
      success: null,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /reset-password/:token  →  show new-password form
// ─────────────────────────────────────────────────────────────
exports.getResetPassword = async (req, res) => {
  const { token } = req.params;

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const resetRecord = await PasswordResetToken.findOne({
      token: hashedToken,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord) {
      return res.render("reset-password", {
        token: null,
        error: "This reset link is invalid or has expired. Please request a new one.",
        success: null,
      });
    }

    return res.render("reset-password", { token, error: null, success: null });
  } catch (err) {
    console.error("Reset password GET error:", err);
    return res.render("reset-password", {
      token: null,
      error: "Something went wrong. Please try again.",
      success: null,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /reset-password/:token  →  update password in DB
// ─────────────────────────────────────────────────────────────
exports.postResetPassword = async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  // Validate passwords match
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.render("reset-password", {
      token,
      error: "Password must be 8–128 characters long.",
      success: null,
    });
  }

  if (password !== confirmPassword) {
    return res.render("reset-password", {
      token,
      error: "Passwords do not match.",
      success: null,
    });
  }

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Atomically consume the one-time token *before* hashing or updating the
    // password. A previous findOne()+deleteMany() sequence allowed two
    // concurrent submissions to reset the account using the same token.
    // A failed downstream write requires a fresh reset link (fail closed).
    const resetRecord = await PasswordResetToken.findOneAndDelete({
      token: hashedToken,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord) {
      return res.render("reset-password", {
        token: null,
        error: "This reset link is invalid or has expired. Please request a new one.",
        success: null,
      });
    }

    const Model = getModelByRole(resetRecord.role);
    if (!Model) throw new Error("Invalid role in reset token");

    const hashedPassword = await bcrypt.hash(password, 12);
    const updated = await Model.findOneAndUpdate(
      { email: resetRecord.email },
      { password: hashedPassword }
    );
    if (!updated) throw new Error('Reset target account no longer exists');

    // Invalidate any other reset tokens for the same email after success
    await PasswordResetToken.deleteMany({ email: resetRecord.email });

    await require('../services/auditService').audit(req, 'password.reset', { type:resetRecord.role }, { email:resetRecord.email });
    return res.render("reset-password-success", {
      role: resetRecord.role,
    });
  } catch (err) {
    console.error("Reset password POST error:", err);
    return res.render("reset-password", {
      token,
      error: "Something went wrong. Please try again.",
      success: null,
    });
  }
};
