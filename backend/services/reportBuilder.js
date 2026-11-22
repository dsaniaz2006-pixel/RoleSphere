const ExcelJS     = require("exceljs");
const Attendance        = require("../models/Attendance");
const Employee          = require("../models/Employee");
const EmployeeLeave     = require("../models/EmployeeLeave");
const WorkReport        = require("../models/WorkReport");
const Task              = require("../models/Task");
const Manager           = require("../models/Manager");
const HR                = require("../models/HR");
const PerformanceReview = require("../models/PerformanceReview");
function monthStringRange(month) {
  return { $gte: `${month}-01`, $lte: `${month}-31` };
}

// For real Date fields (Task.deadline, PerformanceReview.createdAt)
function monthDateRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
}

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function titleCase(s) {
  if (!s) return "-";
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("en-IN");
}

// ── Excel builders ────────────────────────────────────────────────────────────
//
// Contract for every builder below:
//   headers = ["Col A", "Col B"]          (array of strings)
//   rows    = [{ "Col A": 1, "Col B": 2 }] (objects KEYED BY HEADER)
//
// Every lookup is row[header]. The previous version used Object.values(row)[i],
// which silently mismatched whenever the object key order drifted from headers.

function writeSheetHeader(ws, title, headers) {
  const lastCol = colLetter(headers.length);

  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value     = title;
  titleCell.font      = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastCol}2`);
  const metaCell = ws.getCell("A2");
  metaCell.value     = `Generated: ${new Date().toLocaleString("en-IN")}`;
  metaCell.font      = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  metaCell.alignment = { horizontal: "center" };

  const thin = { style: "thin", color: { argb: "FFE5E7EB" } };
  const headerRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value     = h;
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" } };
    cell.alignment = { horizontal: "center", wrapText: true };
    cell.border    = { top: thin, bottom: thin, left: thin, right: thin };
  });
  headerRow.height = 22;
  headerRow.commit?.();
}

function shadeDataRow(row, rowIndex) {
  const color = rowIndex % 2 === 0 ? "FFF8F9FF" : "FFFFFFFF";
  const thin  = { style: "thin", color: { argb: "FFE5E7EB" } };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.border    = { top: thin, bottom: thin, left: thin, right: thin };
    cell.alignment = { vertical: "middle" };
  });
}

// Width from actual header-keyed values. Uses a fold, not a spread — a spread
// over 100k+ rows blows the argument limit and throws RangeError.
function autoFitColumns(ws, headers, rows) {
  headers.forEach((h, i) => {
    let maxLen = h.length;
    for (const r of rows) {
      const len = String(r[h] ?? "").length;
      if (len > maxLen) maxLen = len;
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 45);
  });
}

// Adds title + header + all data rows to a worksheet in one call.
function fillSheet(ws, title, headers, rows, decorate) {
  writeSheetHeader(ws, title, headers);
  rows.forEach((row, i) => {
    const dataRow = ws.addRow(headers.map(h => row[h] ?? "-"));
    shadeDataRow(dataRow, i);
    if (decorate) decorate(dataRow, row, headers);
  });
  autoFitColumns(ws, headers, rows);
  ws.views = [{ state: "frozen", ySplit: 3 }];
  return ws;
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RoleSphere";
  wb.created = new Date();
  return wb;
}


async function buildSummaryWorkbook(month) {
    const [employees, managers, hrUsers, leaves, tasks, reviews] = await Promise.all([
      Employee.find({ isApproved: true }).select("name email department managerId").lean(),
      Manager.find({ isApproved: true }).select("name email").lean(),
      HR.find({ isApproved: true }).select("name email").lean(),
      EmployeeLeave.find(month ? { startDate: monthStringRange(month) } : {}).lean(),
      Task.find(month ? { deadline: monthDateRange(month) } : {}).lean(),
      PerformanceReview.find(month ? { createdAt: monthDateRange(month) } : {}).lean()
    ]);

    const wb = newWorkbook();
    const countBy = (arr, field, value) => arr.filter(x => x[field] === value).length;

    // Sheet 1 — Overview
    const avgRating = reviews.length
      ? (reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length).toFixed(2)
      : "n/a";
    const overview = [
      ["Total Employees",   employees.length],
      ["Total Managers",    managers.length],
      ["Total HR",          hrUsers.length],
      ["Total Tasks",       tasks.length],
      ["Tasks Approved",    countBy(tasks, "status", "Approved")],
      ["Tasks Pending",     countBy(tasks, "status", "Pending")],
      ["Tasks Rejected",    countBy(tasks, "status", "Rejected")],
      ["Total Leaves",      leaves.length],
      ["Leaves Approved",   countBy(leaves, "status", "Approved")],
      ["Leaves Pending",    countBy(leaves, "status", "Pending")],
      ["Leaves Rejected",   countBy(leaves, "status", "Rejected")],
      ["Reviews Written",   reviews.length],
      ["Avg Review Rating", avgRating]
    ].map(([Metric, Count]) => ({ Metric, Count }));
    fillSheet(wb.addWorksheet("Overview"), `System Summary${month ? " — " + month : ""}`,
      ["Metric", "Count"], overview);

    // Sheet 2 — Employees
    const mgrName = new Map(managers.map(m => [String(m._id), m.name]));
    fillSheet(wb.addWorksheet("Employees"), "Employee List",
      ["Name", "Email", "Department", "Manager"],
      employees.map(e => ({
        "Name": e.name, "Email": e.email,
        "Department": e.department || "-",
        "Manager": mgrName.get(String(e.managerId)) || "Unassigned"
      })));

    // Sheet 3 — Leaves
    fillSheet(wb.addWorksheet("Leaves"), "Leave Summary",
      ["Email", "Role", "Leave Type", "From", "To", "Days", "Status"],
      leaves.map(l => ({
        "Email": l.email, "Role": l.role || "Employee",
        "Leave Type": l.leaveType || "Annual",
        "From": l.startDate, "To": l.endDate,
        "Days": l.totalDays ?? "-", "Status": l.status || "Pending"
      })));

    // Sheet 4 — Tasks. The old version called tasks.indexOf(t) inside the loop
    // to get the row index, making the whole sheet O(n²).
    const empName = new Map(employees.map(e => [String(e._id), e.name]));
    fillSheet(wb.addWorksheet("Tasks"), "Task Summary",
      ["Title", "Assigned To", "Type", "Deadline", "Status"],
      tasks.map(t => ({
        "Title": t.title || "-",
        "Assigned To": t.assignedToModel === "Manager"
          ? (mgrName.get(String(t.managerId)) || "Manager")
          : (empName.get(String(t.employeeId)) || "Unassigned"),
        "Type": t.assignedToModel || "Employee",
        "Deadline": fmtDate(t.deadline),
        "Status": t.status || "Pending"
      })));

    // Sheet 5 — Reviews
    fillSheet(wb.addWorksheet("Reviews"), "Performance Reviews",
      ["Employee", "Reviewer", "Reviewer Role", "Period", "Rating", "Reviewed On"],
      reviews.map(r => ({
        "Employee": empName.get(String(r.employeeId)) || "Unknown",
        "Reviewer": r.reviewerName || "-",
        "Reviewer Role": r.reviewerModel || "-",
        "Period": r.period || "-",
        "Rating": r.rating != null ? `${r.rating} / 5` : "-",
        "Reviewed On": fmtDate(r.createdAt)
      })));

    return wb;
}
module.exports = { buildSummaryWorkbook, colLetter, titleCase, fmtDate, fillSheet, newWorkbook };
