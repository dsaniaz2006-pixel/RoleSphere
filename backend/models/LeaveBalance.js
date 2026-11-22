const mongoose = require("mongoose");

/**
 * LeaveBalance
 * One document per employee per year.
 * Tracks entitled, used, and pending days for each leave type.
 *
 * Default entitlements (days per year):
 *   Annual  → 15
 *   Sick    → 10
 *   Casual  →  7
 *   Unpaid  → unlimited (no cap, always available)
 */

const leaveBalanceSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role:  { type: String, enum: ["Employee", "HR"], default: "Employee" },
  year:  { type: Number, required: true },

  Annual:  { entitled: { type: Number, default: 15 }, used: { type: Number, default: 0 }, pending: { type: Number, default: 0 } },
  Sick:    { entitled: { type: Number, default: 10 }, used: { type: Number, default: 0 }, pending: { type: Number, default: 0 } },
  Casual:  { entitled: { type: Number, default: 7  }, used: { type: Number, default: 0 }, pending: { type: Number, default: 0 } },
  Unpaid:  { entitled: { type: Number, default: 999}, used: { type: Number, default: 0 }, pending: { type: Number, default: 0 } },
}, { collection: "LeaveBalances" });

leaveBalanceSchema.index({ email: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("LeaveBalance", leaveBalanceSchema);
