
"use strict";

const nodemailer = require("nodemailer");

// ============================================================
// 1. EMAIL TRANSPORT CONFIGURATION
// ============================================================

let transporter;

const createTransporter = () => {
  if (transporter) return transporter;

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    console.warn("[RoleSphere Email] Config missing: EMAIL_USER and EMAIL_PASS required.");
    return null;
  }

  if (process.env.EMAIL_SERVICE) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  } else {
    if (!process.env.EMAIL_HOST) {
      throw new Error(
        "EMAIL_HOST is required when EMAIL_SERVICE is not configured."
      );
    }

    const port = Number.parseInt(process.env.EMAIL_PORT, 10) || 587;

    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port,
      secure: port === 465,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  return transporter;
};

const getFromAddress = () =>
  process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

// ============================================================
// 2. SHARED EMAIL HELPERS
// ============================================================

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });

const emailHeader = `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:12px;overflow:hidden;
          box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#4f46e5;padding:32px 40px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;">
                RoleSphere
              </div>
            </td>
          </tr>
`;

const emailFooter = `
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;
              border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} RoleSphere. All rights reserved.
              </p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">
                This is an automated email. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

const wrapEmail = (content) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f9fafb;
      font-family:Arial,sans-serif;">
      ${emailHeader}
      ${content}
      ${emailFooter}
    </body>
  </html>
`;

const sendEmail = async ({ to, subject, html, text, type }) => {
  if (!to || typeof to !== "string" || !to.trim()) {
    throw new Error(`Invalid recipient address for ${type || "email"}.`);
  }

  try {
    const mailer = createTransporter();
  if (!mailer) return { accepted: [], rejected: [], error: "Email configuration missing" };

    const info = await mailer.sendMail({
      from: getFromAddress(),
      to: to.trim(),
      subject,
      html,
      text,
    });

    if (!info) {
      throw new Error("Email provider returned no response.");
    }

    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      throw new Error(
        `Recipient rejected: ${info.rejected.join(", ")}`
      );
    }

    console.log("[RoleSphere Email] Email accepted:", {
      type,
      recipient: to,
      messageId: info.messageId || "Not provided",
      accepted: info.accepted || [],
      response: info.response || "Not provided",
    });

    // Always return Nodemailer's result to the calling function.
    return info;
  } catch (error) {
    console.error(`[RoleSphere Email] ${type || "Email"} failed:`, {
      recipient: to,
      message: error.message,
      code: error.code,
      response: error.response,
    });

    throw error;
  }
};

