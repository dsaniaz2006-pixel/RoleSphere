const express = require("express");
const bcrypt = require("bcryptjs");
const { addEmployeeToTeam } = require("../controllers/managerController");
const Manager = require("../models/Manager");
const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const Task = require('../models/Task');
const EmployeeLeave = require("../models/EmployeeLeave");
const HR = require("../models/HR");
const WorkReport = require("../models/WorkReport");
const { sendTaskAssignedEmail, sendLeaveStatusEmail, sendTeamWelcomeEmail, sendRemovalNoticeEmail } = require('../services/emailService');
const Announcement = require("../models/Announcement");
// Shared upload rules. The local multer config this replaced had no fileFilter
// and no size limit, so /submitTask took any file of any size.
const { taskUpload } = require("../middleware/uploadConfig");
const router = express.Router();

// Reject before multer writes anything to disk.
function managerOnly(req, res, next) {
  if (req.session?.user?.role === "Manager") return next();
  return res.status(401).json({ success: false, error: "Unauthorized" });
}

// Register Manager
router.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;
  if (role !== "Manager") return res.status(403).json({ error: "Only Managers can be registered here" });
  try {
    const existingManager = await Manager.findOne({ email });
    if (existingManager) return res.status(400).json({ error: "Manager already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newManager = new Manager({ name, email, password: hashedPassword, role });
    await newManager.save();
    res.json({ message: "Manager registered successfully" });
  } catch (err) {
    console.error("❌ Manager Registration Failed:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login Manager
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const manager = await Manager.findOne({ email });
    if (!manager) return res.status(400).json({ error: "Manager not found" });
    if (manager.status === "rejected") return res.status(403).json({ error: "Your account has been rejected." });
    if (manager.status !== "approved") return res.status(403).json({ error: "Your account is pending admin approval." });
    const isMatch = await bcrypt.compare(password, manager.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });
    req.session.user = { id: manager._id, name: manager.name, email: manager.email, role: "Manager" };
    req.session.save(() => {
      res.redirect("/manager/dashboard");
    });
  } catch (err) {
    console.error("❌ Manager Login Failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Dashboard — scoped to this manager's employees only
router.get("/dashboard", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "Manager") {
    return res.redirect("/login");
  }
  try {
    const name  = req.session.user.name;
    const email = req.session.user.email;

    const mgrUser   = await Manager.findOne({ email });
    const employees = mgrUser
      ? await Employee.find({ managerId: mgrUser._id }).lean()
      : [];

    for (let employee of employees) {
      employee.tasks = await Task.find({ employeeId: employee._id }).lean();
    }

    // ── NEW: fetch announcements for sidebar badge ─────────────────────────
    const announcements = await Announcement.find()
      .sort({ date: -1 })
      .lean();
    // ───────────────────────────────────────────────────────────────────────

    res.render("managerDashboard", {
      manager: { name, email, _id: mgrUser ? mgrUser._id : "" },
      employees,
      announcements   // ← NEW
    });
  } catch (error) {
    console.error("Error fetching employees and tasks:", error);
    res.status(500).send("Internal Server Error");
  }
});


// Render Performance Review Form (Manager only)
router.get("/performance-review", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "Manager") {
    return res.redirect("/login");
  }

  try {
    const Employee = require("../models/Employee");
    // req.session.user stores 'id' not '_id' — always use req.session.user.id
    const employees = await Employee.find({ managerId: req.session.user.id });

    res.render("manager-performance-review", {
      manager: req.session.user,
      employees: employees
    });
  } catch (err) {
    console.error(err);
    res.render("manager-performance-review", {
      manager: req.session.user,
      employees: []
    });
  }
});

// Handle Form Submission
router.post("/performance-review", async (req, res) => {
  try {
    const performanceController = require("../controllers/performanceController");
    await performanceController.createReview(req, res);
  } catch (err) {
    console.error("Performance review error:", err);
    res.status(500).send("Error creating performance review");
  }
});

