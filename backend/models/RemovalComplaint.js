const mongoose = require("mongoose");

const RemovalComplaintSchema = new mongoose.Schema({
  employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  employeeName: { type: String, required: true },
  employeeEmail:{ type: String, required: true },
  managerId:    { type: mongoose.Schema.Types.ObjectId, ref: "Manager", required: true },
  managerName:  { type: String, required: true },
  removalReason:{ type: String, required: true },       // reason manager gave
  complaintText:{ type: String, required: true },       // employee's complaint message
  attachmentPath: { type: String, default: null },      // uploaded file path (jpeg or pdf)
  attachmentName: { type: String, default: null },      // original filename
  status: {
    type: String,
    enum: ["Pending", "Reviewed", "Resolved"],
    default: "Pending"
  },
  hrNote: { type: String, default: "" },               // HR can add a note
  createdAt: { type: Date, default: Date.now }
}, { collection: "RemovalComplaints" });

module.exports = mongoose.model("RemovalComplaint", RemovalComplaintSchema);
