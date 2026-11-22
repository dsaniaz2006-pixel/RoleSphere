const express = require("express");
const bcrypt = require("bcryptjs");
const Employee = require("../models/Employee"); // Import Employee Model
const Manager = require("../models/Manager");
const EmployeeLeave = require("../models/EmployeeLeave"); // Import Employee Leave Model
const WorkReport = require("../models/WorkReport");
const Todo = require("../models/ToDo");
const Task = require("../models/Task");
const path = require("path");
const fs = require("fs");
// Upload rules live in one shared module now. The two multer configs that used
// to sit in this file disagreed with each other: profile photos were filtered
// and size-capped, task submissions accepted any file of any size.
const { taskUpload, photoUpload } = require("../middleware/uploadConfig");

const router = express.Router();

// Reject before multer runs, not after. The old handlers checked the session
// inside the route body, which meant an anonymous request still got its file
// written to disk before receiving the 401 — free storage for anyone who found
// the endpoint.
function employeeOnly(req, res, next) {
  if (req.session?.user?.role === "Employee") return next();
  return res.status(401).json({ success: false, error: "Unauthorized" });
}

// Upload / replace profile photo for the logged-in employee
router.post("/uploadProfilePhoto", employeeOnly, photoUpload('profilePhoto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const employee = await Employee.findOne({ email: req.session.user.email });
    if (!employee) return res.status(404).json({ success: false, error: "Employee not found" });

    // Delete the old photo file if one exists, so uploads/ doesn't fill up with orphans
    if (employee.profilePhoto) {
      const oldPath = path.join(__dirname, '..', '..', employee.profilePhoto);
      fs.unlink(oldPath, (err) => { if (err) console.log("Old photo not found, skipping delete"); });
    }

    employee.profilePhoto = `/uploads/profile-photos/${req.file.filename}`;
    await employee.save();

    res.json({ success: true, profilePhoto: employee.profilePhoto, message: "Profile photo updated successfully" });
  } catch (err) {
    console.error("❌ Profile photo upload failed:", err);
    res.status(500).json({ success: false, error: err.message || "Upload failed" });
  }
});

// Register Employee
router.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (role !== "Employee") {
    return res
      .status(403)
      .json({ error: "Only Employees can be registered here" });
  }

  try {
    const existingEmployee = await Employee.findOne({ email });
    if (existingEmployee) {
      return res.status(400).json({ error: "Employee already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newEmployee = new Employee({
      name,
      email,
      password: hashedPassword,
      role,
    });

    await newEmployee.save();
    res.json({ message: "Employee registered successfully" });
  } catch (err) {
    console.error("❌ Employee Registration Failed:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});



// Apply Leave Route (with default status "Pending")
router.post("/applyLeave", async (req, res) => {
  const { startDate, endDate, email, reason } = req.body;

  try {
    const newLeave = new EmployeeLeave({
      startDate,
      endDate,
      email,
      reason,
      status: "Pending",
    });

    await newLeave.save();

    const leaveHistory = await EmployeeLeave.find({ email });

    res.json({
      success: true,
      leaveHistory,
    });
  } catch (err) {
    console.error("❌ Apply Leave Failed:", err);
    res.status(500).json({ success: false, error: "Failed to apply leave" });
  }
});

// Get Leave History
router.post("/getLeaves", async (req, res) => {
  const { email } = req.body;

  const leaves = await EmployeeLeave.find({ email });

  res.json({
    success: true,
    leaves,
  });
});

// Employee Dashboard
router.get("/dashboard", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "Employee") {
    return res.redirect("/login");
  }
  const name = req.session.user.name;
  const email = req.session.user.email;
  try {
    const emp = await Employee.findOne({ email });
    res.render("employee-dashboard", { employee: { name, email, _id: emp ? emp._id : "", profilePhoto: emp ? emp.profilePhoto : null } });
  } catch(err) {
    res.render("employee-dashboard", { employee: { name, email, _id: "", profilePhoto: null } });
  }
});

// Employee Performance History
router.get("/performance-history", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "Employee") {
    return res.redirect("/login");
  }
  res.render("employee-performance-history", {
    employee: req.session.user
  });
});

// Get manager info for the logged-in employee
router.get("/getManagerInfo", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "Employee") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const emp = await Employee.findOne({ email: req.session.user.email }).lean();
    if (!emp || !emp.managerId) {
      return res.json({ success: true, managerName: null });
    }
    const manager = await Manager.findById(emp.managerId).select('name email').lean();
    if (!manager) {
      return res.json({ success: true, managerName: null });
    }
    res.json({ success: true, managerName: manager.name, managerEmail: manager.email });
  } catch (err) {
    console.error("Error fetching manager info:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Employee Logout (Redirect to login page)
router.get('/logout', require('../services/logout').logout);

// Submit Work Report
router.post("/submitWorkReport", async (req, res) => {
  const {
    employeeId: employeeEmail,
    startDate,
    endDate,
    totalHours,
    reportName,
    description,
  } = req.body;

  try {
    // Validate dates
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: "End date cannot be before start date",
      });
    }

    const newReport = new WorkReport({
      employeeEmail: req.currentUser.email,
      startDate,
      endDate,
      totalHours,
      reportName,
      description,
    });

    await newReport.save();

    res.json({
      success: true,
      message: "Work report submitted successfully",
      report: newReport,
    });
  } catch (err) {
    console.error("❌ Work Report Submission Failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to submit work report",
    });
  }
});

