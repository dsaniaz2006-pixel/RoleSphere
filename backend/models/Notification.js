const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  recipientId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientModel: { type: String, enum: ["Admin", "HR", "Manager", "Employee"], required: true },
  type: {
    type: String,
    enum: ["leave", "task", "attendance", "transfer", "complaint", "system", "announcement"],
    required: true
  },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  link:     { type: String, default: null },   // deep link e.g. /manager/dashboard
  isRead:   { type: Boolean, default: false },
  readAt:   { type: Date,    default: null },
  createdAt:{ type: Date,    default: Date.now }
}, { collection: "Notifications" });

NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