// Get tasks assigned to manager by HR
router.post("/getMyTasks", async (req, res) => {
  try {
    if (!req.session || !req.session.user || req.session.user.role !== "Manager") {
      return res.json({ success: true, tasks: [] });
    }
    const { email } = req.session.user;
    const manager = await Manager.findOne({ email }).lean();
    if (!manager) return res.json({ success: true, tasks: [] });
    const tasks = await Task.find({ assignedToModel: "Manager", managerId: manager._id })
      .sort({ deadline: 1 }).lean();
    res.json({ success: true, tasks });
  } catch (error) {
    console.error("❌ Error fetching manager tasks:", error);
    res.status(500).json({ success: false, error: "Failed to fetch tasks" });
  }
});

// Update task status — verify the task belongs to this manager's team
router.post('/updateTaskStatus', require('../services/taskService').reviewTask);
router.patch('/tasks/:id/status', require('../services/taskService').reviewTask);

// Logout
router.get('/logout', require('../services/logout').logout);

// Submit a task assigned by HR
router.post("/submitTask", managerOnly, taskUpload('submissionFile'), async (req, res) => {
  const { taskId } = req.body;
  if (!taskId || !/^[a-f\d]{24}$/i.test(taskId)) {
    return res.status(400).json({ success: false, error: "A valid Task ID is required" });
  }
  try {
    const manager = await Manager.findOne({ email: req.session.user.email }).select("_id");
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const updateData = { status: "Submitted", submittedAt: new Date() };
    if (req.file) updateData.submission = `/uploads/task-submissions/${req.file.filename}`;

    // Scoped to tasks actually assigned to this manager. Updating by id alone
    // let any caller mark an arbitrary task as Submitted.
    const task = await Task.findOneAndUpdate(
      { _id: taskId, managerId: manager._id },
      updateData,
      { new: true }
    );
    if (!task) return res.status(404).json({ success: false, error: "Task not found or not assigned to you" });
    res.json({ success: true, message: "Task submitted successfully", task });
  } catch (err) {
    console.error("❌ Task submission failed:", err);
    res.status(500).json({ success: false, error: "Failed to submit task" });
  }
});

// Get this manager's employees only (scoped)
router.get("/employees", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ error: "Manager not found" });
    const employees = await Employee.find({ managerId: manager._id });
    res.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get approved employees not yet assigned to any manager
