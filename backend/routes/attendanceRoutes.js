const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const HR = require('../models/HR');
const Manager = require('../models/Manager');

const { ymd: today, time: timeNow, sunday: isSunday, late: isLateCheckIn } = require('../utils/dates');
const { requireRole } = require('../middleware/authMiddleware');
const month = () => today().slice(0, 7);
router.use(requireRole('Employee', 'Manager', 'HR', 'Admin'));
router.use((req, res, next) => {
  if (['/employees', '/managers', '/hrs'].includes(req.path)) return next();
  const actor = req.currentUser;
  if ((req.body?.userId && req.body.userId !== String(actor.id)) || (req.query.userId && req.query.userId !== String(actor.id))) {
    return res.status(403).json({ error: 'Attendance belongs to the signed-in user' });
  }
  req.body.userId = String(actor.id); req.body.userModel = actor.role;
  req.query.userId = String(actor.id); next();
});

// Helper: get current user from session
const getSessionUser = (req) => {
  if (req.session.admin) return { id: req.session.admin._id || req.session.admin.id, model: 'HR' };
  if (req.session.user) {
    const role = req.session.user.role;
    if (role === 'HR') return { id: req.session.user._id || req.session.user.id, model: 'HR' };
    if (role === 'Manager') return { id: req.session.user._id || req.session.user.id, model: 'Manager' };
    if (role === 'Employee') return { id: req.session.user._id || req.session.user.id, model: 'Employee' };
  }
  return null;
};

// ─────────────────────────────────────────────
// POST /api/attendance/checkin
// ─────────────────────────────────────────────
router.post('/checkin', async (req, res) => {
  try {
    const { userId, userModel } = req.body;
    if (!userId || !userModel) return res.status(400).json({ error: 'Missing userId or userModel' });

    if (isSunday()) return res.status(400).json({ error: 'Today is Sunday — holiday!' });

    const dateStr = today();
    const existing = await Attendance.findOne({ userId, date: dateStr });
    if (existing && existing.checkIn) {
      return res.status(400).json({ error: 'Already checked in today', record: existing });
    }

    const checkInTime = timeNow();
    const late = isLateCheckIn(checkInTime);

    const record = existing
      ? await Attendance.findByIdAndUpdate(existing._id, { checkIn: checkInTime, status: 'present', isLate: late }, { new: true })
      : await Attendance.create({ userId, userModel, date: dateStr, month: month(), checkIn: checkInTime, status: 'present', isLate: late });

    res.json({ success: true, record, isLate: late });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already checked in today' });
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// ─────────────────────────────────────────────
// POST /api/attendance/checkout
// ─────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const { userId } = req.body;
    const dateStr = today();
    const record = await Attendance.findOne({ userId, date: dateStr });

    if (!record || !record.checkIn) return res.status(400).json({ error: 'You have not checked in today' });
    if (record.checkOut) return res.status(400).json({ error: 'Already checked out today' });

    record.checkOut = timeNow();
    await record.save();

    res.json({ success: true, record });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Check-out failed' });
  }
});

// ─────────────────────────────────────────────
// GET /api/attendance/today-status?userId=xxx
// ─────────────────────────────────────────────
router.get('/today-status', async (req, res) => {
  try {
    const { userId } = req.query;
    const record = await Attendance.findOne({ userId, date: today() });
    res.json({ record: record || null, isSunday: isSunday() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// ─────────────────────────────────────────────
// GET /api/attendance/my-history?userId=xxx&month=YYYY-MM
// Returns full month attendance for a user
// ─────────────────────────────────────────────
router.get('/my-history', async (req, res) => {
  try {
    const { userId, month: monthParam } = req.query;
    const targetMonth = monthParam || month();
    const records = await Attendance.find({ userId, month: targetMonth }).sort({ date: 1 });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─────────────────────────────────────────────
// GET /api/attendance/employees?date=YYYY-MM-DD&month=YYYY-MM
// For Manager/HR: see all employee attendance
// ─────────────────────────────────────────────
router.get('/employees', requireRole('Manager', 'HR', 'Admin'), async (req, res) => {
  try {
    const { date, month: monthParam } = req.query;
    const employees = await Employee.find(req.currentUser.role === 'Manager' ? { managerId: req.currentUser.id } : {}, 'name email _id');

    if (date) {
      const records = await Attendance.find({ userModel: 'Employee', userId: { $in: employees.map(e => e._id) }, date });
      const result = employees.map(emp => {
        const rec = records.find(r => r.userId.toString() === emp._id.toString());
        return { ...emp.toObject(), checkIn: rec?.checkIn || '-', checkOut: rec?.checkOut || '-', status: rec?.status || 'absent' };
      });
      return res.json({ employees: result, date });
    }

    const targetMonth = monthParam || month();
    const records = await Attendance.find({ userModel: 'Employee', userId: { $in: employees.map(e => e._id) }, month: targetMonth });
    res.json({ employees: employees.map(e => e.toObject()), records, month: targetMonth });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employee attendance' });
  }
});

// ─────────────────────────────────────────────
// GET /api/attendance/managers?date=YYYY-MM-DD&month=YYYY-MM
// For HR: see all manager attendance
// ─────────────────────────────────────────────
router.get('/managers', requireRole('HR', 'Admin'), async (req, res) => {
  try {
    const { date, month: monthParam } = req.query;
    const managers = await Manager.find({}, 'name email _id');

    if (date) {
      const records = await Attendance.find({ userModel: 'Manager', date });
      const result = managers.map(mgr => {
        const rec = records.find(r => r.userId.toString() === mgr._id.toString());
        return { ...mgr.toObject(), checkIn: rec?.checkIn || '-', checkOut: rec?.checkOut || '-', status: rec?.status || 'absent' };
      });
      return res.json({ managers: result, date });
    }

    const targetMonth = monthParam || month();
    const records = await Attendance.find({ userModel: 'Manager', month: targetMonth });
    res.json({ managers: managers.map(m => m.toObject()), records, month: targetMonth });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch manager attendance' });
  }
});

// ─────────────────────────────────────────────
// GET /api/attendance/hrs?date=YYYY-MM-DD&month=YYYY-MM
// For Admin: see all HR attendance
// ─────────────────────────────────────────────
router.get('/hrs', requireRole('Admin'), async (req, res) => {
  try {
    const { date, month: monthParam } = req.query;
    const hrs = await HR.find({}, 'name email _id');

    if (date) {
      const records = await Attendance.find({ userModel: 'HR', date });
      const result = hrs.map(hr => {
        const rec = records.find(r => r.userId.toString() === hr._id.toString());
        return { ...hr.toObject(), checkIn: rec?.checkIn || '-', checkOut: rec?.checkOut || '-', status: rec?.status || 'absent' };
      });
      return res.json({ hrs: result, date });
    }

    const targetMonth = monthParam || month();
    const records = await Attendance.find({ userModel: 'HR', month: targetMonth });
    res.json({ hrs: hrs.map(h => h.toObject()), records, month: targetMonth });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch HR attendance' });
  }
});

module.exports = router;
