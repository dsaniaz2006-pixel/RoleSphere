const router = require('express').Router();
const mongoose = require('mongoose');
const { requireSession } = require('../middleware/authMiddleware');
const Task = require('../models/Task');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { ymd } = require('../utils/dates');
router.get('/pulse', requireSession, async (req, res, next) => {
  try {
    const actor = req.currentUser;
    if (!['Admin','HR','Manager','Employee'].includes(actor.role)) return res.status(403).json({ error:'Forbidden' });
    const id = new mongoose.Types.ObjectId(actor.id);
    let taskFilter = {}, attendanceFilter = {}, scope = 'Organization';
    if (actor.role === 'Manager') {
      const employees = await Employee.find({ managerId:id }).select('_id').lean();
      taskFilter = { employeeId:{ $in:employees.map(e=>e._id) } };
      attendanceFilter = { userId:id, userModel:'Manager' }; scope = 'Your team';
    } else if (actor.role === 'Employee') {
      taskFilter = { employeeId:id };attendanceFilter = { userId:id, userModel:'Employee' };scope = 'Your work';
    }
    const dates = Array.from({ length:7 },(_,i)=>ymd(new Date(Date.now()-(6-i)*864e5)));
    const [tasks, attendance] = await Promise.all([
      Task.aggregate([{ $match:taskFilter },{ $group:{ _id:'$status', n:{ $sum:1 } } }]),
      Attendance.aggregate([{ $match:{ ...attendanceFilter, date:{ $gte:dates[0], $lte:dates[6] }, status:'present' } },{ $group:{ _id:'$date', present:{ $sum:1 }, late:{ $sum:{ $cond:['$isLate',1,0] } } } }])
    ]);
    const statuses = ['Pending','Submitted','Approved','Rejected'].map(status=>({ status, count:tasks.find(row=>row._id===status)?.n || 0 }));
    const total = statuses.reduce((sum,row)=>sum+row.count,0);
    res.json({ success:true, scope, attendanceScope:['Admin','HR'].includes(actor.role)?'Organization':'Your attendance', taskStatus:statuses, totalTasks:total, completionRate:total?Math.round(statuses.find(row=>row.status==='Approved').count/total*100):null, attendance:dates.map(date=>({ date, present:attendance.find(row=>row._id===date)?.present||0, late:attendance.find(row=>row._id===date)?.late||0 })) });
  } catch (error) { next(error); }
});
module.exports = router;
