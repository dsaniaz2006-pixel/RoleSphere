const mongoose = require("mongoose");

const PasswordResetTokenSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role:  { type: String, required: true, enum: ["Admin", "HR", "Manager", "Employee"] },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 60 * 60 * 1000) }, // 1 hour
}, { collection: "PasswordResetTokens" });

// Auto-delete expired tokens
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