// Update Employee Profile
router.post("/updateProfile", async (req, res) => {
  const { email, name, phone, department, address } = req.body;

  try {
    const updatedEmployee = await Employee.findOneAndUpdate(
      { email },
      {
        name,
        phone,
        department,
        address
      },
      { new: true }
    );

    if (!updatedEmployee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found"
      });
    }

    res.json({
      success: true,
      employee: { _id: updatedEmployee._id, name: updatedEmployee.name, email: updatedEmployee.email, phone: updatedEmployee.phone, department: updatedEmployee.department, address: updatedEmployee.address }
    });

  } catch (err) {
    console.error("❌ Profile Update Failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update profile"
    });
  }
});


// Get Work Reports (Modified to show all reports including Pending)
router.post("/getWorkReports", async (req, res) => {
  const { email } = req.body;

  try {
    const reports = await WorkReport.find({
      employeeEmail: email,
      // status: { $ne: 'Pending' } // Commented out to show all reports
    }).sort({
      submittedAt: -1, // Sort by submission date
    });

    res.json({
      success: true,
      reports,
    });
  } catch (err) {
    console.error("❌ Failed to fetch work reports:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch work reports",
    });
  }
});

router.post("/getTodos", async (req, res) => {
  const { email } = req.body;

  try {
    const todos = await Todo.find({ employeeEmail: email }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      todos,
    });
  } catch (err) {
    console.error("❌ Failed to fetch todos:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch todos",
    });
  }
});

// Add Todo
router.post("/addTodo", async (req, res) => {
  const { email, text } = req.body;

  try {
    const newTodo = new Todo({
      employeeEmail: email,
      text,
    });

    await newTodo.save();

    res.json({
      success: true,
      message: "Todo added successfully",
      todo: newTodo,
    });
  } catch (err) {
    console.error("❌ Todo addition failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to add todo",
    });
  }
});

// Toggle Todo
router.post("/toggleTodo", async (req, res) => {
  const { id } = req.body;

  try {
    const todo = await Todo.findOne({ _id: id, employeeEmail: req.currentUser.email });
    if (!todo) {
      return res.status(404).json({
        success: false,
        error: "Todo not found",
      });
    }

    todo.completed = !todo.completed;
    todo.status = todo.completed ? "Done" : "Pending";
    await todo.save();

    res.json({
      success: true,
      message: "Todo updated successfully",
      todo,
    });
  } catch (err) {
    console.error("❌ Todo toggle failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to toggle todo",
    });
  }
});

// Delete Todo
router.post("/deleteTodo", async (req, res) => {
  const { id } = req.body;

  try {
    const deletedTodo = await Todo.findOneAndDelete({ _id: id, employeeEmail: req.currentUser.email });
    if (!deletedTodo) {
      return res.status(404).json({
        success: false,
        error: "Todo not found",
      });
    }

    res.json({
      success: true,
      message: "Todo deleted successfully",
    });
  } catch (err) {
    console.error("❌ Todo deletion failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete todo",
    });
  }
});

// Get Manager Reports (Reviewed reports)
router.post("/getManagerReports", async (req, res) => {
  const { email } = req.body;

  try {
    const reports = await WorkReport.find({
      employeeEmail: email,
      status: { $ne: 'Pending' } // Only fetch reviewed reports
    }).sort({
      reviewedOn: -1,
    });

    res.json({
      success: true,
      reports,
    });
  } catch (err) {
    console.error("❌ Failed to fetch manager reports:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch manager reports",
    });
  }
});

// Get Tasks for Employee
router.post("/getTasks", async (req, res) => {
  const { email } = req.body;

  try {
    const employee = await Employee.findOne({ email });
    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    const tasks = await Task.find({ employeeId: employee._id }).sort({
      deadline: 1,
    });

    res.json({
      success: true,
      tasks,
    });
  } catch (err) {
    console.error("❌ Failed to fetch tasks:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tasks",
    });
  }
});

// Submit Task (with file upload)
router.post("/submitTask", employeeOnly, taskUpload('submissionFile'), async (req, res) => {
  const { taskId } = req.body;
  const file = req.file;

  // ObjectId-shaped or nothing. findByIdAndUpdate throws a CastError on junk,
  // which previously surfaced as a generic 500.
  if (!taskId || !/^[a-f\d]{24}$/i.test(taskId)) {
    return res.status(400).json({ success: false, error: "A valid Task ID is required" });
  }

  try {
    const employee = await Employee.findOne({ email: req.session.user.email }).select("_id");
    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    const updateData = {
      status: "Submitted",
      submittedAt: new Date()
    };

    if (file) {
      updateData.submission = `/uploads/task-submissions/${file.filename}`;
    }

    // Scoped to this employee's own tasks. The previous version updated by id
    // alone, so any logged-in caller could submit against somebody else's task
    // — or mark an arbitrary task as Submitted — just by supplying its id.
    const task = await Task.findOneAndUpdate(
      { _id: taskId, employeeId: employee._id, status: "Pending" },
      updateData,
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found or not assigned to you" });
    }

    res.json({ success: true, message: "Task submitted successfully", task });
  } catch (err) {
    console.error("❌ Task submission failed:", err);
    res.status(500).json({ success: false, error: "Failed to submit task" });
  }
});

module.exports = router;