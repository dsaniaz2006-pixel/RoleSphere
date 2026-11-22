const router = require('express').Router();
const { requireRole } = require('../middleware/authMiddleware');
const { list, escapeRegex } = require('../utils/pagination');
const Employee = require('../models/Employee');
const Manager = require('../models/Manager');
const HR = require('../models/HR');
router.use(requireRole('Admin', 'HR', 'Manager'));
router.get('/org', requireRole('Admin', 'HR'), async (req, res, next) => {
  try {
    const [managers, employees] = await Promise.all([
      Manager.find({ status: 'approved' }).select('name email').lean(),
      Employee.find({ status: 'approved' }).select('name email department managerId').lean()
    ]);
    const managerIds = new Set(managers.map(m => String(m._id)));
    res.json({ success: true, data: managers.map(m => ({ ...m, reports: employees.filter(e => String(e.managerId) === String(m._id)) })), unassigned: employees.filter(e => !managerIds.has(String(e.managerId))) });
  } catch (err) { next(err); }
});
router.get('/:type', async (req, res, next) => {
  try {
    const Model = { employees: Employee, managers: Manager, hrs: HR }[req.params.type];
    if (!Model || (req.currentUser.role === 'Manager' && req.params.type !== 'employees')) return res.status(403).json({ error: 'Forbidden' });
    const filter = {};
    if (req.currentUser.role === 'Manager') filter.managerId = req.currentUser.id;
    if (req.query.id) {
      if (!/^[a-f0-9]{24}$/i.test(req.query.id)) return res.status(400).json({ error: 'Invalid ID' });
      filter._id = req.query.id;
    }
    if (req.query.status) {
      if (!['pending', 'approved', 'rejected'].includes(req.query.status)) return res.status(400).json({ error: 'Invalid status' });
      filter.status = req.query.status;
    }
    if (req.query.q) { const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i'); filter.$or = [{ name: rx }, { email: rx }]; }
    res.json({ success: true, ...await list(Model, filter, req.query, 'name email department managerId status', ['name', 'email', 'department', 'status'], 'name') });
  } catch (err) { next(err); }
});
module.exports = router;
