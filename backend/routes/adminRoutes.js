const express = require("express");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const HR = require("../models/HR");
const Manager = require("../models/Manager");
const Announcement = require('../../backend/models/Announcement');
const EmployeeLeave = require("../models/EmployeeLeave");
const Attendance = require('../models/Attendance');
const router = express.Router();
const Employee = require('../models/Employee');
const Task = require('../models/Task');
const WorkReport = require('../models/WorkReport');
const moment = require('moment');
const { sendLeaveStatusEmail, sendAccountStatusEmail } = require('../services/emailService');
// Shared upload rules. The local multer config this replaced had no fileFilter
// and no size limit, so /announcements accepted any file of any size and wrote
// the client-supplied filename straight to a publicly served directory.
const { announcementUpload } = require("../middleware/uploadConfig");

// Reject before multer writes anything to disk. Note the comment below about
// "removing authentication checks to prevent redirection loops" — that is why
// most of this file is unguarded. Posting an announcement broadcasts to every
// connected socket, so it needs a guard regardless of the redirect problem.
function adminOnly(req, res, next) {
  const isAdmin = req.session?.admin || req.session?.user?.role === "Admin";
  if (isAdmin) return next();
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  return res.redirect("/login");
}

// ✅ Remove unnecessary authentication checks to prevent redirection loops
router.get("/add-hr", (req, res) => {
    res.render("add-hr", { error: null });
});
router.get("/announcements", async (req, res) => {
    try {
      const announcements = await Announcement.find().sort({ date: -1 });
      res.render("admin-announcements", { announcements, admin: req.session.user });
    } catch (err) {
      console.error("Error loading announcements:", err);
      res.render("admin-announcements", { announcements: [], admin: req.session.user });
    }
  });

  // Handle Adding New Announcement
  router.post("/announcements", adminOnly, announcementUpload("attachment"), async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).send("Title and message are required");
    }
    const attachmentUrl = req.file ? "/uploads/announcements/" + req.file.filename : null;

    const announcement = new Announcement({ title, message, attachmentUrl });
    await announcement.save();

    // ── NEW: broadcast to every connected socket user ──────────────────────
    const io = req.app.get("io");
    if (io) {
      io.emit("announcement:new", {
        _id:         announcement._id,
        title:       announcement.title,
        message:     announcement.message,
        date:        announcement.date,
        attachmentUrl: announcement.attachmentUrl,
        postedBy:    "Admin"
      });
    }
    // ───────────────────────────────────────────────────────────────────────

    res.redirect("/admin/dashboard");
  } catch (err) {
    res.status(500).send("Error adding announcement");
  }
});

// ✅ Render Login Page
router.get("/login", (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render("login", { error: null });
});

// ✅ Handle Admin Login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await Admin.findOne({ email });
        if (!admin) return res.render("login", { error: "Admin not found" });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.render("login", { error: "Invalid credentials" });

        req.session.admin = { id: admin._id, name: admin.name, email: admin.email };
        req.session.save(() => {
            res.redirect("/admin/dashboard");
        });
    } catch (err) {
        console.error("❌ Admin Login Failed:", err);
        res.render("login", { error: "Login failed" });
    }
});

