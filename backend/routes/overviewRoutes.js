const express = require("express");
const router = express.Router();
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const EmployeeLeave = require("../models/EmployeeLeave");
const Announcement = require("../models/Announcement");
const Admin    = require("../models/Admin");
const HR       = require("../models/HR");
const Manager  = require("../models/Manager");

// ── Helper: get session user ID (works for Admin, HR, Manager, Employee) ──────
function getSessionUserId(req) {
  if (req.session.admin) return req.session.admin.id?.toString();
  if (req.session.user)  return req.session.user.id?.toString();
  return null;
}

// ── GET /api/overview/stats ───────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const today = require('../utils/dates').ymd();
    const totalEmployees    = await Employee.countDocuments();
    const presentToday      = await Attendance.countDocuments({ date: today, userModel: "Employee", status: "present" });
    const absentToday       = await Attendance.countDocuments({ date: today, userModel: "Employee", status: "absent" });
    const pendingApprovals  = await EmployeeLeave.countDocuments({ status: "Pending" });

    res.json({ totalEmployees, presentToday, absentToday, pendingApprovals });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ── GET /api/overview/announcements ──────────────────────────────────────────
// Returns latest announcements (newest first)
router.get("/announcements", async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ date: -1 })
      .lean();
    res.json({ success: true, announcements });
  } catch (err) {
    res.status(500).json({ success: false, announcements: [] });
  }
});


// ── Helper: get user model + email from session ────────────────────────────────
function getSessionActor(req) {
  if (req.session.admin) return { model: Admin,    email: req.session.admin.email,  role: "Admin" };
  if (req.session.user)  {
    const role = req.session.user.role;
    const email = req.session.user.email;
    if (role === "HR")       return { model: HR,       email, role };
    if (role === "Manager")  return { model: Manager,  email, role };
    if (role === "Employee") return { model: Employee, email, role };
  }
  return null;
}

// ── GET /api/overview/announcements/unread-count ─────────────────────────────
// Counts announcements posted AFTER this user last opened the panel.
// Stored in DB so it persists across login sessions.
// Admin never sees their own announcements as unread.
router.get("/announcements/unread-count", async (req, res) => {
  try {
    const actor = getSessionActor(req);
    if (!actor) return res.json({ success: true, count: 0 });

    // Admin posted the announcements — don't show unread count to them
    if (actor.role === "Admin") return res.json({ success: true, count: 0 });

    const user = await actor.model.findOne({ email: actor.email }).select("lastSeenAnnouncementAt").lean();
    const lastSeen = user?.lastSeenAnnouncementAt || new Date(0);

    const count = await Announcement.countDocuments({ date: { $gt: lastSeen } });
    res.json({ success: true, count });
  } catch (err) {
    console.error("unread-count error:", err);
    res.status(500).json({ success: false, count: 0 });
  }
});

// ── POST /api/overview/announcements/mark-seen ───────────────────────────────
// Saves current timestamp to DB — persists across login sessions
router.post("/announcements/mark-seen", async (req, res) => {
  try {
    const actor = getSessionActor(req);
    if (!actor) return res.json({ success: true });

    await actor.model.findOneAndUpdate(
      { email: actor.email },
      { lastSeenAnnouncementAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("mark-seen error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
