const mongoose = require('mongoose');

// One Google identity can grant access to exactly one RoleSphere account.
// Keeping this in its own collection enforces uniqueness across the four role collections.
const GoogleIdentitySchema = new mongoose.Schema({
  sub: { type: String, required: true, unique: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  role: { type: String, required: true, enum: ['Admin', 'HR', 'Manager', 'Employee'], immutable: true },
  linkedAt: { type: Date, default: Date.now }
}, { collection: 'google_identities' });
GoogleIdentitySchema.index({ role: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('GoogleIdentity', GoogleIdentitySchema);
