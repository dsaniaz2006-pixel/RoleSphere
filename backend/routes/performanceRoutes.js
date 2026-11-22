const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/performanceController");

// All session checks are done inside the controller — no middleware dependency issues

// ── Manager / HR / Admin creates a review ────────────────────────────────────
router.post("/create", ctrl.createReview);

// ── Employee sees their own reviews ──────────────────────────────────────────
router.get("/my-reviews", ctrl.getMyReviewsAsEmployee);

// ── Manager gets their team for the review form ───────────────────────────────
router.get("/team-employees", ctrl.getTeamForReview);

// ── Manager gets auto-suggestions for a specific employee ─────────────────────
router.get("/suggestions/:employeeId", ctrl.getAutoSuggestions);

// ── Manager sees reviews they have given ──────────────────────────────────────
router.get("/manager-reviews", ctrl.getManagerGivenReviews);

// ── HR / Admin sees all reviews ───────────────────────────────────────────────
router.get("/all", ctrl.getAllReviews);

// ── Anyone authorised sees reviews for a specific employee ────────────────────
router.get("/employee/:employeeId", ctrl.getEmployeeReviews);

module.exports = router;
