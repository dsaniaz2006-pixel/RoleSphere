const express = require("express");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const HR = require("../models/HR");
const Manager = require("../models/Manager");
const Announcement = require("../../backend/models/Announcement");
const EmployeeLeave = require("../models/EmployeeLeave");
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const Task = require("../models/Task");
const WorkReport = require("../models/WorkReport");
const moment = require("moment");
const {
    sendLeaveStatusEmail,
    sendAccountStatusEmail,
    sendAccountRemovedEmail // ADDED
} = require("../services/emailService");
const { announcementUpload } = require("../middleware/uploadConfig");

const router = express.Router();

// Admin authorization middleware
function adminOnly(req, res, next) {
    const isAdmin =
        req.session?.admin ||
        req.session?.user?.role === "Admin";

    if (isAdmin) return next();

    if (
        req.xhr ||
        req.headers.accept?.includes("application/json")
    ) {
        return res.status(403).json({
            success: false,
            error: "Admin access required"
        });
    }

    return res.redirect("/login");
}

// Add HR page
router.get("/add-hr", (req, res) => {
    res.render("add-hr", { error: null });
});

// Announcements page
router.get("/announcements", async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ date: -1 });

        res.render("admin-announcements", {
            announcements,
            admin: req.session.user
        });
    } catch (err) {
        console.error("Error loading announcements:", err);

        res.render("admin-announcements", {
            announcements: [],
            admin: req.session.user
        });
    }
});

// Create announcement
router.post(
    "/announcements",
    adminOnly,
    announcementUpload("attachment"),
    async (req, res) => {
        try {
            const { title, message } = req.body;

            if (!title || !message) {
                return res.status(400).send(
                    "Title and message are required"
                );
            }

            const attachmentUrl = req.file
                ? "/uploads/announcements/" + req.file.filename
                : null;

            const announcement = new Announcement({
                title,
                message,
                attachmentUrl
            });

            await announcement.save();

            const io = req.app.get("io");

            if (io) {
                io.emit("announcement:new", {
                    _id: announcement._id,
                    title: announcement.title,
                    message: announcement.message,
                    date: announcement.date,
                    attachmentUrl: announcement.attachmentUrl,
                    postedBy: "Admin"
                });
            }

            res.redirect("/admin/dashboard");
        } catch (err) {
            console.error("Error adding announcement:", err);
            res.status(500).send("Error adding announcement");
        }
    }
);

// Admin login page
router.get("/login", (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }

    res.render("login", { error: null });
});

// Admin login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const admin = await Admin.findOne({ email });

        if (!admin) {
            return res.render("login", {
                error: "Admin not found"
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!isMatch) {
            return res.render("login", {
                error: "Invalid credentials"
            });
        }

        req.session.admin = {
            id: admin._id,
            name: admin.name,
            email: admin.email
        };

        req.session.save(() => {
            res.redirect("/admin/dashboard");
        });
    } catch (err) {
        console.error("Admin Login Failed:", err);

        res.render("login", {
            error: "Login failed"
        });
    }
});

