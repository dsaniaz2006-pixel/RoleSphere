const nodemailer = require("nodemailer");

/**
 * Creates a nodemailer transporter from environment variables.
 * Supports Gmail (EMAIL_SERVICE=gmail) or any SMTP provider.
 *
 * Required .env variables:
 *   EMAIL_SERVICE  - e.g. "gmail" or leave blank for generic SMTP
 *   EMAIL_HOST     - SMTP host (only for generic SMTP)
 *   EMAIL_PORT     - SMTP port (only for generic SMTP, default 587)
 *   EMAIL_USER     - Your email address / SMTP username
 *   EMAIL_PASS     - Your email password or App Password
 *   EMAIL_FROM     - Display name + address e.g. "RoleSphere <no-reply@example.com>"
 */
const createTransporter = () => {
  if (process.env.EMAIL_SERVICE) {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: parseInt(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// ─── Shared header/footer HTML snippets ──────────────────────────────────────

const emailHeader = `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#4f46e5;padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold;color:#fff;">R</div>
                <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">RoleSphere</span>
              </div>
            </td>
          </tr>
`;

const emailFooter = `
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© 2024 RoleSphere. All rights reserved.</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">This is an automated email, please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

// ─── 1. Password Reset ────────────────────────────────────────────────────────

/**
 * Sends a password reset email.
 * @param {string} toEmail   - Recipient's email address
 * @param {string} resetLink - Full URL for the password reset page
 */
const sendPasswordResetEmail = async (toEmail, resetLink) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: "Password Reset Request — RoleSphere",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter',Arial,sans-serif;">
        ${emailHeader}
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Reset Your Password</h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                We received a request to reset the password for your RoleSphere account. Click the button below to choose a new password.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${resetLink}"
                   style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">Or copy and paste this link into your browser:</p>
              <p style="margin:0 0 24px;word-break:break-all;">
                <a href="${resetLink}" style="color:#4f46e5;font-size:13px;">${resetLink}</a>
              </p>
              <div style="background:#fef3c7;border-radius:8px;padding:16px;border-left:4px solid #f59e0b;">
                <p style="margin:0;color:#92400e;font-size:13px;">
                  ⚠️ This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>
        ${emailFooter}
      </body>
      </html>
    `,
  });
};

// ─── 2. Task Assigned ─────────────────────────────────────────────────────────

/**
 * Sends an email to an employee (or manager) when a new task is assigned to them.
 * @param {string} toEmail      - Recipient's email address
 * @param {string} recipientName - Recipient's name
 * @param {object} task         - Task details: { title, description, deadline }
 * @param {string} assignedBy   - Name of the person who assigned the task (e.g. "Manager John" or "HR Team")
 */
