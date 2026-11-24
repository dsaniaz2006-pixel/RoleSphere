const express = require("express");
const bcrypt = require("bcryptjs");
const HR = require("../models/HR"); // Import HR Model
const mongoose = require("mongoose");
const Employee = require("../models/Employee"); // Import the Employee model
const Announcement = require('../models/Announcement');
const Manager = require("../models/Manager");
const EmployeeLeave = require("../models/EmployeeLeave");
const Task = require("../models/Task");
const { sendTaskAssignedEmail } = require('../services/emailService');

const router = express.Router();

// HR Dashboard Route
router.get("/dashboard", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "HR") {
    return res.redirect("/login");
  }
  const name = req.session.user.name;
  const email = req.session.user.email;

  try {
      const announcements = await Announcement.find().sort({ date: -1 });
      const hrUser = await HR.findOne({ email });
      res.render("hrDashboard", {
        hr: { name, email, _id: hrUser ? hrUser._id : "" },
        announcements
      });
  } catch (err) {
      console.error("Error loading dashboard:", err);
      res.render("hrDashboard", {
        hr: { name, email, _id: "" },
        announcements: []
      });
  }
});

// Register HR
router.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (role !== "HR") {
    return res.status(403).json({ error: "Only HR can be registered here" });
  }

  try {
    const existingHR = await HR.findOne({ email });
    if (existingHR) {
      return res.status(400).json({ error: "HR already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newHR = new HR({ name, email, password: hashedPassword, role });

    await newHR.save();
    res.json({ message: "HR registered successfully" });
  } catch (err) {
    console.error("❌ HR Registration Failed:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const hr = await HR.findOne({ email });
    if (!hr) return res.status(400).json({ error: "HR not found" });

    if (hr.status === "rejected") return res.status(403).json({ error: "Your account has been rejected." });
    if (hr.status !== "approved") return res.status(403).json({ error: "Your account is pending admin approval." });

    const isMatch = await bcrypt.compare(password, hr.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    req.session.user = { id: hr._id, name: hr.name, email: hr.email, role: "HR" };
    req.session.save(() => {
      res.redirect("/hr/dashboard");
    });

  } catch (err) {
    console.error("❌ HR Login Failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// HR Logout
router.get('/logout', require('../services/logout').logout);

// Get All Employees
router.get("/employees", async (req, res) => {
  try {
    const employees = await Employee.find().select("-password").lean();
    res.json(employees);
  } catch (err) {
    console.error("❌ Error fetching employees:", err);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// Add Employee Route
router.post("/add-employee", async (req, res) => {
  const { name, email, role, department, salary, password } = req.body;

  try {
    const existingEmployee = await mongoose.connection.db.collection("Employees").findOne({ email });

    if (existingEmployee) {
      return res.status(400).json({ error: "Employee already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await Employee.create({ name, email, department, password: hashedPassword, isApproved: false, status: "pending" });

    res.json({ message: "Employee added successfully" });

  } catch (err) {
    console.error("❌ Employee Addition Failed:", err);
    res.status(500).json({ error: "Failed to add employee" });
  }
});

// View Employee API (returns JSON for modal)
router.get("/view-employee/:id", async (req, res) => {
  try {
    const employeeId = new mongoose.Types.ObjectId(req.params.id);
    const employee = await Employee.findById(employeeId).select("-password").lean();

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Update Employee Route
router.put("/edit-employee/:id", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const employeeId = new mongoose.Types.ObjectId(req.params.id);
    const updateFields = { name, email };

    // If a new password is provided, hash it before updating
    if (password) {
      updateFields.password = await bcrypt.hash(password, 10);
    }
    const updatedEmployee = await mongoose.connection.db.collection("Employees").findOneAndUpdate(
      { _id: employeeId },
      { $set: updateFields },
      { returnDocument: "after" }
    );

    if (!updatedEmployee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ message: "Employee updated successfully", employee: updatedEmployee });

  } catch (err) {
    console.error("❌ Employee Update Failed:", err);
    res.status(500).json({ error: "Failed to update employee" });
  }
});

// Get Managers
router.get("/managers", async (req, res) => {
  try {
    const managers = await Manager.find({}, "name email").lean();
    res.json({ success: true, managers });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch managers" });
  }
});

// HR Apply Leave
router.post("/applyLeave", async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;
    if (!startDate || !endDate || !reason ) {
      console.log("Missing fields:", { startDate, endDate, reason });
      return res.status(400).json({ success: false, error: "Missing fields" });
    }
    // Get HR email from session or query params
    const hrEmail = (req.session && req.session.user && req.session.user.email) || req.query.email;
    const leave = new EmployeeLeave({ startDate, endDate, reason, email: hrEmail, role: 'HR', status: 'Pending' });
    await leave.save();
    res.json({ success: true, leave });
  } catch (error) {
    console.error("Error submitting leave:", error);
    res.status(500).json({ success: false, error: "Failed to submit leave" });
  }
});

// Assign Task to Manager
router.post("/assignTask", async (req, res) => {
  try {
    const { managerId, title, description, deadline } = req.body;
    if (!managerId || !title || !description || !deadline) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    // Verify manager exists by name or email
    const manager = await Manager.findOne({ $or: [{ name: managerId }, { email: managerId }] });
    if (!manager) {
      return res.status(400).json({ success: false, error: "Manager not found" });
    }

    const task = new Task({
      managerId: manager._id,
      assignedToModel: 'Manager',
      title,
      description,
      deadline: new Date(deadline),
      status: 'Pending'
    });

    await task.save();

    // Fire-and-forget: notify the manager about the new task
    sendTaskAssignedEmail(
      manager.email,
      manager.name,
      { title, description, deadline },
      "HR Team"
    ).catch(err => console.error("Task assigned email failed (HR->Manager):", err));

    res.json({ success: true, task });
  } catch (error) {
    console.error("Error assigning task:", error);
    res.status(400).json({ success: false, error: "Failed to assign task" });
  }
});

// Get Tasks Assigned by HR (to Managers)
router.get("/assignedTasks", async (req, res) => {
  try {
    const tasks = await Task.find({ assignedToModel: 'Manager' })
      .populate('managerId', 'name email')
      .sort({ deadline: 1 });
    res.json({ success: true, tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ success: false, error: "Failed to fetch tasks" });
  }
});

// Post Announcement
router.post("/postAnnouncement", async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: "Title and message required" });
    }

    const announcement = new Announcement({ title, message, date: new Date() });
    await announcement.save();

    // ── NEW: broadcast to every connected socket user ──────────────────────
    const io = req.app.get("io");
    if (io) {
      io.emit("announcement:new", {
        _id:       announcement._id,
        title:     announcement.title,
        message:   announcement.message,
        date:      announcement.date,
        postedBy:  "HR"
      });
    }
    // ───────────────────────────────────────────────────────────────────────

    res.json({ success: true, announcement });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to post announcement" });
  }
});

// Dashboard Stats
router.get("/stats", async (req, res) => {
  try {
    const employeeFilter = req.demoMode ? { demoKey: req.demoKey } : {};
    const employeeCount = await mongoose.connection.db.collection("Employees").countDocuments(employeeFilter);
    const managerCount = await Manager.countDocuments();
    const pendingLeaves = await EmployeeLeave.countDocuments({ status: 'Pending' });
    const pendingManagerTasks = await Task.countDocuments({ assignedToModel: 'Manager', status: 'Pending' });
    res.json({ success: true, stats: { employeeCount, managerCount, pendingLeaves, pendingManagerTasks } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

module.exports = router;
