const express = require("express");
const router = express.Router();
const RemovalComplaint = require("../models/RemovalComplaint");
const Employee = require("../models/Employee");
// Shared upload rules. This route already had a whitelist and a size cap, which
// is why it was the safe one — but its filenames were `complaint_<timestamp>`,
// and a removal complaint attachment is exactly the document you do not want
// anyone walking /uploads to be able to guess.
const { complaintUpload } = require("../middleware/uploadConfig");

// Reject before multer runs. The session check used to live inside the handler,
// so an anonymous POST still got its file written to disk before the 401.
function employeeOnly(req, res, next) {
  if (req.session?.user?.role === "Employee") return next();
  return res.status(401).json({ success: false, error: "Unauthorized" });
}

// ── POST /api/complaints/submit ───────────────────────────────────────────────
// Employee submits a complaint about their removal
router.post("/submit", employeeOnly, complaintUpload("attachment"), async (req, res) => {
  try {
    const { complaintText } = req.body;
    if (!complaintText || complaintText.trim().length < 10) {
      return res.status(400).json({ success: false, error: "Complaint message must be at least 10 characters" });
    }

    const employee = await Employee.findOne({ email: req.session.user.email })
      .populate("managerId", "name")
      .lean();

    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    // Employee must have a removal notice (removalReason set)
    if (!employee.removalReason) {
      return res.status(400).json({ success: false, error: "No removal notice found for your account" });
    }

    // Check if complaint already submitted
    const existing = await RemovalComplaint.findOne({ employeeId: employee._id });
    if (existing) {
      return res.status(400).json({ success: false, error: "You have already submitted a complaint" });
    }

    const complaint = new RemovalComplaint({
      employeeId:    employee._id,
      employeeName:  employee.name,
      employeeEmail: employee.email,
      managerId:     employee.managerId._id,
      managerName:   employee.managerId.name,
      removalReason: employee.removalReason,
      complaintText: complaintText.trim(),
      // Store the web-relative path, not req.file.path. UPLOAD_ROOT is absolute
      // now, so req.file.path would be a filesystem path — and hrDashboard.ejs
      // renders this as href="/${attachmentPath}". No leading slash here: that
      // matches the format existing complaint records already hold.
      attachmentPath: req.file ? `uploads/complaints/${req.file.filename}` : null,
      attachmentName: req.file ? req.file.originalname : null,
    });

    await complaint.save();

    // Mark employee as having complained
    await Employee.findByIdAndUpdate(employee._id, { complaintStatus: "Submitted" });

    res.json({ success: true, message: "Complaint submitted successfully. HR has been notified." });

  } catch (err) {
    console.error("❌ Complaint submit error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to submit complaint" });
  }
});

// ── POST /api/complaints/accept-removal ──────────────────────────────────────
// Employee accepts the removal (no complaint)
router.post("/accept-removal", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Employee") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    await Employee.findOneAndUpdate(
      { email: req.session.user.email },
      { removalAccepted: true, complaintStatus: "Accepted" }
    );

    res.json({ success: true, message: "You have accepted the removal." });
  } catch (err) {
    console.error("❌ Accept removal error:", err);
    res.status(500).json({ success: false, error: "Failed to process" });
  }
});

// ── GET /api/complaints/my-status ─────────────────────────────────────────────
// Employee checks their removal notice + complaint status
router.get("/my-status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Employee") {
      return res.status(401).json({ success: false });
    }

    const employee = await Employee.findOne({ email: req.session.user.email })
      .populate("managerId", "name")
      .lean();

    // No removal record at all
    if (!employee || !employee.removalReason) {
      return res.json({ success: true, hasRemovalNotice: false });
    }

    // Employee already accepted — stop showing the banner
    if (employee.removalAccepted) {
      return res.json({ success: true, hasRemovalNotice: false });
    }

    const complaint = await RemovalComplaint.findOne({ employeeId: employee._id }).lean();

    res.json({
      success: true,
      hasRemovalNotice: true,
      removalReason: employee.removalReason,
      // Use stored manager name — managerId is null after removal so populate won't work
      managerName: employee.removalManagerName || employee.managerId?.name || "Your Manager",
      removalAccepted: false,
      complaint: complaint ? {
        submitted: true,
        status: complaint.status,
        hrNote: complaint.hrNote,
        createdAt: complaint.createdAt
      } : { submitted: false }
    });

  } catch (err) {
    console.error("❌ my-status error:", err);
    res.status(500).json({ success: false });
  }
});

// ── GET /api/complaints/all ───────────────────────────────────────────────────
// HR fetches all complaints
router.get("/all", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "HR") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const complaints = await RemovalComplaint.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, complaints });
  } catch (err) {
    console.error("❌ Fetch complaints error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch complaints" });
  }
});

// ── POST /api/complaints/update-status ────────────────────────────────────────
// HR updates complaint status and adds a note
router.post("/update-status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "HR") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { complaintId, status, hrNote } = req.body;
    if (!complaintId || !status) {
      return res.status(400).json({ success: false, error: "complaintId and status are required" });
    }

    const updated = await RemovalComplaint.findByIdAndUpdate(
      complaintId,
      { status, hrNote: hrNote || "" },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Complaint not found" });
    }

    res.json({ success: true, complaint: updated });
  } catch (err) {
    console.error("❌ Update complaint error:", err);
    res.status(500).json({ success: false, error: "Failed to update complaint" });
  }
});

module.exports = router;
