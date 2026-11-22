const express = require("express");
const router = express.Router();
const Employee = require('../../backend/models/Employee');
const Attendance = require('../../backend/models/Attendance');
const EmployeeLeave = require('../../backend/models/EmployeeLeave');
const HR = require('../../backend/models/HR');
const Manager = require('../../backend/models/Manager');
const Announcement = require('../../backend/models/Announcement');
const Task = require('../../backend/models/Task');
const WorkReport = require('../../backend/models/WorkReport');
router.use((req, res, next) => {
  if (!req.session.admin && (!req.session.user || req.session.user.role !== "Admin")) {
    return res.redirect("/login");
  }
  next();
});
router.get("/dashboard", async (req, res) => {
  try {
    const admin = req.session.admin || { name: "Admin" };

    const hrList = await HR.find({});
    const managerList = await Manager.find({});
    const employees = await Employee.find({});
    const announcements = await Announcement.find().sort({ date: -1 });

    // Get today's date in "YYYY-MM-DD" format
    const currentDate = require('../../backend/utils/dates').ymd();

    // Aggregate attendance records for today
    const attendanceData = await Attendance.aggregate([
  { $match: { date: currentDate } },
  { $group: { _id: "$status", count: { $sum: 1 } } }
]);

    // Default counts
    let presentToday = 0;
    let absentToday = 0;

    attendanceData.forEach(item => {
      if (item._id === "present") presentToday = item.count;
      if (item._id === "absent") absentToday = item.count;
    });

    const pendingEmployees = await Employee.find({ status: "pending" });
    const pendingManagers = await Manager.find({ status: "pending" });
    const pendingHRs = await HR.find({ status: "pending" });
    const pendingApprovals = pendingEmployees.length + pendingManagers.length + pendingHRs.length;
    const hrLeaves = await EmployeeLeave.find({ role: 'HR' }).sort({ createdAt: -1 });
    const totalEmployees = employees.length;

    // Aggregate task status data for charts
    const managerEmployeeTasks = await Task.aggregate([
      { $match: { assignedToModel: 'Employee' } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const hrManagerTasks = await Task.aggregate([
      { $match: { assignedToModel: 'Manager' } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const employeeReports = await WorkReport.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Helper function to get count by status
    const getCount = (data, status) => data.find(item => item._id === status)?.count || 0;

    const roleTaskStatusData = {
      managerEmployee: {
        pending: getCount(managerEmployeeTasks, 'Pending'),
        submitted: getCount(managerEmployeeTasks, 'Submitted'),
        approved: getCount(managerEmployeeTasks, 'Approved'),
        rejected: getCount(managerEmployeeTasks, 'Rejected')
      },
      hrManager: {
        pending: getCount(hrManagerTasks, 'Pending'),
        submitted: getCount(hrManagerTasks, 'Submitted'),
        approved: getCount(hrManagerTasks, 'Approved'),
        rejected: getCount(hrManagerTasks, 'Rejected')
      }
    };

    const employeeReportsStatusData = {
      pending: getCount(employeeReports, 'Pending'),
      approved: getCount(employeeReports, 'Approved'),
      rejected: getCount(employeeReports, 'Rejected')
    };

    // Render dashboard
    res.render("admin-dashboard", {
      admin,
      hrList,
      managerList,
      employees,
      announcements,
      hrLeaves,
      totalEmployees,
      presentToday,
      absentToday,
      pendingApprovals,
      roleTaskStatusData,
      employeeReportsStatusData,
      message: null
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.render("admin-dashboard", {
      admin: req.session.admin || { name: "Admin" },
      hrList: [],
      managerList: [],
      employees: [],
      announcements: [],
      totalEmployees: 0,
      presentToday: 0,
      absentToday: 0,
      pendingApprovals: 0,
      hrLeaves: [],
      message: "Error loading dashboard"
    });
  }
});

// Manage Users (Example Route)
router.get("/users", (req, res) => {
  // Fetch users from the database and pass to the view
  res.render("admin-users", { user: req.session.user });
});

// Logout for Admin
router.get('/logout', require('../../backend/services/logout').logout);
// ✅ Show Add HR Form
router.get("/add-hr", (req, res) => {
  res.render("add-hr");
});



// ✅ Handle HR Addition (Saves HR to MongoDB)
router.post("/add-hr", async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newHR = new HR({ name, email, password: hashedPassword });
        await newHR.save();
        res.redirect("/api/admin/hr-list");
    } catch (err) {
        console.error("Error adding HR:", err);
        res.render("add-hr", { error: "Error adding HR" });
    }
});

// ✅ Show All HRs
router.get("/hr-list", async (req, res) => {
    try {
        const hrList = await HR.find({});
        res.render("hr-list", { hrList });
    } catch (err) {
        console.error("Error fetching HR list:", err);
        res.render("hr-list", { hrList: [] });
    }
});

// ✅ Show Edit HR Form
router.get("/edit-hr/:id", async (req, res) => {
    try {
        const hr = await HR.findById(req.params.id);
        res.render("edit-hr", { hr });
    } catch (err) {
        console.error("Error finding HR:", err);
        res.redirect("/api/admin/hr-list");
    }
});

// ✅ Handle HR Update
router.post("/edit-hr/:id", async (req, res) => {
    const { name, email } = req.body;
    try {
        await HR.findByIdAndUpdate(req.params.id, { name, email });
        res.redirect("/api/admin/hr-list");
    } catch (err) {
        console.error("Error updating HR:", err);
        res.redirect("/api/admin/hr-list");
    }
});

// ✅ Delete HR
router.post("/delete-hr/:id", async (req, res) => {
    try {
        await HR.findByIdAndDelete(req.params.id);
        res.redirect("/api/admin/hr-list");
    } catch (err) {
        console.error("Error deleting HR:", err);
        res.redirect("/api/admin/hr-list");
    }
});
router.get("/pending-approvals", async (req, res) => {
    try {
        const pendingEmployees = await Employee.find({ status: "pending" }).select("name email _id");
        const pendingManagers = await Manager.find({ status: "pending" }).select("name email _id");
        const pendingHRs = await HR.find({ status: "pending" }).select("name email _id");
        res.render("pending-approvals", {
            admin: req.session.admin || req.session.user,
            pendingEmployees,
            pendingManagers,
            pendingHRs
        });
    } catch (err) {
        console.error("Error loading pending approvals:", err);
        res.redirect("/api/admin/dashboard");
    }
});

router.post("/approve-user", async (req, res) => {
    try {
        const { userId, role } = req.body;
        const Model = role === "HR" ? HR : role === "Manager" ? Manager : Employee;
        await Model.findByIdAndUpdate(userId, { isApproved: true, status: "approved" });
        res.redirect("/api/admin/pending-approvals");
    } catch (err) {
        res.redirect("/api/admin/pending-approvals");
    }
});

router.post("/reject-user", async (req, res) => {
    try {
        const { userId, role } = req.body;
        const Model = role === "HR" ? HR : role === "Manager" ? Manager : Employee;
        await Model.findByIdAndUpdate(userId, { isApproved: false, status: "rejected" });
        res.redirect("/api/admin/pending-approvals");
    } catch (err) {
        res.redirect("/api/admin/pending-approvals");
    }
});

router.get("/hr-attendance", (req, res) => {
  res.render("hr-attendance-report", { admin: req.session.admin || req.session.user });
});

module.exports = router;
