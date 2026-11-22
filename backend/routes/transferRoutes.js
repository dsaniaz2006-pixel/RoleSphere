const express = require("express");
const router = express.Router();
const TransferRequest = require("../models/TransferRequest");
const Employee = require("../models/Employee");
const Manager = require("../models/Manager");
const { sendAccountStatusEmail } = require("../services/emailService");

// ── Employee submits a transfer request ──────────────────────────────────────
router.post("/request", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Employee") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ success: false, error: "Please provide a reason (min 10 characters)" });
    }

    const employee = await Employee.findOne({ email: req.session.user.email })
      .populate("managerId", "name")
      .lean();

    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    // Block if already has a pending request
    const existing = await TransferRequest.findOne({
      employeeId: employee._id,
      managerStatus: { $in: ["Pending", "Approved"] }, hrStatus: "Pending"
    });
    if (existing) {
      return res.status(400).json({ success: false, error: "You already have a pending transfer request" });
    }

    const transfer = new TransferRequest({
      employeeId:          employee._id,
      employeeName:        employee.name,
      employeeEmail:       employee.email,
      currentManagerId:    employee.managerId?._id || null,
      currentManagerName:  employee.managerId?.name || "Unassigned",
      reason:              reason.trim()
    });

    await transfer.save();
    res.json({ success: true, message: "Transfer request submitted. Your manager will review it." });

  } catch (err) {
    console.error("❌ Transfer request error:", err);
    res.status(500).json({ success: false, error: "Failed to submit transfer request" });
  }
});

