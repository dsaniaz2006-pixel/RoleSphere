const { audit } = require('../services/auditService');
const mutations = [
 [/approve-user$/, 'user.approve', 'User'], [/reject-user$/, 'user.reject', 'User'],
 [/update-status$/, 'leave.decision', 'EmployeeLeave'], [/updateLeaveStatus$/, 'leave.decision', 'EmployeeLeave'],
 [/manager-review$/, 'transfer.manager-decision', 'TransferRequest'], [/hr-assign$/, 'transfer.assign', 'TransferRequest'], [/hr-reject$/, 'transfer.reject', 'TransferRequest'],
 [/delete-manager\//, 'manager.remove', 'Manager'], [/removeEmployee$/, 'employee.remove', 'Employee'],
 [/reset-password\//, 'password.reset', 'User']
];
module.exports = (req, res, next) => {
  const match = mutations.find(([rx]) => rx.test(req.path));
  const exporting = req.method === 'GET' && req.path.startsWith('/api/reports/');
  if (!match && !exporting) return next();
  const actor = req.currentUser || req.session?.admin || req.session?.user;
  const context = { currentUser: actor, session: { admin: req.session?.admin }, ip: req.ip };
  const body = req.body || {};
  res.once('finish', () => {
    if (res.statusCode >= 400 || (!actor && !exporting)) return;
    const id = body.transferId || body.leaveId || body.userId || body.employeeId || req.path.split('/').pop();
    const target = { type: match?.[2] || 'Report', ...(/^[a-f0-9]{24}$/i.test(id || '') ? { id } : {}) };
    const action = match?.[1] === 'leave.decision' ? `leave.${body.status === 'Approved' ? 'approve' : 'reject'}` : match?.[1] || 'report.export';
    void audit(context, action, target, { path: req.path, status: body.status, role: body.role, month: req.query.month });
  });
  next();
};
