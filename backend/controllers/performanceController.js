const PerformanceReview = require("../models/PerformanceReview");
const Employee          = require("../models/Employee");
const Manager           = require("../models/Manager");
const Task              = require("../models/Task");
const WorkReport        = require("../models/WorkReport");

function getReviewer(req) {
  if (req.session.admin) {
    return { id: req.session.admin.id, name: req.session.admin.name, role: "Admin" };
  }
  if (req.session.user) {
    return { id: req.session.user.id, name: req.session.user.name, role: req.session.user.role };
  }
  return null;
}

// ── POST /api/performance/create ─────────────────────────────────────────────
exports.createReview = async (req, res) => {
  try {
    const reviewer = getReviewer(req);
    if (!reviewer || !["Manager", "HR", "Admin"].includes(reviewer.role)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { employeeId, rating, comments, period, goals, strengths, improvements } = req.body;

    if (!employeeId || !rating || !comments || !period) {
      return res.status(400).json({ success: false, error: "employeeId, rating, comments, and period are required" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: "Rating must be between 1 and 5" });
    }

    const employee = await Employee.findById(employeeId).lean();
    if (!employee) return res.status(404).json({ success: false, error: "Employee not found" });

    // Manager can only review their own team members
    if (reviewer.role === "Manager") {
      const manager = await Manager.findById(reviewer.id).lean();
      if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });
      if (employee.managerId?.toString() !== manager._id.toString()) {
        return res.status(403).json({ success: false, error: "You can only review employees in your team" });
      }
    }

    // Parse goals if sent as JSON string
    let parsedGoals = goals || [];
    if (typeof parsedGoals === "string") {
      try { parsedGoals = JSON.parse(parsedGoals); } catch { parsedGoals = []; }
    }

    const review = await PerformanceReview.create({
      employeeId,
      reviewerId:    reviewer.id,
      reviewerModel: reviewer.role,
      reviewerName:  reviewer.name,
      period,
      rating:        Number(rating),
      comments:      comments.trim(),
      goals:         parsedGoals,
      strengths:     strengths?.trim() || "",
      improvements:  improvements?.trim() || ""
    });

    // Email notification to employee
    try {
      const { sendReviewNotificationEmail } = require("../services/emailService");
      if (typeof sendReviewNotificationEmail === "function") {
        sendReviewNotificationEmail(employee.email, employee.name, reviewer.name, period, rating)
          .catch(e => console.error("Review email failed:", e.message));
      }
    } catch {}

    res.json({ success: true, review, employeeName: employee.name });

  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).json({ success: false, error: "Failed to create review" });
  }
};

// ── GET /api/performance/my-reviews ──────────────────────────────────────────
// Employee sees their own reviews
exports.getMyReviewsAsEmployee = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== "Employee") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const employee = await Employee.findOne({ email: user.email }).lean();
    if (!employee) return res.status(404).json({ success: false, error: "Employee not found" });

    const reviews = await PerformanceReview.find({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, reviews, employeeId: employee._id });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch reviews" });
  }
};

// ── GET /api/performance/employee/:employeeId ─────────────────────────────────
// Manager / HR / Admin sees reviews for a specific employee
exports.getEmployeeReviews = async (req, res) => {
  try {
    const reviewer = getReviewer(req);
    if (!reviewer) return res.status(401).json({ success: false, error: "Unauthorized" });

    const employee = await Employee.findById(req.params.employeeId).lean();
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (reviewer.role === 'Employee' && String(employee._id) !== String(reviewer.id)) return res.status(403).json({ error: 'Outside your account' });
    if (reviewer.role === 'Manager' && String(employee.managerId) !== String(reviewer.id)) return res.status(403).json({ error: 'Outside your team' });
    const reviews = await PerformanceReview.find({ employeeId: req.params.employeeId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch reviews" });
  }
};

// ── GET /api/performance/all ──────────────────────────────────────────────────
// HR / Admin: all reviews with employee name populated
exports.getAllReviews = async (req, res) => {
  try {
    const reviewer = getReviewer(req);
    if (!reviewer || !["HR", "Admin"].includes(reviewer.role)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const reviews = await PerformanceReview.find()
      .populate("employeeId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch reviews" });
  }
};

// ── GET /api/performance/manager-reviews ──────────────────────────────────────
// Manager: reviews they have given
exports.getManagerGivenReviews = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const reviews = await PerformanceReview.find({ reviewerId: user.id })
      .populate("employeeId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch reviews" });
  }
};