const sendTaskAssignedEmail = async (toEmail, recipientName, task, assignedBy) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

  const deadlineFormatted = new Date(task.deadline).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `New Task Assigned: ${task.title} — RoleSphere`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Task Assigned</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter',Arial,sans-serif;">
        ${emailHeader}
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">New Task Assigned</h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Hi <strong>${recipientName}</strong>, a new task has been assigned to you by <strong>${assignedBy}</strong>.
              </p>

              <div style="background:#f3f4f6;border-radius:10px;padding:24px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:12px;">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Task Title</span><br>
                      <span style="font-size:16px;font-weight:700;color:#111827;">${task.title}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:12px;">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Description</span><br>
                      <span style="font-size:14px;color:#374151;line-height:1.6;">${task.description}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Deadline</span><br>
                      <span style="font-size:14px;font-weight:600;color:#dc2626;">📅 ${deadlineFormatted}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="background:#eff6ff;border-radius:8px;padding:16px;border-left:4px solid #3b82f6;">
                <p style="margin:0;color:#1e40af;font-size:13px;">
                  💡 Please log in to your RoleSphere dashboard to view full task details and submit your work before the deadline.
                </p>
              </div>
            </td>
          </tr>
        ${emailFooter}
      </body>
      </html>
    `,
  });
};

// ─── 3. Leave Approved / Rejected ────────────────────────────────────────────

/**
 * Sends an email to an employee/HR when their leave request is approved or rejected.
 * @param {string} toEmail       - Recipient's email address
 * @param {string} recipientName - Recipient's name (optional, falls back to email)
 * @param {object} leave         - Leave details: { startDate, endDate, reason, status }
 * @param {string} decidedBy     - Name or role of whoever approved/rejected (e.g. "Manager" or "Admin")
 */
const sendLeaveStatusEmail = async (toEmail, recipientName, leave, decidedBy) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

  const isApproved = leave.status === "Approved";
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  };
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  const statusBg = isApproved ? "#f0fdf4" : "#fef2f2";
  const statusBorder = isApproved ? "#86efac" : "#fca5a5";
  const statusEmoji = isApproved ? "✅" : "❌";
  const statusLabel = isApproved ? "Approved" : "Rejected";

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Leave Request ${statusLabel} — RoleSphere`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Leave Request ${statusLabel}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter',Arial,sans-serif;">
        ${emailHeader}
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">
                ${statusEmoji} Leave Request ${statusLabel}
              </h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Hi <strong>${recipientName || toEmail}</strong>, your leave request has been reviewed by <strong>${decidedBy}</strong>.
              </p>

              <div style="background:${statusBg};border-radius:10px;padding:20px 24px;margin-bottom:24px;border:1px solid ${statusBorder};">
                <p style="margin:0 0 4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${statusColor};">
                  Status: ${statusLabel}
                </p>
              </div>

              <div style="background:#f3f4f6;border-radius:10px;padding:24px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="padding-bottom:12px;">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">From</span><br>
                      <span style="font-size:15px;font-weight:600;color:#111827;">${formatDate(leave.startDate)}</span>
                    </td>
                    <td width="50%" style="padding-bottom:12px;">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">To</span><br>
                      <span style="font-size:15px;font-weight:600;color:#111827;">${formatDate(leave.endDate)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Reason</span><br>
                      <span style="font-size:14px;color:#374151;line-height:1.6;">${leave.reason}</span>
                    </td>
                  </tr>
                </table>
              </div>

              ${
                !isApproved
                  ? `<div style="background:#fef3c7;border-radius:8px;padding:16px;border-left:4px solid #f59e0b;">
                       <p style="margin:0;color:#92400e;font-size:13px;">
                         If you have questions about this decision, please reach out to your manager or HR team directly.
                       </p>
                     </div>`
                  : `<div style="background:#eff6ff;border-radius:8px;padding:16px;border-left:4px solid #3b82f6;">
                       <p style="margin:0;color:#1e40af;font-size:13px;">
                         Enjoy your time off! Your leave has been recorded in the system.
                       </p>
                     </div>`
              }
            </td>
          </tr>
        ${emailFooter}
      </body>
      </html>
    `,
  });
};

// ─── 4. Account Approved / Rejected ──────────────────────────────────────────

/**
 * Sends an email when an admin approves or rejects a new user account.
 * @param {string} toEmail       - Recipient's email address
 * @param {string} recipientName - Recipient's name
 * @param {string} role          - Their role: "Employee", "Manager", or "HR"
 * @param {string} status        - "approved" or "rejected"
 */
const sendAccountStatusEmail = async (toEmail, recipientName, role, status) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

  const isApproved = status === "approved";
  const statusLabel = isApproved ? "Approved" : "Rejected";
  const statusEmoji = isApproved ? "🎉" : "❌";
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  const statusBg = isApproved ? "#f0fdf4" : "#fef2f2";
  const statusBorder = isApproved ? "#86efac" : "#fca5a5";

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Your RoleSphere Account Has Been ${statusLabel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account ${statusLabel}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter',Arial,sans-serif;">
        ${emailHeader}
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">
                ${statusEmoji} Account ${statusLabel}
              </h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Hi <strong>${recipientName}</strong>, your registration as a <strong>${role}</strong> on RoleSphere has been reviewed by the Admin.
              </p>

              <div style="background:${statusBg};border-radius:10px;padding:20px 24px;margin-bottom:24px;border:1px solid ${statusBorder};">
                <p style="margin:0;font-size:15px;font-weight:700;color:${statusColor};">
                  Status: ${statusLabel}
                </p>
              </div>

              ${
                isApproved
                  ? `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                       Your account is now active. You can log in to RoleSphere and start using the platform.
                     </p>
                     <div style="background:#eff6ff;border-radius:8px;padding:16px;border-left:4px solid #3b82f6;">
                       <p style="margin:0;color:#1e40af;font-size:13px;">
                         💡 Use the email address and password you registered with to log in.
                       </p>
                     </div>`
                  : `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                       Unfortunately, your account registration was not approved at this time.
                       If you believe this is a mistake, please contact your administrator.
                     </p>`
              }
            </td>
          </tr>
        ${emailFooter}
      </body>
      </html>
    `,
  });
};


