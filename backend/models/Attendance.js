const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  userModel: { type: String, enum: ['Employee', 'HR', 'Manager'], required: true },
  date:      { type: String, required: true },
  month:     { type: String, required: true },
  checkIn:   { type: String, default: null },
  checkOut:  { type: String, default: null },
  status:    { type: String, enum: ['present', 'absent', 'holiday'], default: 'present' },
  isLate:    { type: Boolean, default: false }
});

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

attendanceSchema.index({ date: 1, status: 1 });
module.exports = mongoose.model('Attendance', attendanceSchema);