// Admin dashboard
router.get("/dashboard", async (req, res) => {
    try {
        if (
            !req.session.admin &&
            (!req.session.user ||
                req.session.user.role !== "Admin")
        ) {
            return res.redirect("/login");
        }

        const hrList = await HR.find({});
        const managerList = await Manager.find({});
        const employees = await Employee.find({})
            .populate("managerId", "name");

        const announcements = await Announcement.find()
            .sort({ date: -1 });

        const hrEmails = hrList.map(h => h.email);

        const hrLeaves = await EmployeeLeave.find({
            email: { $in: hrEmails }
        }).sort({ createdAt: -1 });

        const tasks = await Task.find({})
            .populate("employeeId", "name");

        const totalEmployees = employees.length;
        const totalManagers = managerList.length;
        const totalHRs = hrList.length;

        const today = moment().format("YYYY-MM-DD");
        const currentMonth = moment().format("YYYY-MM");

        let presentToday = 0;
        let absentToday = 0;

        const attendanceRecords = await Attendance.find({
            month: currentMonth
        });

        attendanceRecords.forEach(record => {
            if (record.date === today) {
                if (record.status === "present") {
                    presentToday++;
                } else if (record.status === "absent") {
                    absentToday++;
                }
            }
        });

        const managerEmployeeTasks = tasks.filter(
            t => t.assignedToModel !== "Manager"
        );

        const hrManagerTasks = tasks.filter(
            t => t.assignedToModel === "Manager"
        );

        const taskStatusData = {
            pending: tasks.filter(t => t.status === "Pending").length,
            submitted: tasks.filter(t => t.status === "Submitted").length,
            approved: tasks.filter(t => t.status === "Approved").length,
            rejected: tasks.filter(t => t.status === "Rejected").length
        };

        const roleTaskStatusData = {
            managerEmployee: {
                pending: managerEmployeeTasks.filter(
                    t => t.status === "Pending"
                ).length,
                submitted: managerEmployeeTasks.filter(
                    t => t.status === "Submitted"
                ).length,
                approved: managerEmployeeTasks.filter(
                    t => t.status === "Approved"
                ).length,
                rejected: managerEmployeeTasks.filter(
                    t => t.status === "Rejected"
                ).length
            },
            hrManager: {
                pending: hrManagerTasks.filter(
                    t => t.status === "Pending"
                ).length,
                submitted: hrManagerTasks.filter(
                    t => t.status === "Submitted"
                ).length,
                approved: hrManagerTasks.filter(
                    t => t.status === "Approved"
                ).length,
                rejected: hrManagerTasks.filter(
                    t => t.status === "Rejected"
                ).length
            }
        };

        const reports = await WorkReport.find({});

        const employeeReportsStatusData = {
            pending: reports.filter(r => r.status === "Pending").length,
            approved: reports.filter(r => r.status === "Approved").length,
            rejected: reports.filter(r => r.status === "Rejected").length
        };

        // MODIFIED: Removed pendingEmployees from dashboard count
        const pendingManagers = await Manager.find({
            isApproved: false
        });

        const pendingHRs = await HR.find({
            isApproved: false
        });

        const pendingCount =
            pendingManagers.length +
            pendingHRs.length;

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
            taskStatusData: {
                pending: 0,
                submitted: 0,
                approved: 0,
                rejected: 0
            },
            roleTaskStatusData: {
                managerEmployee: {
                    pending: 0,
                    submitted: 0,
                    approved: 0,
                    rejected: 0
                },
                hrManager: {
                    pending: 0,
                    submitted: 0,
                    approved: 0,
                    rejected: 0
                }
            },
            employeeReportsStatusData: {
                pending: 0,
                approved: 0,
                rejected: 0
            },
            tasks: [],
            pendingApprovals: 0,
            message: "Error loading dashboard"
        });
    }
});

// MODIFIED: Delete employee with admin guard and email notification
router.post("/delete-employee/:id", adminOnly, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id);
        
        if (!employee) {
            console.error("[RoleSphere] Employee removal failed: not found", {
                employeeId: req.params.id
            });
            return res.redirect("/admin/dashboard");
        }

        // Capture details before deletion
        const removedName = employee.name || employee.email;
        const removedEmail = employee.email;

        await Employee.findByIdAndDelete(req.params.id);

        if (removedEmail) {
            try {
                const info = await sendAccountRemovedEmail(
                    removedEmail,
                    removedName
                );
                console.log("[RoleSphere Email] Account removal email accepted:", {
                    recipient: removedEmail,
                    messageId: info.messageId,
                    accepted: info.accepted,
                    rejected: info.rejected
                });
                if (!info.accepted?.length) {
                    console.warn(
                        "[RoleSphere Email] SMTP returned no accepted recipients:",
                        removedEmail
                    );
                }
            } catch (emailError) {
                // Email failure must never undo a successful deletion.
                console.error("[RoleSphere Email] Account removal email failed:", {
                    recipient: removedEmail,
                    message: emailError.message,
                    code: emailError.code
                });
            }
        }

        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Error deleting Employee:", err);
        res.redirect("/admin/dashboard");
    }
});

