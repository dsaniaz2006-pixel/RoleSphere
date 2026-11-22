const Task = require('../models/Task');
const Employee = require('../models/Employee');
const { audit } = require('./auditService');
async function reviewTask(req, res, next) {
  try {
    const id = req.params.id || req.body.taskId;
    const { status, feedback = '' } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Managers may only approve or reject a submitted task' });
    const employeeIds = await Employee.find({ managerId: req.currentUser.id }).distinct('_id');
    const task = await Task.findOneAndUpdate({ _id: id, employeeId: { $in: employeeIds }, assignedToModel: 'Employee', status: 'Submitted' },
      { $set: { status, managerFeedback: feedback } }, { new: true, runValidators: true });
    if (!task) return res.status(409).json({ error: 'Task is outside your team or is no longer Submitted' });
    await audit(req, `task.${status.toLowerCase()}`, { type: 'Task', id: task._id });
    res.json({ success: true, task, message: 'Task reviewed' });
  } catch (error) { next(error); }
}
module.exports = { reviewTask };
