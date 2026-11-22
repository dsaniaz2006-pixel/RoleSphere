const mongoose = require("mongoose");

const TransferRequestSchema = new mongoose.Schema({
  employeeId:       { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  employeeName:     { type: String, required: true },
  employeeEmail:    { type: String, required: true },
  currentManagerId: { type: mongoose.Schema.Types.ObjectId, ref: "Manager", default: null },
  currentManagerName: { type: String, default: "Unassigned" },
  newManagerId:     { type: mongoose.Schema.Types.ObjectId, ref: "Manager", default: null },
  newManagerName:   { type: String, default: null },
  reason:           { type: String, required: true },
  managerStatus:    { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  managerNote:      { type: String, default: "" },
  hrStatus:         { type: String, enum: ["Pending", "Assigned", "Rejected"], default: "Pending" },
  hrNote:           { type: String, default: "" },
  createdAt:        { type: Date, default: Date.now }
}, { collection: "TransferRequests" });

module.exports = mongoose.model("TransferRequest", TransferRequestSchema);