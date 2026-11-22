// ──────────────────────────────────────────────────────────────────────────────
// reportRoutes.js — mounted at /api/reports
//
// Exports: /attendance /leaves /tasks /performance /reviews /summary
// Formats: excel (default) | pdf   (/summary is Excel only — multi-sheet)
// Access:  Admin or HR session only
// ──────────────────────────────────────────────────────────────────────────────

const express     = require("express");
const ExcelJS     = require("exceljs");
const PDFDocument = require("pdfkit");

const Attendance        = require("../models/Attendance");
const Employee          = require("../models/Employee");
const EmployeeLeave     = require("../models/EmployeeLeave");
const WorkReport        = require("../models/WorkReport");
const Task              = require("../models/Task");
const Manager           = require("../models/Manager");
const HR                = require("../models/HR");
const PerformanceReview = require("../models/PerformanceReview");

const router = express.Router();

// ── Auth guard — Admin and HR only ────────────────────────────────────────────
function requireAdminOrHR(req, res, next) {
  const role = req.session?.admin ? "Admin" : req.session?.user?.role;
  if (role === "Admin" || role === "HR") return next();
  return res.status(403).json({ success: false, error: "Admin or HR access required" });
}

// ── Input validation ──────────────────────────────────────────────────────────

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Returns the month string if valid, else null. Never trust it into a regex.
function cleanMonth(raw) {
  return typeof raw === "string" && MONTH_RE.test(raw) ? raw : null;
}

// Strip anything that could break a Content-Disposition header or a filesystem
function safeFilePart(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) || "all";
}

// Dates are stored as "YYYY-MM-DD" strings, which sort lexicographically.
// So a plain range beats a regex: no escaping, no ReDoS, and it uses the index.
function monthStringRange(month) {
  return { $gte: `${month}-01`, $lte: `${month}-31` };
}

// For real Date fields (Task.deadline, PerformanceReview.createdAt)
function monthDateRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
}

const VALID_ROLES = ["Employee", "HR", "Manager"];
const MODEL_BY_ROLE = { Employee, HR, Manager };

// ── Shared formatting helpers ─────────────────────────────────────────────────

// 1 → A, 26 → Z, 27 → AA. The old version used String.fromCharCode(64 + n),
// which produced garbage past 26 columns.
const { buildSummaryWorkbook, colLetter, titleCase, fmtDate, fillSheet, newWorkbook } = require('../services/reportBuilder');

// ── Response senders ──────────────────────────────────────────────────────────
//
// Both senders buffer the document BEFORE touching res. The old code set
// Content-Type/Disposition and then streamed, so any mid-stream throw landed in
// a catch block that called res.status(500).json() on an already-committed
// response — ERR_HTTP_HEADERS_SENT, and the client got a truncated file with a
// 200. Buffering means either a clean file or a clean JSON error, never both.

function sendBuffer(res, buffer, contentType, filename) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(buffer);
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function sendExcel(res, workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  sendBuffer(res, Buffer.from(buffer), XLSX_MIME, filename);
}

function sendPDF(res, buffer, filename) {
  sendBuffer(res, buffer, "application/pdf", filename);
}

// Single error exit for every route. Guards against a second write.
function failReport(res, err, label) {
  console.error(`[reports] ${label} failed:`, err);
  if (res.headersSent) return res.end();
  return res.status(500).json({ success: false, error: `Failed to generate ${label} report` });
}

// ── PDF table renderer ────────────────────────────────────────────────────────

const PDF_OPTS  = { margin: 40, size: "A4", layout: "landscape", bufferPages: true };
const ROW_H     = 20;
const HEADER_H  = 26;
const BODY_SIZE = 7;

