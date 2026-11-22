const express      = require("express");
const router = express.Router();
const { required } = require('../middleware/validation');
const EmployeeLeave = require("../models/EmployeeLeave");
const LeaveBalance  = require("../models/LeaveBalance");
const Employee      = require("../models/Employee");
const HR            = require("../models/HR");
const Manager       = require("../models/Manager");
const { sendLeaveStatusEmail } = require("../services/emailService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSessionUser(req) {
  if (req.session.user) return req.session.user;
  return null;
}

/** Count working days between two date strings (inclusive), excluding weekends */
const { workingDays: countWorkingDays, ymd } = require('../utils/dates');

/** Get or create a LeaveBalance document for this email + year */
async function getOrCreateBalance(email, role, year) {
  let balance = await LeaveBalance.findOne({ email, year });
  if (!balance) {
    balance = await LeaveBalance.create({ email, role, year });
  }
  return balance;
}

/** Check if the employee already has an approved/pending leave overlapping these dates */
async function hasOverlap(email, startDate, endDate, excludeId = null) {
  const query = {
    email,
    status: { $in: ["Pending", "Approved"] },
    $or: [
      { startDate: { $lte: endDate },   endDate: { $gte: startDate } },
    ]
  };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await EmployeeLeave.findOne(query).lean();
  return !!existing;
}

// ─── POST /api/leave/apply ────────────────────────────────────────────────────
// Employee or HR applies for leave
router.post("/apply", ...required("leaveType", "startDate", "endDate", "reason"), async (req, res) => {
  const user = getSessionUser(req);
  if (!user || !["Employee", "HR"].includes(user.role)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { leaveType, startDate, endDate, reason } = req.body;

  if (!leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ success: false, error: "All fields are required" });
  }

  if (!["Annual", "Sick", "Casual", "Unpaid"].includes(leaveType)) {
    return res.status(400).json({ success: false, error: "Invalid leave type" });
  }

  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ success: false, error: "End date cannot be before start date" });
  }

  if (startDate < ymd()) {
    return res.status(400).json({ success: false, error: "Cannot apply leave for past dates" });
  }

  try {
    const email = user.email;
    const year  = new Date(startDate).getFullYear();
    const totalDays = countWorkingDays(startDate, endDate);
    if (!totalDays) return res.status(400).json({ error: 'Select at least one working day' });
    if (startDate.slice(0, 4) !== endDate.slice(0, 4)) return res.status(400).json({ error: 'Apply separately for each calendar year' });

    // ── Overlap check ──────────────────────────────────────────────────────
    const overlap = await hasOverlap(email, startDate, endDate);
    if (overlap) {
      return res.status(400).json({
        success: false,
        error: "You already have an approved or pending leave overlapping these dates"
      });
    }

    // ── Balance check (skip for Unpaid) ────────────────────────────────────
    if (leaveType !== "Unpaid") {
      const balance = await getOrCreateBalance(email, user.role, year);
      const available = balance[leaveType].entitled - balance[leaveType].used - balance[leaveType].pending;
      if (totalDays > available) {
        return res.status(400).json({
          success: false,
          error: `Insufficient ${leaveType} leave balance. Available: ${available} day(s), Requested: ${totalDays} day(s)`
        });
      }

      // Lock the pending days
      balance[leaveType].pending += totalDays;
      await balance.save();
    }

    // ── Save leave request ─────────────────────────────────────────────────
    const leave = await EmployeeLeave.create({
      email,
      role:      user.role,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason:    reason.trim(),
      status:    "Pending"
    });

    res.json({ success: true, leave, message: "Leave application submitted successfully" });

  } catch (err) {
    console.error("❌ Apply leave error:", err);
    res.status(500).json({ success: false, error: "Failed to submit leave application" });
  }
});

