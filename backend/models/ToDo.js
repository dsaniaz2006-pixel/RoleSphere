const mongoose = require("mongoose");

const TodoSchema = new mongoose.Schema({
  employeeEmail: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  status: { type: String, enum: ["Pending", "In Progress", "Done"], default: "Pending" },
  completed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

TodoSchema.index({ employeeEmail: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model("ToDo", TodoSchema);