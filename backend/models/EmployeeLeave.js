const mongoose = require("mongoose");

const employeeLeaveSchema = new mongoose.Schema({
  email:     { type: String, required: true },
  role:      { type: String, enum: ["Employee", "HR"], default: "Employee" },
  leaveType: {
    type: String,
    enum: ["Annual", "Sick", "Casual", "Unpaid"],
    required: true,
    default: "Annual"
  },
  startDate:   { type: String, required: true },
  endDate:     { type: String, required: true },
  totalDays:   { type: Number, required: true, min: 1 },  // calculated on submit
  reason:      { type: String, required: true },
  status:      { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  cancelledAt: { type: Date, default: null },
  createdAt:   { type: Date, default: Date.now }
});

// This collection has no employeeId — it keys leave records on `email`, which
// is what every query in leaveRoutes/employeeRoutes/adminRoutes filters on
// (including the { email: { $in: [...] } } team lookups). Indexing employeeId
// here would index a field that does not exist.
employeeLeaveSchema.index({ email: 1, status: 1 });

// startDate is a "YYYY-MM-DD" string, and reportRoutes queries it as a
// lexicographic range ($gte "2026-08-01", $lte "2026-08-31"). A plain
// ascending index serves that correctly.
employeeLeaveSchema.index({ startDate: 1 });

module.exports = mongoose.model("EmployeeLeave", employeeLeaveSchema);
