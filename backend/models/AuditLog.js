const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  actorRole: { type: String, enum: ['Admin', 'HR', 'Manager', 'Employee', 'Anonymous'], required: true },
  actorName: { type: String, required: true },
  action: { type: String, required: true }, targetType: String, targetId: mongoose.Schema.Types.ObjectId,
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }, ip: String,
  createdAt: { type: Date, default: Date.now }
}, { collection: 'AuditLogs' });
schema.index({ createdAt: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });
module.exports = mongoose.model('AuditLog', schema);