// Truncate to fit one line inside maxWidth. The previous version relied on
// pdfkit's `ellipsis` with wrapping enabled, so a long "Reason" cell wrapped to
// three lines inside a 22pt row and overlapped the two rows below it.
function fitText(doc, value, maxWidth) {
  let s = String(value ?? "-").replace(/\s+/g, " ").trim() || "-";
  if (doc.widthOfString(s) <= maxWidth) return s;
  // Coarse cut first so we don't measure hundreds of times on long strings
  const approxChars = Math.max(1, Math.floor(maxWidth / (BODY_SIZE * 0.42)));
  s = s.slice(0, approxChars + 4);
  while (s.length > 1 && doc.widthOfString(s + "…") > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

function drawTableHeader(doc, headers, colWidth, pageWidth, y) {
  doc.rect(40, y, pageWidth, HEADER_H).fill("#6366F1");
  doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
  headers.forEach((h, i) => {
    const x = 40 + i * colWidth + 4;
    doc.text(fitText(doc, h, colWidth - 8), x, y + 8, {
      width: colWidth - 8, height: HEADER_H - 8, lineBreak: false, ellipsis: true
    });
  });
  return y + HEADER_H;
}

function renderPDF(title, headers, rows) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument(PDF_OPTS);
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      const pageWidth = doc.page.width - 80;

      // Brand bar
      doc.rect(0, 0, doc.page.width, 70).fill("#4F46E5");
      doc.fillColor("white").fontSize(18).font("Helvetica-Bold").text("RoleSphere", 40, 15);
      doc.fontSize(12).font("Helvetica")
         .text(fitText(doc, title, pageWidth), 40, 42, { width: pageWidth, lineBreak: false });

      doc.fillColor("#6B7280").fontSize(9).font("Helvetica")
         .text(`Generated: ${new Date().toLocaleString("en-IN")}   |   Records: ${rows.length}`, 40, 78);

      if (rows.length === 0 || headers.length === 0) {
        doc.fillColor("#374151").fontSize(12).text("No records found for this filter.", 40, 110);
        doc.end();
        return;
      }

      const colWidth = Math.floor(pageWidth / headers.length);
      let y = drawTableHeader(doc, headers, colWidth, pageWidth, 98);

      rows.forEach((row, rowIdx) => {
        if (y + ROW_H > doc.page.height - 50) {
          doc.addPage(PDF_OPTS);
          y = drawTableHeader(doc, headers, colWidth, pageWidth, 40);
        }
        doc.rect(40, y, pageWidth, ROW_H).fill(rowIdx % 2 === 0 ? "#F8F9FF" : "#FFFFFF");
        doc.rect(40, y, pageWidth, ROW_H).stroke("#E5E7EB");
        doc.fillColor("#374151").fontSize(BODY_SIZE).font("Helvetica");
        headers.forEach((h, i) => {
          const x = 40 + i * colWidth + 4;
          doc.text(fitText(doc, row[h], colWidth - 8), x, y + 6, {
            width: colWidth - 8, height: ROW_H - 6, lineBreak: false, ellipsis: true
          });
        });
        y += ROW_H;
      });

      // Footer on every page, not just the last one
      const range = doc.bufferedPageRange();
      for (let p = range.start; p < range.start + range.count; p++) {
        doc.switchToPage(p);
        doc.fillColor("#9CA3AF").fontSize(8).font("Helvetica").text(
          `© RoleSphere — Confidential          Page ${p - range.start + 1} of ${range.count}`,
          40, doc.page.height - 28, { width: doc.page.width - 80, align: "center", lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Every route declares its headers explicitly. The old code derived them from
// Object.keys(rows[0]), so an empty result set produced a sheet whose only
// column was literally "No Data".
async function deliver(res, { format, title, headers, rows, sheetName, baseName, decorate }) {
  if (format === "pdf") {
    const buffer = await renderPDF(title, headers, rows);
    return sendPDF(res, buffer, `${baseName}.pdf`);
  }
  const wb = newWorkbook();
  fillSheet(wb.addWorksheet(sheetName), title, headers, rows, decorate);
  return sendExcel(res, wb, `${baseName}.xlsx`);
}

function pickFormat(raw) {
  return raw === "pdf" ? "pdf" : "excel";
}

// ── GET /api/reports/attendance ───────────────────────────────────────────────
// ?month=YYYY-MM  &role=Employee|HR|Manager  &userId=<id>  &format=excel|pdf
const ATTENDANCE_HEADERS = [
  "Name", "Email", "Department", "Date", "Month", "Status", "Check In", "Check Out", "Late"
];

router.get("/attendance", requireAdminOrHR, async (req, res) => {
  try {
    const format = pickFormat(req.query.format);
    const month  = cleanMonth(req.query.month);
    // The old version hardcoded userModel:"Employee", so HR and Manager
    // attendance was silently unexportable.
    const role   = VALID_ROLES.includes(req.query.role) ? req.query.role : "Employee";

    if (req.query.month && !month) {
      return res.status(400).json({ success: false, error: "month must be YYYY-MM" });
    }

    const query = { userModel: role };
    if (month) query.month = month;
    if (req.query.userId && /^[a-f\d]{24}$/i.test(req.query.userId)) {
      query.userId = req.query.userId;
    }

    const records = await Attendance.find(query).sort({ date: 1 }).lean();

    const ids     = [...new Set(records.map(r => String(r.userId)))];
    const people  = await MODEL_BY_ROLE[role]
      .find({ _id: { $in: ids } })
      .select("name email department")
      .lean();
    const byId = new Map(people.map(p => [String(p._id), p]));

    const rows = records.map(r => {
      const p = byId.get(String(r.userId)) || {};
      return {
        "Name":       p.name  || "Unknown (deleted user)",
        "Email":      p.email || "-",
        "Department": p.department || "-",
        "Date":       r.date  || "-",
        "Month":      r.month || "-",
        // status has a schema default but legacy docs inserted directly can
        // still be missing it — the old r.status.charAt(0) threw on those.
        "Status":     titleCase(r.status),
        "Check In":   r.checkIn  || "-",
        "Check Out":  r.checkOut || "-",
        "Late":       r.isLate ? "Yes" : "No"
      };
    });

    const title    = `${role} Attendance Report${month ? " — " + month : " — all time"}`;
    const baseName = `attendance_${safeFilePart(role)}_${safeFilePart(month)}_${Date.now()}`;

    if (format === "excel") {
      const wb = newWorkbook();
      const ws = wb.addWorksheet("Attendance");
      fillSheet(ws, title, ATTENDANCE_HEADERS, rows, (dataRow, row) => {
        const cell = dataRow.getCell(ATTENDANCE_HEADERS.indexOf("Status") + 1);
        if (row["Status"] === "Present") cell.font = { color: { argb: "FF16A34A" }, bold: true };
        if (row["Status"] === "Absent")  cell.font = { color: { argb: "FFDC2626" }, bold: true };
        if (row["Status"] === "Holiday") cell.font = { color: { argb: "FF2563EB" }, bold: true };
      });

      const count = (s) => rows.filter(r => r["Status"] === s).length;
      ws.addRow([]);
      const summary = ws.addRow([
        "SUMMARY", `Records: ${rows.length}`, `Present: ${count("Present")}`,
        `Absent: ${count("Absent")}`, `Holiday: ${count("Holiday")}`,
        `Late: ${rows.filter(r => r["Late"] === "Yes").length}`
      ]);
      summary.font = { bold: true };
      return await sendExcel(res, wb, `${baseName}.xlsx`);
    }

    return await deliver(res, {
      format, title, headers: ATTENDANCE_HEADERS, rows,
      sheetName: "Attendance", baseName
    });
  } catch (err) {
    return failReport(res, err, "attendance");
  }
});

// ── GET /api/reports/leaves ───────────────────────────────────────────────────
// ?month=YYYY-MM  &status=Pending|Approved|Rejected  &format=excel|pdf
const LEAVE_STATUSES = ["Pending", "Approved", "Rejected"];
const LEAVE_HEADERS  = [
  "Name", "Email", "Role", "Leave Type", "From", "To",
  "Days", "Reason", "Status", "Applied On", "Cancelled"
];

router.get("/leaves", requireAdminOrHR, async (req, res) => {
  try {
    const format = pickFormat(req.query.format);
    const month  = cleanMonth(req.query.month);
    const status = LEAVE_STATUSES.includes(req.query.status) ? req.query.status : null;

    if (req.query.month && !month) {
      return res.status(400).json({ success: false, error: "month must be YYYY-MM" });
    }

    const query = {};
    if (status) query.status = status;
    // Range comparison on the "YYYY-MM-DD" string. The old code interpolated
    // req.query.month straight into a $regex — unescaped user input in a regex.
    if (month) query.startDate = monthStringRange(month);

    const leaves = await EmployeeLeave.find(query).sort({ createdAt: -1 }).lean();

    // Resolve display names by email across both models that can apply
    const emails = [...new Set(leaves.map(l => l.email).filter(Boolean))];
    const [emps, hrs] = await Promise.all([
      Employee.find({ email: { $in: emails } }).select("name email").lean(),
      HR.find({ email: { $in: emails } }).select("name email").lean()
    ]);
    const nameByEmail = new Map([...emps, ...hrs].map(p => [p.email, p.name]));

    const rows = leaves.map(l => ({
      "Name":       nameByEmail.get(l.email) || "-",
      "Email":      l.email || "-",
      "Role":       l.role  || "Employee",
      "Leave Type": l.leaveType || "Annual",
      "From":       l.startDate || "-",
      "To":         l.endDate   || "-",
      "Days":       l.totalDays ?? "-",
      "Reason":     l.reason    || "-",
      "Status":     l.status    || "Pending",
      "Applied On": fmtDate(l.createdAt),
      "Cancelled":  l.cancelledAt ? fmtDate(l.cancelledAt) : "-"
    }));

    const title = `Leave Report${month ? " — " + month : " — all time"}${status ? " (" + status + ")" : ""}`;

    return await deliver(res, {
      format, title, headers: LEAVE_HEADERS, rows,
      sheetName: "Leaves",
      baseName: `leaves_${safeFilePart(month)}_${safeFilePart(status)}_${Date.now()}`,
      decorate: (dataRow, row) => {
        const cell = dataRow.getCell(LEAVE_HEADERS.indexOf("Status") + 1);
        if (row["Status"] === "Approved") cell.font = { color: { argb: "FF16A34A" }, bold: true };
        if (row["Status"] === "Rejected") cell.font = { color: { argb: "FFDC2626" }, bold: true };
        if (row["Status"] === "Pending")  cell.font = { color: { argb: "FFD97706" }, bold: true };
      }
    });
  } catch (err) {
    return failReport(res, err, "leave");
  }
});

// ── GET /api/reports/tasks ────────────────────────────────────────────────────
// ?month=YYYY-MM (filters on deadline)  &status=...  &format=excel|pdf
const TASK_HEADERS = [
  "Title", "Assigned To", "Assignee Type", "Assignee Email",
  "Manager", "Deadline", "Status", "Submitted At", "Has Submission", "Feedback"
];

router.get("/tasks", requireAdminOrHR, async (req, res) => {
  try {
    const format = pickFormat(req.query.format);
    const month  = cleanMonth(req.query.month);
    const status = typeof req.query.status === "string" && /^[A-Za-z]{1,20}$/.test(req.query.status)
      ? req.query.status : null;

    if (req.query.month && !month) {
      return res.status(400).json({ success: false, error: "month must be YYYY-MM" });
    }

    const query = {};
    if (month)  query.deadline = monthDateRange(month);   // real Date field
    if (status) query.status   = status;

    const tasks = await Task.find(query).sort({ deadline: 1 }).lean();

    const empIds = [...new Set(tasks.map(t => t.employeeId).filter(Boolean).map(String))];
    const mgrIds = [...new Set(tasks.map(t => t.managerId).filter(Boolean).map(String))];
    const [emps, mgrs] = await Promise.all([
      Employee.find({ _id: { $in: empIds } }).select("name email").lean(),
      Manager.find({ _id: { $in: mgrIds } }).select("name email").lean()
    ]);
    const empById = new Map(emps.map(e => [String(e._id), e]));
    const mgrById = new Map(mgrs.map(m => [String(m._id), m]));

    const rows = tasks.map(t => {
      // assignedToModel decides who the task belongs to; managerId doubles as
      // "the manager who assigned it" for Employee tasks.
      const toManager = t.assignedToModel === "Manager";
      const mgr       = t.managerId ? mgrById.get(String(t.managerId)) : null;
      const emp       = t.employeeId ? empById.get(String(t.employeeId)) : null;
      const assignee  = toManager ? mgr : emp;

      return {
        "Title":          t.title || "-",
        "Assigned To":    assignee?.name  || "Unassigned",
        "Assignee Type":  t.assignedToModel || "Employee",
        "Assignee Email": assignee?.email || "-",
        "Manager":        toManager ? "HR / Admin" : (mgr?.name || "-"),
        "Deadline":       fmtDate(t.deadline),
        "Status":         t.status || "Pending",
        "Submitted At":   fmtDate(t.submittedAt),
        "Has Submission": t.submission ? "Yes" : "No",
        "Feedback":       t.managerFeedback || "-"
      };
    });

    const title = `Task Report${month ? " — deadlines in " + month : " — all time"}${status ? " (" + status + ")" : ""}`;

    return await deliver(res, {
      format, title, headers: TASK_HEADERS, rows,
      sheetName: "Tasks",
      baseName: `tasks_${safeFilePart(month)}_${safeFilePart(status)}_${Date.now()}`,
      decorate: (dataRow, row) => {
        const cell = dataRow.getCell(TASK_HEADERS.indexOf("Status") + 1);
        const map  = { Approved: "FF16A34A", Rejected: "FFDC2626", Submitted: "FF2563EB", Pending: "FFD97706" };
        if (map[row["Status"]]) cell.font = { color: { argb: map[row["Status"]] }, bold: true };
      }
    });
  } catch (err) {
    return failReport(res, err, "task");
  }
});

// ── GET /api/reports/performance ───────────────────────────────────────────────
// Task-completion scorecard per employee. NOTE: this is derived activity data,
// not the manager-written reviews — those live at /api/reports/reviews.
//
// The old implementation ran Task.find + WorkReport.find inside a
// Promise.all(employees.map(...)) — 2N queries fired at once. 200 employees
// meant 400 concurrent queries and a connection-pool stall. Now it is 4 total.
const PERF_HEADERS = [
  "Name", "Email", "Department", "Manager", "Total Tasks", "Approved", "Submitted",
  "Pending", "Rejected", "Completion Rate", "Reports Filed", "Reports Approved", "Avg Review Rating"
];

router.get("/performance", requireAdminOrHR, async (req, res) => {
  try {
    const format = pickFormat(req.query.format);

    const employees = await Employee.find({ isApproved: true })
      .select("name email department managerId").lean();
    const empIds = employees.map(e => e._id);

    const [managers, taskAgg, reportAgg, reviewAgg] = await Promise.all([
      Manager.find({ _id: { $in: employees.map(e => e.managerId).filter(Boolean) } })
        .select("name").lean(),
      Task.aggregate([
        { $match: { employeeId: { $in: empIds } } },
        { $group: { _id: { emp: "$employeeId", status: "$status" }, n: { $sum: 1 } } }
      ]),
      WorkReport.aggregate([
        { $match: { employeeEmail: { $in: employees.map(e => e.email) } } },
        { $group: { _id: { email: "$employeeEmail", status: "$status" }, n: { $sum: 1 } } }
      ]),
      PerformanceReview.aggregate([
        { $match: { employeeId: { $in: empIds } } },
        { $group: { _id: "$employeeId", avg: { $avg: "$rating" }, n: { $sum: 1 } } }
      ])
    ]);

    const mgrName = new Map(managers.map(m => [String(m._id), m.name]));
    const reviewByEmp = new Map(reviewAgg.map(r => [String(r._id), r]));

    // { employeeId: { Approved: 3, Pending: 1, ... } }
    const taskCounts = {};
    for (const row of taskAgg) {
      const key = String(row._id.emp);
      (taskCounts[key] ||= {})[row._id.status || "Pending"] = row.n;
    }
    const reportCounts = {};
    for (const row of reportAgg) {
      const key = row._id.email;
      (reportCounts[key] ||= {})[row._id.status || "Pending"] = row.n;
    }
    const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

    const rows = employees.map(emp => {
      const t         = taskCounts[String(emp._id)] || {};
      const r         = reportCounts[emp.email] || {};
      const total     = sum(t);
      const approved  = t["Approved"] || 0;
      const review    = reviewByEmp.get(String(emp._id));

      return {
        "Name":              emp.name,
        "Email":             emp.email,
        "Department":        emp.department || "-",
        "Manager":           mgrName.get(String(emp.managerId)) || "Unassigned",
        "Total Tasks":       total,
        "Approved":          approved,
        "Submitted":         t["Submitted"] || 0,
        "Pending":           t["Pending"]   || 0,
        "Rejected":          t["Rejected"]  || 0,
        "Completion Rate":   total > 0 ? `${Math.round((approved / total) * 100)}%` : "0%",
        "Reports Filed":     sum(r),
        "Reports Approved":  r["Approved"] || 0,
        "Avg Review Rating": review ? `${review.avg.toFixed(1)} / 5 (${review.n})` : "No reviews"
      };
    });

    rows.sort((a, b) => parseInt(b["Completion Rate"]) - parseInt(a["Completion Rate"]));

    return await deliver(res, {
      format, title: "Employee Performance Scorecard", headers: PERF_HEADERS, rows,
      sheetName: "Performance",
      baseName: `performance_${Date.now()}`,
      decorate: (dataRow, row) => {
        const cell = dataRow.getCell(PERF_HEADERS.indexOf("Completion Rate") + 1);
        const rate = parseInt(row["Completion Rate"]) || 0;
        const argb = rate >= 80 ? "FF16A34A" : rate >= 50 ? "FFD97706" : "FFDC2626";
        cell.font = { color: { argb }, bold: true };
      }
    });
  } catch (err) {
    return failReport(res, err, "performance");
  }
});

// ── GET /api/reports/reviews ──────────────────────────────────────────────────
// The manager-written PerformanceReview records themselves. This did not exist
// before — /performance only ever exported derived task counts, so the reviews
// module had no export path at all.
// ?period=2025-Q2  &month=YYYY-MM (on createdAt)  &format=excel|pdf
const REVIEW_HEADERS = [
  "Employee", "Email", "Department", "Reviewer", "Reviewer Role", "Period", "Rating",
  "Strengths", "Improvements", "Comments", "Goals", "Goals Achieved", "Reviewed On"
];

router.get("/reviews", requireAdminOrHR, async (req, res) => {
  try {
    const format = pickFormat(req.query.format);
    const month  = cleanMonth(req.query.month);
    const period = typeof req.query.period === "string" && /^[A-Za-z0-9-]{1,20}$/.test(req.query.period)
      ? req.query.period : null;

    if (req.query.month && !month) {
      return res.status(400).json({ success: false, error: "month must be YYYY-MM" });
    }

    const query = {};
    if (period) query.period    = period;
    if (month)  query.createdAt = monthDateRange(month);

    const reviews = await PerformanceReview.find(query).sort({ createdAt: -1 }).lean();

    const empIds = [...new Set(reviews.map(r => String(r.employeeId)))];
    const emps   = await Employee.find({ _id: { $in: empIds } })
      .select("name email department").lean();
    const empById = new Map(emps.map(e => [String(e._id), e]));

    const rows = reviews.map(rv => {
      const emp   = empById.get(String(rv.employeeId)) || {};
      const goals = Array.isArray(rv.goals) ? rv.goals : [];
      return {
        "Employee":      emp.name  || "Unknown (deleted employee)",
        "Email":         emp.email || "-",
        "Department":    emp.department || "-",
        "Reviewer":      rv.reviewerName  || "-",
        "Reviewer Role": rv.reviewerModel || "-",
        "Period":        rv.period || "-",
        "Rating":        rv.rating != null ? `${rv.rating} / 5` : "-",
        "Strengths":     rv.strengths    || "-",
        "Improvements":  rv.improvements || "-",
        "Comments":      rv.comments     || "-",
        "Goals":         goals.length
          ? goals.map(g => `${g.description || "?"} [${g.status || "Pending"}]`).join(" | ")
          : "-",
        "Goals Achieved": `${goals.filter(g => g.status === "Achieved").length} / ${goals.length}`,
        "Reviewed On":    fmtDate(rv.createdAt)
      };
    });

    const title = `Performance Reviews${period ? " — " + period : ""}${month ? " — " + month : ""}`;

    return await deliver(res, {
      format, title, headers: REVIEW_HEADERS, rows,
      sheetName: "Reviews",
      baseName: `reviews_${safeFilePart(period || month)}_${Date.now()}`,
      decorate: (dataRow, row) => {
        const cell = dataRow.getCell(REVIEW_HEADERS.indexOf("Rating") + 1);
        const n    = parseFloat(row["Rating"]) || 0;
        const argb = n >= 4 ? "FF16A34A" : n >= 3 ? "FFD97706" : "FFDC2626";
        cell.font  = { color: { argb }, bold: true };
        // Long free-text columns need wrapping or the sheet is unreadable
        ["Strengths", "Improvements", "Comments", "Goals"].forEach(h => {
          dataRow.getCell(REVIEW_HEADERS.indexOf(h) + 1).alignment =
            { wrapText: true, vertical: "top" };
        });
      }
    });
  } catch (err) {
    return failReport(res, err, "reviews");
  }
});

// ── GET /api/reports/summary ──────────────────────────────────────────────────
// One workbook, five sheets. Excel only.
router.get("/summary", requireAdminOrHR, async (req, res) => {
  try {
    const month = cleanMonth(req.query.month);
    if (req.query.month && !month) {
      return res.status(400).json({ success: false, error: "month must be YYYY-MM" });
    }

    const wb = await buildSummaryWorkbook(month);
    return await sendExcel(res, wb, `system_summary_${safeFilePart(month)}_${Date.now()}.xlsx`);
  } catch (err) {
    return failReport(res, err, "summary");
  }
});

module.exports = router;
