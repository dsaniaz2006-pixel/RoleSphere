const mongoose = require("mongoose");

const EmployeeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true, select: false },
    preferredLogin: { type: String, enum: ["password", "google"], default: "password" },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
    isApproved: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    phone: { type: String, default: "" },
    department: { type: String, default: "" },
    address: { type: String, default: "" },
    profilePhoto: { type: String, default: null },
    removalReason: { type: String, default: null },
    removalManagerName: { type: String, default: null },
    removalAccepted: { type: Boolean, default: false },
    complaintStatus: { type: String, enum: ["None", "Submitted", "Accepted"], default: "None" }
,
  lastSeenAnnouncementAt: { type: Date, default: null }
}, { collection: "Employees" });

EmployeeSchema.index({ managerId: 1, status: 1, name: 1 });
EmployeeSchema.add({
  bio: { type: String, default: '', maxlength: 1000, select: false },
  dob: { type: String, default: '', select: false },
  phone: { type: String, default: '', maxlength: 30 }
});
module.exports = mongoose.model("Employee", EmployeeSchema);