// ✅ Render Admin Dashboard
router.get("/dashboard", async (req, res) => {
    try {
        if (!req.session.admin && (!req.session.user || req.session.user.role !== 'Admin')) {
            return res.redirect("/login");
        }

        const hrList = await HR.find({});
        const managerList = await Manager.find({});
        const employees = await Employee.find({}).populate('managerId', 'name');
        const announcements = await Announcement.find().sort({ date: -1 });
        const hrEmails = hrList.map(h => h.email);
        const hrLeaves = await EmployeeLeave.find({ email: { $in: hrEmails } }).sort({ createdAt: -1 });
        const tasks = await Task.find({}).populate('employeeId', 'name');

        // Calculate stats
        const totalEmployees = employees.length;
        const totalManagers = managerList.length;
        const totalHRs = hrList.length;

        // Attendance stats (basic calculation based on today's records)
        const today = moment().format("YYYY-MM-DD");
        const currentMonth = moment().format("YYYY-MM");
        let presentToday = 0;
        let absentToday = 0;

        // Fetch attendance for all employees for current month to check today's status
        // optimized query could be used here but keeping it simple
        const attendanceRecords = await Attendance.find({ month: currentMonth });

        attendanceRecords.forEach(record => {
            // Each document is a single attendance entry — no nested records array
            if (record.date === today) {
                if (record.status === 'present') presentToday++;
                else if (record.status === 'absent') absentToday++;
            }
        });

        const managerEmployeeTasks = tasks.filter(t => t.assignedToModel !== 'Manager');
        const hrManagerTasks = tasks.filter(t => t.assignedToModel === 'Manager');
        const taskStatusData = {
            pending: tasks.filter(t => t.status === 'Pending').length,
            submitted: tasks.filter(t => t.status === 'Submitted').length,
            approved: tasks.filter(t => t.status === 'Approved').length,
            rejected: tasks.filter(t => t.status === 'Rejected').length
        };
        const roleTaskStatusData = {
            managerEmployee: {
                pending: managerEmployeeTasks.filter(t => t.status === 'Pending').length,
                submitted: managerEmployeeTasks.filter(t => t.status === 'Submitted').length,
                approved: managerEmployeeTasks.filter(t => t.status === 'Approved').length,
                rejected: managerEmployeeTasks.filter(t => t.status === 'Rejected').length
            },
            hrManager: {
                pending: hrManagerTasks.filter(t => t.status === 'Pending').length,
                submitted: hrManagerTasks.filter(t => t.status === 'Submitted').length,
                approved: hrManagerTasks.filter(t => t.status === 'Approved').length,
                rejected: hrManagerTasks.filter(t => t.status === 'Rejected').length
            }
        };
        const reports = await WorkReport.find({});
        const employeeReportsStatusData = {
            pending: reports.filter(r => r.status === 'Pending').length,
            approved: reports.filter(r => r.status === 'Approved').length,
            rejected: reports.filter(r => r.status === 'Rejected').length
        };
        const pendingEmployees = await Employee.find({ isApproved: false });
        const pendingManagers = await Manager.find({ isApproved: false });
        const pendingHRs = await HR.find({ isApproved: false });
        const pendingCount = pendingEmployees.length + pendingManagers.length + pendingHRs.length;

        res.render("admin-dashboard", {
            admin: req.session.admin || req.session.user,
            hrList,
            managerList,
            employees,
            announcements,
            hrLeaves,
            totalEmployees,
            totalManagers,
            totalHRs,
            presentToday,
            absentToday,
            taskStatusData,
            roleTaskStatusData,
            employeeReportsStatusData,
            tasks,
            pendingApprovals: pendingCount,
            message: null
        });
    } catch (err) {
        console.error("Error loading dashboard:", err);
        res.render("admin-dashboard", {
            admin: req.session.admin || req.session.user,
            hrList: [],
            managerList: [],
            employees: [],
            announcements: [],
            hrLeaves: [],
            totalEmployees: 0,
            totalManagers: 0,
            totalHRs: 0,
            presentToday: 0,
            absentToday: 0,
            taskStatusData: { pending: 0, submitted: 0, approved: 0, rejected: 0 },
            roleTaskStatusData: { managerEmployee: { pending: 0, submitted: 0, approved: 0, rejected: 0 }, hrManager: { pending: 0, submitted: 0, approved: 0, rejected: 0 } },
            employeeReportsStatusData: { pending: 0, approved: 0, rejected: 0 },
            tasks: [],
            pendingApprovals: 0,
            message: "Error loading dashboard"
        });
    }
});

// Delete Employee
router.post("/delete-employee/:id", async (req, res) => {
    try {
        await Employee.findByIdAndDelete(req.params.id);
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Error deleting Employee:", err);
        res.redirect("/admin/dashboard");
    }
});

