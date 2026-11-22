const router = require('express').Router();
const { requireRole, requireAuth } = require('../middleware/authMiddleware');
const Task = require('../models/Task');
const Employee = require('../models/Employee');
const Todo = require('../models/ToDo');
const { reviewTask } = require('../services/taskService');
const { options, list, escapeRegex } = require('../utils/pagination');
const { body, param } = require('express-validator');
const { finish } = require('../middleware/validation');
router.use(requireAuth);
router.get('/tasks', requireRole('Manager', 'Employee'), async (req, res, next) => {
  try {
    const user = req.currentUser;
    const filter = user.role === 'Employee' ? { employeeId: user.id } : { employeeId: { $in: await Employee.find({ managerId: user.id }).distinct('_id') }, assignedToModel: 'Employee' };
    if (req.query.id) {
      if (!/^[a-f0-9]{24}$/i.test(req.query.id)) return res.status(400).json({ error: 'Invalid ID' });
      filter._id = req.query.id;
    }
    if (req.query.status) {
      if (!['Pending', 'Submitted', 'Approved', 'Rejected'].includes(req.query.status)) return res.status(400).json({ error: 'Invalid status' });
      filter.status = req.query.status;
    }
    if (req.query.q) filter.title = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
    res.json({ success: true, ...await list(Task, filter, req.query, '-__v', ['title', 'deadline', 'status'], 'deadline') });
  } catch (err) { next(err); }
});
router.patch('/tasks/:id/status', requireRole('Manager'), param('id').isMongoId(), finish, reviewTask);
router.get('/todos', requireRole('Employee'), async (req, res, next) => {
  try {
    const filter = { employeeEmail: req.currentUser.email };
    if (req.query.status) {
      if (!['Pending', 'In Progress', 'Done'].includes(req.query.status)) return res.status(400).json({ error: 'Invalid status' });
      filter.status = req.query.status;
    }
    res.json({ success: true, ...await list(Todo, filter, { sort: '-createdAt', ...req.query }, '-__v', ['createdAt', 'text', 'status'], 'createdAt') });
  } catch (err) { next(err); }
});
router.patch('/todos/:id/status', requireRole('Employee'), param('id').isMongoId(), body('status').isIn(['Pending', 'In Progress', 'Done']), finish, async (req, res, next) => {
  try {
    const todo = await Todo.findOneAndUpdate({ _id: req.params.id, employeeEmail: req.currentUser.email }, { status: req.body.status, completed: req.body.status === 'Done' }, { new: true, runValidators: true });
    if (!todo) return res.status(404).json({ error: 'Todo not found' });
    res.json({ success: true, todo });
  } catch (err) { next(err); }
});
module.exports = router;
