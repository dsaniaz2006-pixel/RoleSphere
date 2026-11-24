const AuditLog = require('../models/AuditLog');
const { runWithDemoContext } = require('../middleware/demoIsolation');

async function audit(req, action, target = {}, meta = {}) {
  const user = req.currentUser || req.session?.admin || req.session?.user;
  const write = () => AuditLog.create({
    actorId: user?.id || null,
    actorRole: req.session?.admin ? 'Admin' : user?.role || 'Anonymous',
    actorName: user?.name || 'Anonymous',
    action,
    targetType: target.type,
    targetId: target.id,
    meta,
    ip: req.ip,
    ...(user?.isDemo === true && user?.demoKey
      ? { demoKey: user.demoKey, isDemo: true }
      : {})
  });

  try {
    if (user?.isDemo === true && user?.demoKey) {
      await runWithDemoContext({ demoKey: user.demoKey, actorId: String(user.id || '') }, write);
    } else {
      await write();
    }
  } catch (error) {
    console.error('Audit write failed:', error.message);
  }
}

module.exports = { audit };
