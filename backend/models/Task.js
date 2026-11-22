const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: false },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager', required: false },
  assignedToModel: { type: String, enum: ['Employee', 'Manager'], default: 'Employee' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  deadline: { type: Date, required: true },
  status: { type: String, enum: ["Pending", "Submitted", "Approved", "Rejected"], default: "Pending" }, // "Pending", "Submitted", "Approved", "Rejected"
  submission: { type: String, default: null }, // Path to uploaded file
  submittedAt: { type: Date, default: null },
  managerFeedback: { type: String, default: "" }
}, { collection: "Tasks" });

// Every task lookup in the app filters on one of these two owners, usually
// alongside status. Without them each dashboard load is a full collection scan.
// employeeId first also serves the bare { employeeId } queries and the
// employeeId/status $group in reportRoutes as a covered index.
TaskSchema.index({ employeeId: 1, status: 1 });
TaskSchema.index({ managerId: 1, status: 1 });

module.exports = mongoose.model("Task", TaskSchema);