// ─── GET /api/leave/my-leaves ─────────────────────────────────────────────────
// Returns the logged-in user's leave history
router.get("/my-leaves", async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const leaves = await EmployeeLeave.find({ email: user.email })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── GET /api/leave/my-balance ────────────────────────────────────────────────
// Returns leave balance for the current year
router.get("/my-balance", async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const year    = new Date().getFullYear();
    const balance = await getOrCreateBalance(user.email, user.role, year);

    const types = ["Annual", "Sick", "Casual", "Unpaid"];
    const result = {};

    types.forEach(type => {
      const entitled  = balance[type].entitled;
      const used      = balance[type].used;
      const pending   = balance[type].pending;
      const available = type === "Unpaid" ? 999 : Math.max(0, entitled - used - pending);
      result[type] = { entitled, used, pending, available };
    });

    res.json({ success: true, year, balance: result });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── POST /api/leave/cancel/:id ───────────────────────────────────────────────
// Employee cancels a PENDING leave request
router.post("/cancel/:id", async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const leave = await EmployeeLeave.findOne({ _id: req.params.id, email: user.email });
    if (!leave) return res.status(404).json({ success: false, error: "Leave not found" });

    if (leave.status !== "Pending") {
      return res.status(400).json({ success: false, error: "Only pending leaves can be cancelled" });
    }

    leave.status      = "Rejected";
    leave.cancelledAt = new Date();
    await leave.save();

    // Release the pending balance
    if (leave.leaveType !== "Unpaid") {
      const year    = new Date(leave.startDate).getFullYear();
      const balance = await LeaveBalance.findOne({ email: user.email, year });
      if (balance && balance[leave.leaveType]) {
        balance[leave.leaveType].pending = Math.max(0, balance[leave.leaveType].pending - leave.totalDays);
        await balance.save();
      }
    }

    res.json({ success: true, message: "Leave cancelled successfully" });
  } catch (err) {
    console.error("❌ Cancel leave error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── GET /api/leave/team-leaves ───────────────────────────────────────────────
// Manager: see leave requests from their team
router.get("/team-leaves", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== "Manager") {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const manager     = await Manager.findOne({ email: user.email }).lean();
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const myEmployees = await Employee.find({ managerId: manager._id }).select("email name").lean();
    const emails      = myEmployees.map(e => e.email);

    const leaves = await EmployeeLeave.find({ email: { $in: emails }, role: "Employee" })
      .sort({ createdAt: -1 })
      .lean();

    const enriched = leaves.map(l => {
      const emp = myEmployees.find(e => e.email === l.email);
      return { ...l, employeeName: emp?.name || "Unknown" };
    });

    res.json({ success: true, leaves: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── GET /api/leave/all-leaves ────────────────────────────────────────────────
// HR / Admin: see all leave requests
router.get("/all-leaves", async (req, res) => {
  const user       = getSessionUser(req);
  const isAdmin    = req.session.admin;
  if (!isAdmin && (!user || !["HR"].includes(user.role))) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const leaves = await EmployeeLeave.find({}).sort({ createdAt: -1 }).lean();

    // Enrich with names from Employee and HR collections
    const employeeEmails = [...new Set(leaves.map(l => l.email))];
    const [employees, hrs] = await Promise.all([
      Employee.find({ email: { $in: employeeEmails } }).select("email name").lean(),
      HR.find({ email: { $in: employeeEmails } }).select("email name").lean()
    ]);
    const nameMap = {};
    [...employees, ...hrs].forEach(u => { nameMap[u.email] = u.name; });

    const enriched = leaves.map(l => ({ ...l, employeeName: nameMap[l.email] || l.email }));
    res.json({ success: true, leaves: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── POST /api/leave/update-status ───────────────────────────────────────────
// Manager / HR / Admin approves or rejects a leave
router.post("/update-status", async (req, res) => {
  const user    = getSessionUser(req);
  const isAdmin = req.session.admin;
  if (!isAdmin && (!user || !["Manager", "HR"].includes(user.role))) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { leaveId, status } = req.body;
  if (!leaveId || !["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ success: false, error: "leaveId and valid status required" });
  }

  try {
    const leave = await EmployeeLeave.findById(leaveId);
    if (!leave) return res.status(404).json({ success: false, error: "Leave not found" });

    if (user?.role === 'Manager') {
      const owner = await Employee.findOne({ email: leave.email, managerId: user.id });
      if (!owner || leave.role !== 'Employee') return res.status(403).json({ error: 'You may only review your team leaves' });
    }
    if (user?.role === 'HR' && leave.role === 'HR') return res.status(403).json({ error: 'Only an administrator can review HR leave' });
    if (leave.status !== "Pending") {
      return res.status(400).json({ success: false, error: "Only pending leaves can be updated" });
    }

    const prevStatus  = leave.status;
    const claimed = await EmployeeLeave.findOneAndUpdate({ _id: leave._id, status: 'Pending' }, { status }, { new: true });
    if (!claimed) return res.status(409).json({ error: 'Leave has already been reviewed' });
    leave.status = status;

    // ── Update balance ─────────────────────────────────────────────────────
    if (leave.leaveType !== "Unpaid") {
      const year    = new Date(leave.startDate).getFullYear();
      const balance = await LeaveBalance.findOne({ email: leave.email, year });
      if (balance && balance[leave.leaveType]) {
        // Always release pending
        balance[leave.leaveType].pending = Math.max(0, balance[leave.leaveType].pending - leave.totalDays);
        // If approved, add to used
        if (status === "Approved") {
          balance[leave.leaveType].used += leave.totalDays;
        }
        await balance.save();
      }
    }

    // ── Send email ─────────────────────────────────────────────────────────
    if (leave.email) {
      const decidedBy  = isAdmin ? "Admin" : user.name || user.role;
      const leaveUser  = await Employee.findOne({ email: leave.email }).select("name").lean()
                      || await HR.findOne({ email: leave.email }).select("name").lean();
      sendLeaveStatusEmail(leave.email, leaveUser?.name || leave.email, leave, decidedBy)
        .catch(err => console.error("Leave status email failed:", err));
    }

    res.json({ success: true, leave });
  } catch (err) {
    console.error("❌ Update leave status error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── GET /api/leave/team-balance/:email ──────────────────────────────────────
// Manager / HR sees balance for a specific employee
router.get("/team-balance/:email", async (req, res) => {
  const user = getSessionUser(req);
  if (!user || !["Manager", "HR"].includes(user.role)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    if (user.role === 'Manager' && !await Employee.exists({ email: req.params.email, managerId: user.id })) return res.status(403).json({ error: 'Outside your team' });
    const year = Number(ymd().slice(0, 4));
    const balance = await getOrCreateBalance(req.params.email, "Employee", year);
    const types   = ["Annual", "Sick", "Casual", "Unpaid"];
    const result  = {};
    types.forEach(type => {
      const entitled  = balance[type].entitled;
      const used      = balance[type].used;
      const pending   = balance[type].pending;
      const available = type === "Unpaid" ? 999 : Math.max(0, entitled - used - pending);
      result[type] = { entitled, used, pending, available };
    });
    res.json({ success: true, balance: result });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── GET /api/leave/calendar?month=YYYY-MM ────────────────────────────────────
// Returns leave events for the calendar view, formatted for FullCalendar.js.
// Employee/HR see only their own approved+pending leaves.
// Manager/Admin see their team's (or everyone's, for Admin) leaves.
router.get("/calendar", async (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    let query = { status: { $in: ["Pending", "Approved"] } };

    if (user.role === "Employee" || user.role === "HR") {
      // Own leaves only
      query.email = user.email;
    } else if (user.role === "Manager") {
      // Only this manager's team members' leaves
      const Manager = require("../models/Manager");
      const manager = await Manager.findOne({ email: user.email });
      if (!manager) return res.json({ success: true, events: [] });
      const myEmployees = await Employee.find({ managerId: manager._id }).select('email').lean();
      query.email = { $in: myEmployees.map(e => e.email) };
    }
    // Admin: no email filter — sees everyone's leave

    const leaves = await EmployeeLeave.find(query).lean();

    // Map to FullCalendar.js event format: { title, start, end, color }
    const colorByType = {
      Annual: "#4F46E5",   // indigo
      Sick:   "#DC2626",   // red
      Casual: "#F59E0B",   // amber
      Unpaid: "#6B7280"    // gray
    };
    const colorByStatus = { Pending: "#FBBF24" }; // pending always shown amber regardless of type

    const events = leaves.map(leave => ({
      title: `${leave.leaveType} Leave (${leave.status})`,
      start: leave.startDate,
      // FullCalendar end date is exclusive, so add 1 day to include the last day visually
      end: new Date(new Date(leave.endDate).getTime() + 86400000).toISOString().split('T')[0],
      color: leave.status === "Pending" ? colorByStatus.Pending : (colorByType[leave.leaveType] || "#4F46E5"),
      extendedProps: {
        email: leave.email,
        status: leave.status,
        leaveType: leave.leaveType,
        reason: leave.reason
      }
    }));

    res.json({ success: true, events });
  } catch (err) {
    console.error("❌ Leave calendar fetch error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch calendar data" });
  }
});

router.apply = router.stack.find(layer => layer.route?.path === '/apply').route.stack.at(-1).handle;
router.updateStatus = router.stack.find(layer => layer.route?.path === '/update-status').route.stack.at(-1).handle;
module.exports = router;