// Update leave status
router.post("/updateLeaveStatus", async (req, res) => {
    try {
        const { leaveId, status } = req.body;

        if (!leaveId || !status) {
            return res.status(400).json({
                success: false,
                error: "leaveId and status are required"
            });
        }

        const updatedLeave = await EmployeeLeave.findByIdAndUpdate(
            leaveId,
            { status },
            { new: true }
        );

        if (!updatedLeave) {
            return res.status(404).json({
                success: false,
                error: "Leave not found"
            });
        }

        if (updatedLeave.email) {
            const leaveUser =
                await Employee.findOne({
                    email: updatedLeave.email
                }).select("name").lean()
                ||
                await HR.findOne({
                    email: updatedLeave.email
                }).select("name").lean();

            sendLeaveStatusEmail(
                updatedLeave.email,
                leaveUser?.name || updatedLeave.email,
                updatedLeave,
                "Admin"
            ).catch(err => {
                console.error(
                    "Leave status email failed (admin):",
                    err
                );
            });
        }

        res.json({
            success: true,
            leave: updatedLeave
        });

    } catch (error) {
        console.error("Error updating leave status:", error);

        res.status(500).json({
            success: false,
            error: "Failed to update leave status"
        });
    }
});

// Admin logout
router.get(
    "/logout",
    require("../services/logout").logout
);

// Add HR
router.post("/add-hr", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        console.log("HR Data Received:", {
            name,
            email,
            passwordProvided: Boolean(password)
        });

        const existingHR = await HR.findOne({ email });

        if (existingHR) {
            return res.render("add-hr", {
                error: "HR with this email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newHR = new HR({
            name,
            email,
            password: hashedPassword
        });

        await newHR.save();

        console.log("HR Added Successfully!");

        sendAccountStatusEmail(
            email,
            name,
            "HR",
            "approved"
        ).then(info => {
            console.log("[RoleSphere Email] HR creation email accepted:", {
                recipient: email,
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected
            });
        }).catch(err => {
            console.error("[RoleSphere Email] HR creation email failed:", {
                recipient: email,
                message: err.message,
                code: err.code
            });
        });

        res.redirect("/admin/dashboard");

    } catch (err) {
        console.error("Error adding HR:", err);

        res.render("add-hr", {
            error: "Error adding HR"
        });
    }
});

// HR list
router.get("/hr-list", async (req, res) => {
    try {
        const hrList = await HR.find({});
        res.render("hr-list", { hrList });
    } catch (err) {
        console.error("Error fetching HR list:", err);
        res.render("hr-list", { hrList: [] });
    }
});

// Edit HR page
router.get("/edit-hr/:id", async (req, res) => {
    try {
        const hr = await HR.findById(req.params.id);

        if (!hr) {
            return res.redirect("/api/admin/hr-list");
        }

        res.render("edit-hr", { hr });

    } catch (err) {
        console.error("Error finding HR:", err);
        res.redirect("/api/admin/hr-list");
    }
});

// Update HR
router.post("/edit-hr/:id", async (req, res) => {
    const { name, email } = req.body;

    try {
        await HR.findByIdAndUpdate(
            req.params.id,
            { name, email }
        );

        res.redirect("/admin/dashboard");

    } catch (err) {
        console.error("Error updating HR:", err);
        res.redirect("/admin/dashboard");
    }
});

// Delete HR
router.post("/delete-hr/:id", async (req, res) => {
    try {
        await HR.findByIdAndDelete(req.params.id);
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Error deleting HR:", err);
        res.redirect("/admin/dashboard");
    }
});