router.get("/availableEmployees", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const available = await Employee.find({ managerId: { $exists: false }, isApproved: true }).select('_id name email').lean();
    const nullManager = await Employee.find({ managerId: null, isApproved: true }).select('_id name email').lean();
    const combined = [...available, ...nullManager];
    const seen = new Set();
    const unique = combined.filter(e => {
      const key = e._id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, employees: unique });
  } catch (error) {
    console.error("Error fetching available employees:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Add employee to team + send welcome email
router.post("/addEmployee", async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });
  if (!req.session.user || req.session.user.role !== "Manager") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ error: "Manager not found" });
    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (employee.managerId && employee.managerId.toString() === manager._id.toString()) {
      return res.status(400).json({ error: "Employee is already in your team" });
    }
    employee.managerId = manager._id;
    await employee.save();

    // Notify employee by email
    sendTeamWelcomeEmail(employee.email, employee.name, manager.name)
      .catch(err => console.error("Team welcome email failed:", err));

    res.json({ message: "Employee added to your team successfully!", managerName: manager.name });
  } catch (error) {
    console.error("❌ Error adding employee:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Assign task to employee + send email — scoped to manager's team
router.post("/assignTask", async (req, res) => {
  const { employeeId, title, description, deadline } = req.body;
  if (!employeeId || !title || !description || !deadline) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (!req.session.user || req.session.user.role !== "Manager") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    // Verify this employee actually belongs to THIS manager
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ error: "Manager not found" });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    if (!employee.managerId || employee.managerId.toString() !== manager._id.toString()) {
      return res.status(403).json({ error: "You can only assign tasks to your own team members" });
    }

    const newTask = new Task({ employeeId, title, description, deadline: new Date(deadline) });
    await newTask.save();

    sendTaskAssignedEmail(employee.email, employee.name, { title, description, deadline }, manager.name)
      .catch(err => console.error("Task assigned email failed:", err));

    res.status(201).json({
      message: "Task assigned successfully",
      employeeName: employee.name,
      task: { title, description, deadline: new Date(deadline).toLocaleString(), status: "Pending" },
    });
  } catch (err) {
    console.error("❌ Error assigning task:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Performance reviews now handled by /api/performance/create
// router.post("/submitReview") removed — use POST /api/performance/create instead

// Get leave requests — scoped to this manager's team only
router.get("/getLeaveRequests", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const myEmployees = await Employee.find({ managerId: manager._id }).select('email name').lean();
    const myEmployeeEmails = myEmployees.map(e => e.email);

    const leaves = await EmployeeLeave.find({
      role: { $ne: 'HR' },
      email: { $in: myEmployeeEmails }
    }).sort({ createdAt: -1 }).lean();

    const leavesWithNames = leaves.map(leave => {
      const emp = myEmployees.find(e => e.email === leave.email);
      return { ...leave, employeeName: emp?.name || 'Unknown', employeeEmail: leave.email };
    });

    res.json({ success: true, leaves: leavesWithNames });
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    res.status(500).json({ success: false, error: "Failed to fetch leave requests" });
  }
});

// Update leave status + send email — scoped to manager's team
router.post('/updateLeaveStatus', async (req, res) => {
  if (!req.session.user || req.session.user.role !== "Manager") {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const { leaveId, status } = req.body;
    if (!leaveId || !status) {
      return res.status(400).json({ success: false, error: "leaveId and status are required" });
    }

    const leave = await EmployeeLeave.findById(leaveId);
    if (!leave) return res.status(404).json({ success: false, error: "Leave not found" });

    // Verify this leave belongs to one of this manager's employees
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const myEmployees = await Employee.find({ managerId: manager._id }).select('email name').lean();
    const myEmails    = myEmployees.map(e => e.email);

    if (!myEmails.includes(leave.email)) {
      return res.status(403).json({ success: false, error: "You can only manage leaves for your own team members" });
    }

    leave.status = status;
    await leave.save();

    const leaveUser = myEmployees.find(e => e.email === leave.email);
    sendLeaveStatusEmail(leave.email, leaveUser?.name || leave.email, leave, manager.name)
      .catch(err => console.error("Leave status email failed:", err));

    res.json({ success: true, leave });
  } catch (error) {
    console.error("Error updating leave status:", error);
    res.status(500).json({ success: false, error: "Failed to update leave status" });
  }
});

// Get pending reports — scoped to this manager's team only
router.get("/getPendingReports", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const myEmployees = await Employee.find({ managerId: manager._id }).select('email name').lean();
    const myEmployeeEmails = myEmployees.map(e => e.email);

    const reports = await WorkReport.find({
      status: 'Pending',
      employeeEmail: { $in: myEmployeeEmails }
    }).sort({ submittedAt: -1 }).lean();

    const reportsWithNames = reports.map(report => {
      const emp = myEmployees.find(e => e.email === report.employeeEmail);
      return { ...report, employeeName: emp?.name || 'Unknown Employee' };
    });

    res.json({ success: true, reports: reportsWithNames });
  } catch (error) {
    console.error("Error fetching pending reports:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pending reports" });
  }
});

