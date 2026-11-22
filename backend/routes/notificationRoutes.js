const express = require("express");
const router  = express.Router();
const Notification = require("../models/Notification");

// ── Auth helper — works with your existing session ────────────────────────────
function getSessionUser(req) {
  if (req.session.admin) {
    return { id: req.session.admin.id, model: "Admin" };
  }
  if (req.session.user) {
    const roleMap = { HR: "HR", Manager: "Manager", Employee: "Employee", Admin: "Admin" };
    return { id: req.session.user.id, model: roleMap[req.session.user.role] || null };
  }
  return null;
}

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns paginated notifications for the logged-in user
router.get("/", async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipientId: sessionUser.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipientId: sessionUser.id })
    ]);

    res.json({
      success: true,
      notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── GET /api/notifications/unread-count ──────────────────────────────────────
router.get("/unread-count", async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, count: 0 });

  try {
    const count = await Notification.countDocuments({
      recipientId: sessionUser.id,
      isRead: false
    });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, count: 0 });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch("/:id/read", async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: sessionUser.id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
router.patch("/read-all", async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    await Notification.updateMany(
      { recipientId: sessionUser.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipientId: sessionUser.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
