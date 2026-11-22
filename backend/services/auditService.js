const AuditLog = require('../models/AuditLog');
async function audit(req, action, target = {}, meta = {}) {
  const user = req.currentUser || req.session?.admin || req.session?.user;
  try {
    await AuditLog.create({ actorId: user?.id || null, actorRole: req.session?.admin ? 'Admin' : user?.role || 'Anonymous',
      actorName: user?.name || 'Anonymous', action, targetType: target.type, targetId: target.id,
      meta, ip: req.ip });
  } catch (error) { console.error('Audit write failed:', error.message); }
}
module.exports = { audit };