// ── GET /api/performance/team-employees ───────────────────────────────────────
// Manager: get their team members with task/report stats for auto-suggestions
exports.getTeamForReview = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Use findOne({email}) — consistent with managerRoutes.js pattern
    // Avoids ObjectId casting issues when session serialises _id to string
    const manager = await Manager.findOne({ email: user.email }).lean();
    if (!manager) return res.status(404).json({ success: false, error: "Manager not found" });

    const employees = await Employee.find({ managerId: manager._id })
      .select("name email _id")
      .lean();

    console.log("getTeamForReview: manager=", manager.name, "employees found:", employees.length);
    res.json({ success: true, employees });
  } catch (err) {
    console.error("getTeamForReview error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// ── GET /api/performance/suggestions/:employeeId ──────────────────────────────
// Manager: auto-pull task completion rate + work report summary for review form
exports.getAutoSuggestions = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== "Manager") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId).lean();
    if (!employee) return res.status(404).json({ success: false, error: "Employee not found" });

    // Task stats
    const allTasks = await Task.find({ employeeId }).lean();
    const totalTasks     = allTasks.length;
    const approvedTasks  = allTasks.filter(t => t.status === "Approved").length;
    const submittedTasks = allTasks.filter(t => ["Submitted", "Approved"].includes(t.status)).length;
    const overdueTasks   = allTasks.filter(t =>
      t.status === "Pending" && new Date(t.deadline) < new Date()
    ).length;
    const completionRate = totalTasks > 0 ? Math.round((approvedTasks / totalTasks) * 100) : 0;

    // Work report stats
    const reports        = await WorkReport.find({ employeeEmail: employee.email }).lean();
    const totalReports   = reports.length;
    const approvedReports= reports.filter(r => r.status === "Approved").length;
    const totalHours     = reports.reduce((sum, r) => sum + (r.totalHours || 0), 0);

    // Auto-suggest rating based on performance
    let suggestedRating = 3;
    if (completionRate >= 90 && overdueTasks === 0)  suggestedRating = 5;
    else if (completionRate >= 75 && overdueTasks <= 1) suggestedRating = 4;
    else if (completionRate >= 50)                   suggestedRating = 3;
    else if (completionRate >= 25)                   suggestedRating = 2;
    else                                             suggestedRating = 1;

    // Auto-suggest strengths and improvements
    const strengths    = [];
    const improvements = [];

    if (completionRate >= 80)   strengths.push("Consistently completes assigned tasks on time");
    if (approvedReports > 0)    strengths.push("Submits clear and detailed work reports");
    if (totalHours > 100)       strengths.push("Strong work ethic with high hours logged");
    if (overdueTasks === 0 && totalTasks > 0) strengths.push("No overdue tasks — excellent deadline management");

    if (overdueTasks > 2)       improvements.push("Needs to improve deadline adherence");
    if (completionRate < 50)    improvements.push("Task completion rate needs significant improvement");
    if (totalReports === 0)     improvements.push("Should submit regular work reports for better visibility");

    res.json({
      success: true,
      employeeName: employee.name,
      stats: {
        totalTasks, approvedTasks, submittedTasks, overdueTasks,
        completionRate, totalReports, approvedReports, totalHours
      },
      suggestions: {
        rating:       suggestedRating,
        strengths:    strengths.join(". ") || "",
        improvements: improvements.join(". ") || "",
        comments:     `${employee.name} has completed ${approvedTasks} of ${totalTasks} assigned tasks (${completionRate}% completion rate). ` +
                      `${totalReports} work report${totalReports !== 1 ? "s" : ""} submitted with ${totalHours} total hours logged.`
      }
    });
  } catch (err) {
    console.error("Auto-suggestions error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