router.post('/updateLeaveStatus', async (req, res) => {
    try {
        const { leaveId, status } = req.body;
        if (!leaveId || !status) {
            return res.status(400).json({ success: false, error: "leaveId and status are required" });
        }
        const updatedLeave = await EmployeeLeave.findByIdAndUpdate(
            leaveId,
            { status },
            { new: true }
        );
        if (!updatedLeave) {
            return res.status(404).json({ success: false, error: "Leave not found" });
        }

        // Send email notification to the employee/HR about their leave decision
        if (updatedLeave.email) {
            const leaveUser = await Employee.findOne({ email: updatedLeave.email }).select('name').lean()
                || await HR.findOne({ email: updatedLeave.email }).select('name').lean();

            sendLeaveStatusEmail(
                updatedLeave.email,
                leaveUser?.name || updatedLeave.email,
                updatedLeave,
                "Admin"
            ).catch(err => console.error("Leave status email failed (admin):", err));
        }

        res.json({ success: true, leave: updatedLeave });
    } catch (error) {
        console.error("Error updating leave status:", error);
        res.status(500).json({ success: false, error: "Failed to update leave status" });
    }
});

// ✅ Handle Admin Logout
router.get('/logout', require('../services/logout').logout);

// ✅ Handle HR Addition (Save to MongoDB)
router.post("/add-hr", async (req, res) => {
    const { name, email, password } = req.body;
    try {
        console.log("🔍 HR Data Received:", req.body); // Debugging

        const existingHR = await HR.findOne({ email });
        if (existingHR) {
            return res.render("add-hr", { error: "HR with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newHR = new HR({ name, email, password: hashedPassword });
        await newHR.save();

        console.log("✅ HR Added Successfully!");
        sendAccountStatusEmail(email, name, "HR", "approved")
            .catch(err => console.error("HR creation email failed:", err));
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("❌ Error adding HR:", err);
        res.render("add-hr", { error: "Error adding HR" });
    }
});

// ✅ Show All HRs
router.get("/hr-list", async (req, res) => {
    try {
        const hrList = await HR.find({});
        res.render("hr-list", { hrList });
    } catch (err) {
        console.error("❌ Error fetching HR list:", err);
        res.render("hr-list", { hrList: [] });
    }
});

// ✅ Show Edit HR Form
// ✅ Show Edit HR Form (Pre-fill Data)
router.get("/edit-hr/:id", async (req, res) => {
  try {
      const hr = await HR.findById(req.params.id);
      if (!hr) {
          return res.redirect("/api/admin/hr-list"); // If HR not found, redirect
      }
      res.render("edit-hr", { hr });
  } catch (err) {
      console.error("❌ Error finding HR:", err);
      res.redirect("/api/admin/hr-list");
  }
});

// ✅ Handle HR Update (Save Changes)
router.post("/edit-hr/:id", async (req, res) => {
  const { name, email } = req.body;
  try {
      await HR.findByIdAndUpdate(req.params.id, { name, email });
      res.redirect("/admin/dashboard"); // Redirect back to Dashboard
  } catch (err) {
      console.error("❌ Error updating HR:", err);
      res.redirect("/admin/dashboard");
  }
});


// ✅ Delete HR
router.post("/delete-hr/:id", async (req, res) => {
    try {
        await HR.findByIdAndDelete(req.params.id);
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Error deleting HR:", err);
        res.redirect("/admin/dashboard");
    }
});
router.get("/add-manager", (req, res) => {
  res.render("add-manager", { error: null });
});

// ✅ Handle Adding Manager (Save to MongoDB)
router.post("/add-manager", async (req, res) => {
  const { name, email, password } = req.body;
  try {
      const existingManager = await Manager.findOne({ email });
      if (existingManager) {
          return res.render("add-manager", { error: "Manager with this email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newManager = new Manager({ name, email, password: hashedPassword });
      await newManager.save();

      res.redirect("/admin/dashboard");
  } catch (err) {
      console.error("❌ Error adding Manager:", err);
      res.render("add-manager", { error: "Error adding Manager" });
  }
});

// ✅ Show All Managers
router.get("/manager-list", async (req, res) => {
  try {
      const managerList = await Manager.find({});
      res.render("manager-list", { managerList });
  } catch (err) {
      console.error("❌ Error fetching Manager list:", err);
      res.render("manager-list", { managerList: [] });
  }
});

// ✅ Show Edit Manager Form
router.get("/edit-manager/:id", async (req, res) => {
  try {
      const manager = await Manager.findById(req.params.id);
      if (!manager) {
          return res.redirect("/api/admin/manager-list");
      }
      res.render("edit-manager", { manager });
  } catch (err) {
      console.error("❌ Error finding Manager:", err);
      res.redirect("/api/admin/manager-list");
  }
});

// ✅ Handle Manager Update
router.post("/edit-manager/:id", async (req, res) => {
  const { name, email } = req.body;
  try {
      await Manager.findByIdAndUpdate(req.params.id, { name, email });
      res.redirect("/admin/dashboard");
  } catch (err) {
      console.error("❌ Error updating Manager:", err);
      res.redirect("/admin/dashboard");
  }
});

// ✅ Delete Manager
router.post("/delete-manager/:id", async (req, res) => {
  try {
      await Manager.findByIdAndDelete(req.params.id);
      res.redirect("/admin/dashboard");
  } catch (err) {
      console.error("❌ Error deleting Manager:", err);
      res.redirect("/admin/dashboard");
  }
});
router.get('/mark-attendance', async (req, res) => {
    const employees = await Employee.find({});
    res.render('mark-attendance', { employees });
  });
  router.post('/submit-attendance', async (req, res) => {
  const attendanceData = req.body.attendance;
  const today = moment().format("YYYY-MM-DD");
  const currentMonth = moment().format("YYYY-MM");

  try {
    for (let empId in attendanceData) {
      const status = attendanceData[empId];

      await Attendance.findOneAndUpdate(
        { userId: empId, date: today },
        {
          userId: empId,
          userModel: "Employee",
          date: today,
          month: currentMonth,
          status: status
        },
        { upsert: true, new: true }
      );
    }

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error("❌ Attendance submit failed:", err);
    res.redirect('/admin/dashboard');
  }
});

router.get("/pending-approvals", async (req, res) => {
    try {
        if (!req.session.admin && (!req.session.user || req.session.user.role !== 'Admin')) {
            return res.redirect("/login");
        }
        const pendingEmployees = await Employee.find({ isApproved: false }).select("name email _id");
        const pendingManagers = await Manager.find({ isApproved: false }).select("name email _id");
        const pendingHRs = await HR.find({ isApproved: false }).select("name email _id");
        res.render("pending-approvals", {
            admin: req.session.admin || req.session.user,
            pendingEmployees,
            pendingManagers,
            pendingHRs
        });
    } catch (err) {
        console.error("Error loading pending approvals:", err);
        res.redirect("/admin/dashboard");
    }
});

router.post("/approve-user", async (req, res) => {
    try {
        const { userId, role } = req.body;
        const Model = role === "HR" ? HR : role === "Manager" ? Manager : Employee;
        const user = await Model.findByIdAndUpdate(userId, { isApproved: true, status: "approved" }, { new: true });

        // Send account approval email
        if (user && user.email) {
            sendAccountStatusEmail(user.email, user.name || user.email, role, "approved")
                .catch(err => console.error("Account approval email failed:", err));
        }

        res.redirect("/api/admin/pending-approvals");
    } catch (err) {
        res.redirect("/api/admin/pending-approvals");
    }
});

router.post("/reject-user", async (req, res) => {
    try {
        const { userId, role } = req.body;
        const Model = role === "HR" ? HR : role === "Manager" ? Manager : Employee;
        const user = await Model.findByIdAndUpdate(userId, { isApproved: false, status: "rejected" }, { new: true });

        // Send account rejection email
        if (user && user.email) {
            sendAccountStatusEmail(user.email, user.name || user.email, role, "rejected")
                .catch(err => console.error("Account rejection email failed:", err));
        }

        res.redirect("/api/admin/pending-approvals");
    } catch (err) {
        res.redirect("/api/admin/pending-approvals");
    }
});

router.get("/all-reviews", async (req, res) => {
  try {
    const performanceController = require("../controllers/performanceController");
    // Reuse controller
    await performanceController.getAllReviews(req, res);  // It already returns JSON, so adjust if needed
  } catch (e) {
    res.render("admin-all-reviews", { reviews: [] });
  }
});
module.exports = router;
