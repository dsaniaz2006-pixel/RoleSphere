const mongoose = require("mongoose");

const HRSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true},
  password: { type: String, select: false },
  preferredLogin: { type: String, enum: ["password", "google"], default: "password" },
  role: String,
  isApproved: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" }
,
  lastSeenAnnouncementAt: { type: Date, default: null }
}, { collection: "HR" }); // Store in "hr" collection

HRSchema.add({
  bio: { type: String, default: '', maxlength: 1000, select: false },
  dob: { type: String, default: '', select: false },
  phone: { type: String, default: '', maxlength: 30 }
});
module.exports = mongoose.model("HR", HRSchema);