// ── Employee checks their own transfer request status ─────────────────────────
router.get("/my-status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Employee") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const employee = await Employee.findOne({ email: req.session.user.email }).lean();
    if (!employee) return res.status(404).json({ success: false, error: "Not found" });

    const transfer = await TransferRequest.findOne({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .lean();

    if (!transfer) return res.json({ success: true, hasRequest: false });

    res.json({
      success: true,
      hasRequest: true,
      transfer: {
        reason:           transfer.reason,
        managerStatus:    transfer.managerStatus,
        managerNote:      transfer.managerNote,
        hrStatus:         transfer.hrStatus,
        hrNote:           transfer.hrNote,
        newManagerName:   transfer.newManagerName,
        createdAt:        transfer.createdAt
      }
    });

  } catch (err) {
    console.error("❌ Transfer my-status error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Manager: get transfer requests from their team ────────────────────────────
router.get("/manager-requests", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const manager = await Manager.findOne({ email: req.session.user.email }).lean();
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const requests = await TransferRequest.find({ currentManagerId: manager._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, requests });

  } catch (err) {
    console.error("❌ Manager transfer requests error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Manager approves or rejects a transfer request ────────────────────────────
router.post("/manager-review", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { transferId, status, managerNote } = req.body;
    if (!transferId || !["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "transferId and valid status required" });
    }

    const transfer = await TransferRequest.findOneAndUpdate(
      { _id: transferId, currentManagerId: req.currentUser.id, managerStatus: "Pending", hrStatus: "Pending" },
      { managerStatus: status, managerNote: managerNote || "" },
      { new: true }
    );
    if (!transfer) return res.status(404).json({ success: false, error: "Transfer request not found" });

    // Notify employee by email
    const emailSubject = status === "Approved"
      ? "Your transfer request has been approved by your manager — RoleSphere"
      : "Your transfer request was rejected — RoleSphere";

    const emailBody = status === "Approved"
      ? `Hi ${transfer.employeeName}, your manager has approved your transfer request. HR will now assign you to a new manager.`
      : `Hi ${transfer.employeeName}, your manager has reviewed and rejected your transfer request. Reason: ${managerNote || "No note provided."}`;

    sendTransferStatusEmail(transfer.employeeEmail, transfer.employeeName, status, managerNote, "Manager")
      .catch(err => console.error("Transfer status email failed:", err));

    res.json({ success: true, transfer });

  } catch (err) {
    console.error("❌ Manager review error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── HR: get all manager-approved transfer requests ────────────────────────────
router.get("/hr-requests", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "HR") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const requests = await TransferRequest.find({ managerStatus: "Approved", hrStatus: "Pending" })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, requests });

  } catch (err) {
    console.error("❌ HR transfer requests error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── HR assigns new manager (completes the transfer) ───────────────────────────
router.post("/hr-assign", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "HR") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { transferId, newManagerId, hrNote } = req.body;
    if (!transferId || !newManagerId) {
      return res.status(400).json({ success: false, error: "transferId and newManagerId required" });
    }

    const transfer = await TransferRequest.findById(transferId);
    if (!transfer) return res.status(404).json({ success: false, error: "Transfer request not found" });

    if (transfer.managerStatus !== 'Approved' || transfer.hrStatus !== 'Pending') return res.status(409).json({ error: 'Manager approval is required before HR assignment' });
    if (String(transfer.currentManagerId) === newManagerId) return res.status(400).json({ error: 'Choose a different manager' });
    const newManager = await Manager.findOne({ _id: newManagerId, status: 'approved', isApproved: true }).lean();
    if (!newManager) return res.status(404).json({ success: false, error: "New manager not found" });

    // Update employee's managerId
    const moved = await Employee.findOneAndUpdate({ _id: transfer.employeeId, managerId: transfer.currentManagerId }, { managerId: newManagerId });
    if (!moved) return res.status(409).json({ error: 'Employee team has changed; request a new transfer' });

    // Update transfer record
    transfer.newManagerId   = newManagerId;
    transfer.newManagerName = newManager.name;
    transfer.hrStatus       = "Assigned";
    transfer.hrNote         = hrNote || "";
    await transfer.save();

    // Email the employee
    sendTransferStatusEmail(transfer.employeeEmail, transfer.employeeName, "Assigned", hrNote, "HR", newManager.name)
      .catch(err => console.error("Transfer assigned email failed:", err));

    res.json({ success: true, message: `${transfer.employeeName} has been transferred to ${newManager.name}'s team.` });

  } catch (err) {
    console.error("❌ HR assign error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── HR rejects a transfer request ─────────────────────────────────────────────
router.post("/hr-reject", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "HR") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { transferId, hrNote } = req.body;
    if (!transferId) {
      return res.status(400).json({ success: false, error: "transferId required" });
    }

    const transfer = await TransferRequest.findOneAndUpdate(
      { _id: transferId, managerStatus: "Approved", hrStatus: "Pending" },
      { hrStatus: "Rejected", hrNote: hrNote || "" },
      { new: true }
    );
    if (!transfer) return res.status(404).json({ success: false, error: "Transfer request not found" });

    sendTransferStatusEmail(transfer.employeeEmail, transfer.employeeName, "HR_Rejected", hrNote, "HR")
      .catch(err => console.error("Transfer HR reject email failed:", err));

    res.json({ success: true });

  } catch (err) {
    console.error("❌ HR reject error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ── Internal email helper (inline, no new file needed) ───────────────────────
async function sendTransferStatusEmail(toEmail, recipientName, status, note, decidedBy, newManagerName = null) {
  if (!process.env.EMAIL_USER) return;
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport(
    process.env.EMAIL_SERVICE
      ? { service: process.env.EMAIL_SERVICE, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } }
      : { host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT) || 587, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } }
  );

  const subjects = {
    Approved:    "✅ Transfer request approved by your manager — RoleSphere",
    Rejected:    "❌ Transfer request rejected by your manager — RoleSphere",
    Assigned:    "🎉 You've been transferred to a new team — RoleSphere",
    HR_Rejected: "❌ Transfer request rejected by HR — RoleSphere"
  };

  const messages = {
    Approved:    `Your manager has approved your transfer request. HR will now assign you to a new team. Stay tuned.`,
    Rejected:    `Your manager reviewed your transfer request and rejected it.${note ? ` Note: ${note}` : ""}`,
    Assigned:    `HR has completed your transfer. You've been assigned to <strong>${newManagerName}</strong>'s team.`,
    HR_Rejected: `HR reviewed your transfer request and rejected it.${note ? ` Note: ${note}` : ""}`
  };

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: subjects[status],
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="background:#4f46e5;padding:28px 40px;">
          <span style="font-size:20px;font-weight:700;color:#fff;">RoleSphere</span>
        </div>
        <div style="padding:36px 40px;">
          <h2 style="margin:0 0 12px;color:#111827;">Transfer Request Update</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;">Hi <strong>${recipientName}</strong>,</p>
          <p style="color:#374151;font-size:15px;line-height:1.6;">${messages[status]}</p>
          ${note && status !== "Assigned" ? `<div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-top:16px;"><p style="margin:0;color:#6b7280;font-size:13px;"><strong>Note:</strong> ${note}</p></div>` : ""}
        </div>
        <div style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© 2024 RoleSphere. Automated email — do not reply.</p>
        </div>
      </div>
    `
  });
}

module.exports = router;