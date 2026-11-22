const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, select: false },
    role: { type: String, enum: ["Admin"], required: true },
    preferredLogin: { type: String, enum: ["password", "google"], default: "password" },
    lastSeenAnnouncementAt: { type: Date, default: null }
  },
  { collection: "Admin" }
);

AdminSchema.add({
  bio: { type: String, default: '', maxlength: 1000, select: false },
  dob: { type: String, default: '', select: false },
  phone: { type: String, default: '', maxlength: 30 }
});
module.exports = mongoose.model("Admin", AdminSchema);
