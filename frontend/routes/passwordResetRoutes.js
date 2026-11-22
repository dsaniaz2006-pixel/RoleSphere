const express = require("express");
const router = express.Router();
const {
  getForgotPassword,
  postForgotPassword,
  getResetPassword,
  postResetPassword,
} = require("../../backend/controllers/passwordResetController");

// Forgot password page (enter email)
router.get("/forgot-password", getForgotPassword);
router.post("/forgot-password", postForgotPassword);

// Reset password page (enter new password via token link)
router.get("/reset-password/:token", getResetPassword);
router.post("/reset-password/:token", postResetPassword);

module.exports = router;