// ─── 5. Team Welcome ─────────────────────────────────────────────────────────

/**
 * Sends a welcome email when an employee is added to a manager's team.
 * @param {string} toEmail      - Employee's email address
 * @param {string} employeeName - Employee's name
 * @param {string} managerName  - Manager's name
 */
const sendTeamWelcomeEmail = async (toEmail, employeeName, managerName) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `You've been added to ${managerName}'s team — RoleSphere`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Your Team</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter',Arial,sans-serif;">
        ${emailHeader}
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">
                👋 Welcome to the Team!
              </h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                Hi <strong>${employeeName}</strong>, you've been added to <strong>${managerName}</strong>'s team on RoleSphere.
              </p>

              <div style="background:#eff6ff;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #bfdbfe;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:12px;">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Your Manager</span><br>
                      <span style="font-size:18px;font-weight:700;color:#1e40af;">${managerName}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="background:#f3f4f6;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">What to expect:</p>
                <ul style="margin:0;padding-left:20px;color:#6b7280;font-size:14px;line-height:2;">
                  <li>Your manager will assign tasks to you through the dashboard</li>
                  <li>You'll receive an email each time a new task is assigned</li>
                  <li>Submit your daily progress reports on time</li>
                  <li>Apply for leave through your dashboard — your manager will review it</li>
                </ul>
              </div>

              <div style="background:#f0fdf4;border-radius:8px;padding:16px;border-left:4px solid #86efac;">
                <p style="margin:0;color:#166534;font-size:13px;">
                  💡 Log in to your RoleSphere dashboard to see your team details and get started.
                </p>
              </div>
            </td>
          </tr>
        ${emailFooter}
      </body>
      </html>
    `,
  });
};

// ─── 6. Employee Removal Notice ──────────────────────────────────────────────

/**
 * Sends an email to an employee when their manager removes them from the team.
 * @param {string} toEmail      - Employee's email address
 * @param {string} employeeName - Employee's name
 * @param {string} managerName  - Manager's name
 * @param {string} reason       - Reason given for removal
 */
const sendRemovalNoticeEmail = async (toEmail, employeeName, managerName, reason) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || `RoleSphere <${process.env.EMAIL_USER}>`;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Important: You have been removed from ${managerName}'s team — RoleSphere`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Team Removal Notice</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Inter',Arial,sans-serif;">
        ${emailHeader}
          <tr>
            <td style="padding:40px;">
              <div style="background:#fef2f2;border-radius:8px;padding:12px 16px;margin-bottom:24px;border-left:4px solid #ef4444;">
                <p style="margin:0;color:#991b1b;font-size:13px;font-weight:600;">⚠️ TEAM REMOVAL NOTICE</p>
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Hi ${employeeName},</h1>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                You have been removed from <strong>${managerName}</strong>'s team on RoleSphere.
              </p>

              <div style="background:#f3f4f6;border-radius:10px;padding:24px;margin-bottom:24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:12px;">
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Manager</span><br>
                      <span style="font-size:15px;font-weight:600;color:#111827;">${managerName}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Reason Given</span><br>
                      <span style="font-size:14px;color:#374151;line-height:1.6;">${reason}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="background:#fffbeb;border-radius:8px;padding:16px;border-left:4px solid #f59e0b;margin-bottom:16px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                  <strong>What can you do?</strong><br>
                  Log in to your RoleSphere dashboard. You will see a notification where you can either:
                </p>
                <ul style="margin:8px 0 0;padding-left:20px;color:#92400e;font-size:13px;line-height:1.8;">
                  <li>Accept the removal</li>
                  <li>File a complaint to HR with supporting documents</li>
                </ul>
              </div>
            </td>
          </tr>
        ${emailFooter}
      </body>
      </html>
    `,
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendTaskAssignedEmail,
  sendLeaveStatusEmail,
  sendAccountStatusEmail,
  sendTeamWelcomeEmail,
  sendRemovalNoticeEmail,
};