// Review/Approve work report
router.post('/reviewReport', async (req, res) => {
  try {
    const { reportId, status, managerRemarks } = req.body;
    if (!reportId || !status) return res.status(400).json({ success: false, error: "Report ID and status are required" });
    const members = await Employee.find({ managerId: req.currentUser.id }).distinct('email');
    if (!['Approved','Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid review status' });
    const updatedReport = await WorkReport.findOneAndUpdate(
      { _id: reportId, employeeEmail: { $in: members }, status: 'Pending' },
      { status, managerRemarks: managerRemarks || '', reviewedOn: new Date() },
      { new: true }
    );
    if (!updatedReport) return res.status(404).json({ success: false, error: "Report not found" });
    res.json({ success: true, message: `Report ${status.toLowerCase()} successfully`, report: updatedReport });
  } catch (error) {
    console.error("Error reviewing report:", error);
    res.status(500).json({ success: false, error: "Failed to review report" });
  }
});

// Get all reports — scoped to this manager's team only
router.get("/getAllReports", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const myEmployees = await Employee.find({ managerId: manager._id }).select('email name').lean();
    const myEmployeeEmails = myEmployees.map(e => e.email);

    const reports = await WorkReport.find({
      employeeEmail: { $in: myEmployeeEmails }
    }).sort({ submittedAt: -1 }).lean();

    const reportsWithNames = reports.map(report => {
      const emp = myEmployees.find(e => e.email === report.employeeEmail);
      return { ...report, employeeName: emp?.name || 'Unknown Employee' };
    });

    res.json({ success: true, reports: reportsWithNames });
  } catch (error) {
    console.error("Error fetching all reports:", error);
    res.status(500).json({ success: false, error: "Failed to fetch all reports" });
  }
});

// Get tasks for a specific employee — scoped to manager's team
router.get("/tasks/:employeeId", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "Manager") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Validate ObjectId format before hitting MongoDB
  if (!mongoose.Types.ObjectId.isValid(req.params.employeeId)) {
    return res.status(400).json({ error: "Invalid employee ID" });
  }
  try {
    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ error: "Manager not found" });

    // Confirm the employee belongs to this manager before returning their tasks
    const employee = await Employee.findById(req.params.employeeId).lean();
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    if (!employee.managerId || employee.managerId.toString() !== manager._id.toString()) {
      return res.status(403).json({ error: "This employee is not in your team" });
    }

    const tasks = await Task.find({ employeeId: req.params.employeeId })
      .populate('employeeId', 'name')
      .sort({ deadline: 1 });
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove employee from team with reason
router.post("/removeEmployee", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Manager") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { employeeId, reason } = req.body;
    if (!employeeId || !reason || reason.trim().length < 5) {
      return res.status(400).json({ error: "Employee ID and a valid reason are required" });
    }

    const manager = await Manager.findOne({ email: req.session.user.email });
    if (!manager) return res.status(404).json({ error: "Manager not found" });

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    // Confirm this employee belongs to this manager
    if (!employee.managerId || employee.managerId.toString() !== manager._id.toString()) {
      return res.status(403).json({ error: "This employee is not in your team" });
    }

    // Store removal reason + manager name on employee record, then unlink from manager
    // We save manager.name here because managerId gets cleared — we'd lose it otherwise
    await Employee.findByIdAndUpdate(employeeId, {
      managerId: null,
      removalReason: reason.trim(),
      removalManagerName: manager.name,
      removalAccepted: false,
      complaintStatus: "None"
    });

    // Send email notification to employee
    sendRemovalNoticeEmail(employee.email, employee.name, manager.name, reason.trim())
      .catch(err => console.error("❌ Removal notice email failed:", err));

    res.json({ success: true, message: "Employee removed from your team." });
  } catch (err) {
    console.error("❌ Remove employee error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a task
router.delete("/deleteTask/:taskId", async (req, res) => {
  try {
    const ids = await Employee.find({ managerId: req.currentUser.id }).distinct('_id');
    const deleted = await Task.findOneAndDelete({ _id: req.params.taskId, employeeId: { $in: ids }, status: 'Pending' });
    if (!deleted) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, message: "Task deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting task:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
