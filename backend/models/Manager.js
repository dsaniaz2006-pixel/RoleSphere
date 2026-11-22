const mongoose = require("mongoose");

const ManagerSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, select: false },
  preferredLogin: { type: String, enum: ["password", "google"], default: "password" },
  isApproved: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" }
,
  lastSeenAnnouncementAt: { type: Date, default: null }
}, { collection: "Manager" }); // Store in "managers" collection

ManagerSchema.add({
  bio: { type: String, default: '', maxlength: 1000, select: false },
  dob: { type: String, default: '', select: false },
  phone: { type: String, default: '', maxlength: 30 }
});
module.exports = mongoose.model("Manager", ManagerSchema);
