const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { escapeRegex } = require('../utils/pagination');
const Employee = require('../models/Employee');
const Manager = require('../models/Manager');
const HR = require('../models/HR');
const Task = require('../models/Task');
router.get('/', requireAuth, async (req, res, next) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (q.length < 2) return res.json({ success: true, data: [] });
  const rx = new RegExp(escapeRegex(q), 'i'); const user = req.currentUser;
  try {
    if (user.role === 'Employee') {
      const tasks = await Task.find({ employeeId: user.id, title: rx }).select('title status deadline').limit(8).lean();
      return res.json({ success: true, data: tasks.map(t => ({ ...t, name: t.title, type: 'Task', url: `/workspace?task=${t._id}` })) });
    }
    if (!['Admin', 'HR', 'Manager'].includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
    const filter = { status: 'approved', $or: [{ name: rx }, { email: rx }] };
    if (user.role === 'Manager') filter.managerId = user.id;
    const groups = await Promise.all((user.role === 'Manager' ? [[Employee, 'Employee']] : [[Employee, 'Employee'], [Manager, 'Manager'], [HR, 'HR']]).map(async ([Model, type]) => {
      const people = await Model.find(filter).select('name email department').limit(8).lean();
      return people.map(p => ({ ...p, type, url: `/workspace?person=${p._id}&type=${type}` }));
    }));
    res.json({ success: true, data: groups.flat() });
  } catch (err) { next(err); }
});
module.exports = router;