// Add manager page
router.get("/add-manager", (req, res) => {
    res.render("add-manager", { error: null });
});

// Add manager
router.post("/add-manager", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const existingManager = await Manager.findOne({ email });

        if (existingManager) {
            return res.render("add-manager", {
                error: "Manager with this email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newManager = new Manager({
            name,
            email,
            password: hashedPassword
        });

        await newManager.save();

        res.redirect("/admin/dashboard");

    } catch (err) {
        console.error("Error adding Manager:", err);

        res.render("add-manager", {
            error: "Error adding Manager"
        });
    }
});

// Manager list
router.get("/manager-list", async (req, res) => {
    try {
        const managerList = await Manager.find({});
        res.render("manager-list", { managerList });
    } catch (err) {
        console.error("Error fetching Manager list:", err);
        res.render("manager-list", { managerList: [] });
    }
});

// Edit manager page
router.get("/edit-manager/:id", async (req, res) => {
    try {
        const manager = await Manager.findById(req.params.id);

        if (!manager) {
            return res.redirect("/api/admin/manager-list");
        }

        res.render("edit-manager", { manager });

    } catch (err) {
        console.error("Error finding Manager:", err);
        res.redirect("/api/admin/manager-list");
    }
});

// Update manager
router.post("/edit-manager/:id", async (req, res) => {
    const { name, email } = req.body;

    try {
        await Manager.findByIdAndUpdate(
            req.params.id,
            { name, email }
        );

        res.redirect("/admin/dashboard");

    } catch (err) {
        console.error("Error updating Manager:", err);
        res.redirect("/admin/dashboard");
    }
});

// Delete manager
router.post("/delete-manager/:id", async (req, res) => {
    try {
        await Manager.findByIdAndDelete(req.params.id);
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Error deleting Manager:", err);
        res.redirect("/admin/dashboard");
    }
});

// Mark attendance page
router.get("/mark-attendance", async (req, res) => {
    try {
        const employees = await Employee.find({});
        res.render("mark-attendance", { employees });
    } catch (err) {
        console.error("Error loading attendance page:", err);
        res.redirect("/admin/dashboard");
    }
});

// Submit attendance
router.post("/submit-attendance", async (req, res) => {
    const attendanceData = req.body.attendance || {};
    const today = moment().format("YYYY-MM-DD");
    const currentMonth = moment().format("YYYY-MM");

    try {
        for (const empId in attendanceData) {
            const status = attendanceData[empId];

            await Attendance.findOneAndUpdate(
                { userId: empId, date: today },
                {
                    userId: empId,
                    userModel: "Employee",
                    date: today,
                    month: currentMonth,
                    status
                },
                { upsert: true, new: true }
            );
        }

        res.redirect("/admin/dashboard");

    } catch (err) {
        console.error("Attendance submit failed:", err);
        res.redirect("/admin/dashboard");
    }
});

// MODIFIED: Pending approvals page (Removed Employees)
router.get("/pending-approvals", async (req, res) => {
    try {
        if (
            !req.session.admin &&
            (!req.session.user ||
                req.session.user.role !== "Admin")
        ) {
            return res.redirect("/login");
        }

        const pendingManagers = await Manager.find({
            isApproved: false
        }).select("name email _id");

        const pendingHRs = await HR.find({
            isApproved: false
        }).select("name email _id");

        res.render("pending-approvals", {
            admin: req.session.admin || req.session.user,
            pendingManagers,
            pendingHRs
        });

    } catch (err) {
        console.error("Error loading pending approvals:", err);
        res.redirect("/admin/dashboard");
    }
});

