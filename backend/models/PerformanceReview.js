const mongoose = require("mongoose");

const performanceReviewSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reviewerModel: {
    type: String,
    enum: ["Manager", "HR", "Admin"],
    required: true
  },
  reviewerName: {
    type: String,
    required: true
  },
  period: {                    // e.g., "2025-Q2", "2025-06"
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comments: {
    type: String,
    required: true,
    trim: true
  },
  goals: [{
    description: String,
    status: { type: String, enum: ["Pending", "In Progress", "Achieved"] }
  }],
  strengths: String,
  improvements: String,
  createdAt: { type: Date, default: Date.now }
}, { collection: "PerformanceReviews" });

// Indexes for performance
performanceReviewSchema.index({ employeeId: 1, period: 1 });
performanceReviewSchema.index({ reviewerId: 1 });

module.exports = mongoose.model("PerformanceReview", performanceReviewSchema);