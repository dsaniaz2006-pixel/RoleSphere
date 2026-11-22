const router = require('express').Router();
const { requireRole } = require('../middleware/authMiddleware');
const { list } = require('../utils/pagination');
const AuditLog = require('../models/AuditLog');
router.get('/', requireRole('Admin'), async (req, res, next) => {
  try {
    const filter = req.query.action ? { action: String(req.query.action).slice(0, 100) } : {};
    const result = await list(AuditLog, filter, { sort: '-createdAt', ...req.query }, '-__v', ['action', 'createdAt', 'actorName'], 'createdAt');
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});
module.exports = router;