// Approve user
router.post("/approve-user", adminOnly, async (req, res) => {
    try {
        const { userId, role } = req.body;

        const Model =
            role === "HR" ? HR :
            role === "Manager" ? Manager :
            role === "Employee" ? Employee : null;

        if (!userId || !Model) {
            console.error("[RoleSphere] Invalid approval request:", {
                userId,
                role
            });

            return res.redirect("/api/admin/pending-approvals");
        }

        const user = await Model.findByIdAndUpdate(
            userId,
            {
                isApproved: true,
                status: "approved"
            },
            { new: true }
        );

        if (!user) {
            console.error("[RoleSphere] Approval failed: user not found", {
                userId,
                role
            });

            return res.redirect("/api/admin/pending-approvals");
        }

        if (user.email) {
            try {
                const info = await sendAccountStatusEmail(
                    user.email,
                    user.name || user.email,
                    role,
                    "approved"
                );

                console.log("[RoleSphere Email] Approval email accepted:", {
                    recipient: user.email,
                    messageId: info.messageId,
                    accepted: info.accepted,
                    rejected: info.rejected,
                    response: info.response
                });

                if (!info.accepted?.length) {
                    console.warn(
                        "[RoleSphere Email] SMTP returned no accepted recipients:",
                        user.email
                    );
                }

            } catch (emailError) {
                console.error("[RoleSphere Email] Approval email failed:", {
                    recipient: user.email,
                    message: emailError.message,
                    code: emailError.code,
                    response: emailError.response
                });
            }
        } else {
            console.warn(
                "[RoleSphere Email] Approval email skipped: no user email",
                { userId, role }
            );
        }

        return res.redirect("/api/admin/pending-approvals");

    } catch (err) {
        console.error("[RoleSphere] Approve-user route failed:", err);
        return res.redirect("/api/admin/pending-approvals");
    }
});

// Reject user
router.post("/reject-user", adminOnly, async (req, res) => {
    try {
        const { userId, role } = req.body;

        const Model =
            role === "HR" ? HR :
            role === "Manager" ? Manager :
            role === "Employee" ? Employee : null;

        if (!userId || !Model) {
            console.error("[RoleSphere] Invalid rejection request:", {
                userId,
                role
            });

            return res.redirect("/api/admin/pending-approvals");
        }

        const user = await Model.findByIdAndUpdate(
            userId,
            {
                isApproved: false,
                status: "rejected"
            },
            { new: true }
        );

        if (!user) {
            console.error("[RoleSphere] Rejection failed: user not found", {
                userId,
                role
            });

            return res.redirect("/api/admin/pending-approvals");
        }

        if (user.email) {
            try {
                const info = await sendAccountStatusEmail(
                    user.email,
                    user.name || user.email,
                    role,
                    "rejected"
                );

                console.log("[RoleSphere Email] Rejection email accepted:", {
                    recipient: user.email,
                    messageId: info.messageId,
                    accepted: info.accepted,
                    rejected: info.rejected,
                    response: info.response
                });

                if (!info.accepted?.length) {
                    console.warn(
                        "[RoleSphere Email] SMTP returned no accepted recipients:",
                        user.email
                    );
                }

            } catch (emailError) {
                console.error("[RoleSphere Email] Rejection email failed:", {
                    recipient: user.email,
                    message: emailError.message,
                    code: emailError.code,
                    response: emailError.response
                });
            }
        } else {
            console.warn(
                "[RoleSphere Email] Rejection email skipped: no user email",
                { userId, role }
            );
        }

        return res.redirect("/api/admin/pending-approvals");

    } catch (err) {
        console.error("[RoleSphere] Reject-user route failed:", err);
        return res.redirect("/api/admin/pending-approvals");
    }
});

// All reviews
router.get("/all-reviews", async (req, res) => {
    try {
        const performanceController = require(
            "../controllers/performanceController"
        );

        await performanceController.getAllReviews(req, res);

    } catch (err) {
        console.error("Error loading reviews:", err);
        res.render("admin-all-reviews", {
            reviews: []
        });
    }
});

module.exports = router;