const formatDate = (dateValue) => {
  if (!dateValue) return "Not specified";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(dateValue);
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// ============================================================
// 3. PASSWORD RESET EMAIL
// ============================================================

const sendPasswordResetEmail = async (toEmail, resetLink) => {
  if (!resetLink) {
    throw new Error("Password reset link is required.");
  }

  let parsedLink;

  try {
    parsedLink = new URL(resetLink);
  } catch {
    throw new Error("Invalid password reset URL.");
  }

  if (!["http:", "https:"].includes(parsedLink.protocol)) {
    throw new Error("Password reset URL must use HTTP or HTTPS.");
  }

  const safeLink = escapeHtml(parsedLink.href);

  const html = wrapEmail(`
    <tr>
      <td style="padding:40px;">
        <h1 style="color:#111827;font-size:24px;">
          Reset Your Password
        </h1>

        <p style="color:#6b7280;font-size:15px;line-height:1.6;">
          We received a request to reset your RoleSphere account password.
          Click the button below to choose a new password.
        </p>

        <div style="text-align:center;margin:32px 0;">
          <a href="${safeLink}"
            style="background:#4f46e5;color:#ffffff;text-decoration:none;
            padding:14px 32px;border-radius:8px;font-weight:600;
            display:inline-block;">
            Reset Password
          </a>
        </div>

        <p style="color:#6b7280;font-size:13px;">
          This link will expire in <strong>1 hour</strong>.
          If you did not request a password reset, ignore this email.
        </p>

        <p style="word-break:break-all;font-size:12px;">
          <a href="${safeLink}">${safeLink}</a>
        </p>
      </td>
    </tr>
  `);

  return sendEmail({
    to: toEmail,
    subject: "Password Reset Request - RoleSphere",
    html,
    text: `Reset your RoleSphere password using this link: ${parsedLink.href}. The link expires in one hour.`,
    type: "Password reset email",
  });
};

// ============================================================
// 4. TASK ASSIGNED EMAIL
// ============================================================

const sendTaskAssignedEmail = async (
  toEmail,
  recipientName,
  task,
  assignedBy
) => {
  if (!task || !task.title) {
    throw new Error("Task title is required.");
  }

  const name = escapeHtml(recipientName || toEmail);
  const title = escapeHtml(task.title);
  const description = escapeHtml(task.description || "No description provided.");
  const assignedByName = escapeHtml(assignedBy || "RoleSphere Team");
  const deadline = formatDate(task.deadline);

  const html = wrapEmail(`
    <tr>
      <td style="padding:40px;">
        <h1 style="color:#111827;font-size:24px;">
          New Task Assigned
        </h1>

        <p style="color:#6b7280;font-size:15px;line-height:1.6;">
          Hi <strong>${name}</strong>, a new task has been assigned
          to you by <strong>${assignedByName}</strong>.
        </p>

        <div style="background:#f3f4f6;border-radius:10px;
          padding:24px;margin:24px 0;">

          <p style="color:#9ca3af;font-size:12px;">TASK TITLE</p>
          <h2 style="color:#111827;">${title}</h2>

          <p style="color:#9ca3af;font-size:12px;">DESCRIPTION</p>
          <p style="color:#374151;line-height:1.6;">${description}</p>

          <p style="color:#9ca3af;font-size:12px;">DEADLINE</p>
          <p style="color:#dc2626;font-weight:600;">${deadline}</p>
        </div>

        <p style="color:#6b7280;font-size:14px;">
          Log in to your RoleSphere dashboard to view your task
          and submit your work before the deadline.
        </p>
      </td>
    </tr>
  `);

  return sendEmail({
    to: toEmail,
    subject: `New Task Assigned: ${title} - RoleSphere`,
    html,
    text: `Hi ${recipientName || toEmail}, a new task "${task.title}" was assigned by ${assignedBy || "RoleSphere Team"}. Deadline: ${deadline}.`,
    type: "Task assigned email",
  });
};

// ============================================================
// 5. LEAVE APPROVED / REJECTED EMAIL
// ============================================================

const sendLeaveStatusEmail = async (
  toEmail,
  recipientName,
  leave,
  decidedBy
) => {
  if (!leave || !leave.status) {
    throw new Error("Leave details and status are required.");
  }

  const normalizedStatus = String(leave.status).toLowerCase();

  if (!["approved", "rejected"].includes(normalizedStatus)) {
    throw new Error(`Invalid leave status: ${leave.status}`);
  }

  const isApproved = normalizedStatus === "approved";
  const label = isApproved ? "Approved" : "Rejected";
  const color = isApproved ? "#16a34a" : "#dc2626";
  const background = isApproved ? "#f0fdf4" : "#fef2f2";

  const name = escapeHtml(recipientName || toEmail);
  const decisionMaker = escapeHtml(decidedBy || "Administrator");
  const reason = escapeHtml(leave.reason || "Not specified");

  const startDate = formatDate(leave.startDate);
  const endDate = formatDate(leave.endDate);

  const html = wrapEmail(`
    <tr>
      <td style="padding:40px;">
        <h1 style="color:#111827;font-size:24px;">
          ${isApproved ? "Leave Approved" : "Leave Rejected"}
        </h1>

        <p style="color:#6b7280;font-size:15px;">
          Hi <strong>${name}</strong>, your leave request has been
          reviewed by <strong>${decisionMaker}</strong>.
        </p>

        <div style="background:${background};padding:20px;
          border-radius:10px;margin:24px 0;">
          <h2 style="color:${color};margin:0;">
            Status: ${label}
          </h2>
        </div>

        <div style="background:#f3f4f6;padding:24px;border-radius:10px;">
          <p><strong>From:</strong> ${startDate}</p>
          <p><strong>To:</strong> ${endDate}</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>

        <p style="color:#6b7280;font-size:14px;margin-top:24px;">
          ${
            isApproved
              ? "Enjoy your time off. Your leave has been recorded in the system."
              : "If you have questions about this decision, please contact your manager or HR team."
          }
        </p>
      </td>
    </tr>
  `);

  return sendEmail({
    to: toEmail,
    subject: `Leave Request ${label} - RoleSphere`,
    html,
    text: `Hi ${recipientName || toEmail}, your leave request from ${startDate} to ${endDate} has been ${normalizedStatus}.`,
    type: "Leave status email",
  });
};

// ============================================================
// 6. ACCOUNT APPROVED / REJECTED EMAIL
// ============================================================

const sendAccountStatusEmail = async (
  toEmail,
  recipientName,
  role,
  status
) => {
  if (!toEmail || typeof toEmail !== "string") {
    throw new Error("A valid recipient email address is required.");
  }

  const normalizedStatus = String(status || "").toLowerCase();

  if (!["approved", "rejected"].includes(normalizedStatus)) {
    throw new Error(`Invalid account status: ${status}`);
  }

  const isApproved = normalizedStatus === "approved";
  const label = isApproved ? "Approved" : "Rejected";
  const color = isApproved ? "#16a34a" : "#dc2626";
  const background = isApproved ? "#f0fdf4" : "#fef2f2";

  const name = escapeHtml(recipientName || toEmail);
  const safeRole = escapeHtml(role || "User");

  const html = wrapEmail(`
    <tr>
      <td style="padding:40px;">
        <h1 style="color:#111827;font-size:24px;">
          ${isApproved ? "🎉 Account Approved" : "❌ Account Rejected"}
        </h1>

        <p style="color:#6b7280;font-size:15px;line-height:1.6;">
          Hi <strong>${name}</strong>, your registration as a
          <strong>${safeRole}</strong> on RoleSphere has been
          reviewed by the Admin.
        </p>

        <div style="background:${background};padding:20px;
          border-radius:10px;margin:24px 0;">
          <h2 style="color:${color};margin:0;">
            Status: ${label}
          </h2>
        </div>

        ${
          isApproved
            ? `
              <p style="color:#374151;font-size:15px;line-height:1.6;">
                Your account is now active. You can log in to
                RoleSphere and start using the platform.
              </p>

              <div style="background:#eff6ff;padding:16px;
                border-left:4px solid #3b82f6;border-radius:8px;">
                <p style="color:#1e40af;font-size:13px;margin:0;">
                  Use the email address and password you registered
                  with to log in.
                </p>
              </div>
            `
            : `
              <p style="color:#374151;font-size:15px;line-height:1.6;">
                Unfortunately, your account registration was not
                approved at this time.
              </p>

              <p style="color:#6b7280;font-size:14px;">
                If you believe this is a mistake, please contact
                your administrator.
              </p>
            `
        }
      </td>
    </tr>
  `);

  return sendEmail({
    to: toEmail,
    subject: `Your RoleSphere Account Has Been ${label}`,
    html,
    text: `Hi ${recipientName || toEmail}, your registration as a ${role || "User"} on RoleSphere has been ${normalizedStatus}.`,
    type: isApproved ? "Approval email" : "Rejection email",
  });
};

// ============================================================
// 7. TEAM WELCOME EMAIL
// ============================================================

const sendTeamWelcomeEmail = async (
  toEmail,
  employeeName,
  managerName
) => {
  const name = escapeHtml(employeeName || toEmail);
  const manager = escapeHtml(managerName || "your manager");

  const html = wrapEmail(`
    <tr>
      <td style="padding:40px;">
        <h1 style="color:#111827;font-size:24px;">
          👋 Welcome to the Team!
        </h1>

        <p style="color:#6b7280;font-size:15px;line-height:1.6;">
          Hi <strong>${name}</strong>, you have been added to
          <strong>${manager}</strong>'s team on RoleSphere.
        </p>

        <div style="background:#eff6ff;padding:24px;
          border-radius:10px;margin:24px 0;">
          <p style="color:#6b7280;font-size:12px;">YOUR MANAGER</p>
          <h2 style="color:#1e40af;">${manager}</h2>
        </div>

        <p style="color:#374151;font-size:14px;">
          Log in to your RoleSphere dashboard to view your team,
          receive tasks, and submit progress reports.
        </p>
      </td>
    </tr>
  `);

  return sendEmail({
    to: toEmail,
    subject: `Welcome to ${managerName || "Your Team"}'s Team - RoleSphere`,
    html,
    text: `Hi ${employeeName || toEmail}, you have been added to ${managerName || "your manager"}'s team on RoleSphere.`,
    type: "Team welcome email",
  });
};

// ============================================================
// 8. EMPLOYEE REMOVAL NOTICE EMAIL
// ============================================================

const sendRemovalNoticeEmail = async (
  toEmail,
  employeeName,
  managerName,
  reason
) => {
  const name = escapeHtml(employeeName || toEmail);
  const manager = escapeHtml(managerName || "your manager");
  const safeReason = escapeHtml(reason || "No reason provided.");

  const html = wrapEmail(`
    <tr>
      <td style="padding:40px;">
        <div style="background:#fef2f2;padding:12px 16px;
          border-left:4px solid #ef4444;border-radius:8px;">
          <p style="color:#991b1b;font-size:13px;font-weight:600;">
            TEAM REMOVAL NOTICE
          </p>
        </div>

        <h1 style="color:#111827;font-size:24px;">
          Hi ${name},
        </h1>

        <p style="color:#6b7280;font-size:15px;line-height:1.6;">
          You have been removed from <strong>${manager}</strong>'s
          team on RoleSphere.
        </p>

        <div style="background:#f3f4f6;padding:24px;
          border-radius:10px;margin:24px 0;">
          <p><strong>Manager:</strong> ${manager}</p>
          <p><strong>Reason:</strong> ${safeReason}</p>
        </div>

        <p style="color:#6b7280;font-size:14px;">
          Please log in to your RoleSphere dashboard for further
          information. If you have questions, contact your HR team.
        </p>
      </td>
    </tr>
  `);

  return sendEmail({
    to: toEmail,
    subject: `Team Removal Notice - RoleSphere`,
    html,
    text: `Hi ${employeeName || toEmail}, you have been removed from ${managerName || "your manager"}'s team. Reason: ${reason || "Not provided"}.`,
    type: "Employee removal email",
  });
};

// ============================================================
// 9. EXPORT ALL EMAIL FUNCTIONS
// ============================================================

module.exports = {
  sendPasswordResetEmail,
  sendTaskAssignedEmail,
  sendLeaveStatusEmail,
  sendAccountStatusEmail,
  sendTeamWelcomeEmail,
  sendRemovalNoticeEmail,
};
