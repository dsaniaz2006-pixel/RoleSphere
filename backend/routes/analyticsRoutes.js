const router = require('express').Router();
const { requireRole } = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const Task = require('../models/Task');
const Employee = require('../models/Employee');
const Leave = require('../models/EmployeeLeave');
const { ymd, workingDays } = require('../utils/dates');
router.use(requireRole('Admin', 'HR'));
router.get('/attendance-trend', async (req, res, next) => {
  try {
    const end = ymd(); const since = ymd(new Date(Date.now() - 29 * 864e5));
    const rows = await Attendance.aggregate([
      { $match: { date: { $gte: since, $lte: end }, status: 'present' } },
      { $group: { _id: '$date', present: { $sum: 1 }, late: { $sum: { $cond: ['$isLate', 1, 0] } } } }, { $sort: { _id: 1 } }
    ]);
    const byDate = new Map(rows.map(r => [r._id, r])); const data = [];
    for (let i = 29; i >= 0; i--) { const date = ymd(new Date(Date.now() - i * 864e5)); data.push(byDate.get(date) || { _id: date, present: 0, late: 0 }); }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.get('/task-status', async (req, res, next) => {
  try {
    const rows = await Task.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({ success: true, data: ['Pending', 'Submitted', 'Approved', 'Rejected'].map(s => rows.find(r => r._id === s) || { _id: s, n: 0 }) });
  } catch (err) { next(err); }
});
router.get('/dept-headcount', async (req, res, next) => {
  try { const data = await Employee.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: { $cond: [{ $in: ['$department', ['', null]] }, 'Unassigned', { $ifNull: ['$department', 'Unassigned'] }] }, n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } }
  ]); res.json({ success: true, data }); } catch (err) { next(err); }
});
router.get('/leave-by-month', async (req, res, next) => {
  try {
    const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : ymd().slice(0, 4);
    // Split cross-month leave into working days in each month, rather than attributing all days to its start month.
    const leaves = await Leave.aggregate([{ $match: { status: 'Approved', startDate: { $lte: `${year}-12-31` }, endDate: { $gte: `${year}-01-01` } } }, { $project: { startDate: 1, endDate: 1 } }]);
    const data = Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, '0')}`;
      const last = new Date(Date.UTC(+year, i + 1, 0)).toISOString().slice(0, 10);
      const n = leaves.reduce((sum, l) => sum + workingDays(l.startDate > `${month}-01` ? l.startDate : `${month}-01`, l.endDate < last ? l.endDate : last), 0);
      return { _id: month, n };
    }); res.json({ success: true, data });
  } catch (err) { next(err); }
});
module.exports = router;
