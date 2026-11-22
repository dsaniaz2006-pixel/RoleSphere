const { body, validationResult } = require('express-validator');
const ids = ['id', 'taskId', 'employeeId', 'managerId', 'newManagerId', 'transferId', 'leaveId', 'userId', 'reportId', 'complaintId', 'reviewerId'];
const texts = { name: [1, 100], title: [1, 200], text: [1, 1000], description: [1, 5000], reason: [5, 500], feedback: [0, 2000], comments: [1, 5000], department: [0, 100], phone: [0, 30], address: [0, 500], managerNote: [0, 2000], hrNote: [0, 2000] };
function rules(req) {
  return [
    ...ids.filter(f => !(f === 'managerId' && req.path === '/hr/assignTask') && !(f === 'employeeId' && req.path === '/employee/submitWorkReport')).map(f => body(f).optional({ values: 'falsy' }).isString().bail().isMongoId().withMessage(`${f} must be a valid ID`)),
    body('email').optional().isString().bail().trim().isEmail().isLength({ max: 254 }).toLowerCase(),
    ...Object.entries(texts).map(([f, [min, max]]) => body(f).optional().isString().bail().trim().isLength({ min, max }).withMessage(`${f} must contain ${min}-${max} characters`)),
    ...['password', 'currentPassword'].map(f => body(f).optional().isString().bail().isLength({ min: 1, max: 128 })),
    body('newPassword').optional().isString().bail().isLength({ min: 8, max: 128 }),
    ...['startDate', 'endDate'].map(f => body(f).optional().isString().bail().matches(/^\d{4}-\d{2}-\d{2}$/).bail().isISO8601({ strict: true })),
    body('endDate').optional().custom((value, { req }) => !req.body.startDate || value >= req.body.startDate).withMessage('End date must be on or after start date'),
    body('endDate').optional().custom((value, { req }) => !/leave/i.test(req.path) || !req.body.startDate || (new Date(value) - new Date(req.body.startDate)) <= 366*864e5).withMessage('Leave must be within one year'),
    body('deadline').optional().isISO8601({ strict: true }),
    body('role').optional().isIn(['Admin', 'HR', 'Manager', 'Employee']),
    body('leaveType').optional().isIn(['Annual', 'Sick', 'Casual', 'Unpaid']),
    body('rating').optional().isFloat({ min: 1, max: 5 }),
    body('totalHours').optional().isFloat({ min:0,max:10000 }),
    body('reportName').optional().isString().bail().trim().isLength({ min:1,max:200 }),
    body('message').optional().isString().bail().trim().isLength({ min:1,max:5000 }),
    body('complaintText').optional().isString().bail().trim().isLength({ min:10,max:5000 }),
    body('period').optional().isString().bail().trim().isLength({ min:1,max:30 }),
    body('status').optional().isString().bail().isIn(['Pending', 'Submitted', 'Approved', 'Rejected', 'pending', 'approved', 'rejected', 'present', 'absent', 'holiday', 'Open', 'Resolved', 'Under Review', 'Accepted', 'In Progress', 'Done', 'Reviewed']),
  ];
}
function finish(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg, fields: errors.array().map(e => ({ field: e.path, message: e.msg })) });
  next();
}
async function validateWrite(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.is('multipart/form-data') && !req._multipartParsed) return next(); // rerun immediately after multer parses the fields
  const requiredByPath = {
    '/api/auth/login': ['email','password','role'], '/login': ['email','password','role'],
    '/hr/login': ['email','password'], '/manager/login': ['email','password'], '/api/admin/login': ['email','password'],
    '/api/auth/register': ['name','email','password','role'], '/register': ['name','email','password','role'],
    '/hr/register': ['name','email','password'], '/manager/register': ['name','email','password'], '/employee/register': ['name','email','password'],
    '/api/auth/change-password': ['currentPassword','newPassword'], '/forgot-password': ['email'],
    '/api/leave/apply': ['leaveType','startDate','endDate','reason'], '/employee/applyLeave': ['startDate','endDate','reason'], '/hr/applyLeave': ['startDate','endDate','reason'],
    '/api/leave/update-status': ['leaveId','status'], '/manager/updateLeaveStatus': ['leaveId','status'], '/api/admin/updateLeaveStatus': ['leaveId','status'],
    '/manager/assignTask': ['employeeId','title','description','deadline'], '/hr/assignTask': ['managerId','title','description','deadline'],
    '/api/transfer/request': ['reason'], '/api/transfer/manager-review': ['transferId','status'], '/api/transfer/hr-assign': ['transferId','newManagerId'], '/api/transfer/hr-reject': ['transferId'],
    '/api/performance/create': ['employeeId','rating','comments','period'],
    '/employee/addTodo': ['text'], '/employee/toggleTodo': ['id'], '/employee/deleteTodo': ['id'], '/employee/updateProfile': ['name'],
    '/employee/submitWorkReport': ['startDate','endDate','totalHours','reportName','description'],
    '/manager/reviewReport': ['reportId','status'], '/manager/removeEmployee': ['employeeId'], '/manager/addEmployee': ['employeeId'],
    '/api/admin/approve-user': ['userId','role'], '/api/admin/reject-user': ['userId','role'],
    '/admin/approve-user': ['userId','role'], '/admin/reject-user': ['userId','role'],
    '/api/admin/add-hr': ['name','email','password'], '/api/admin/add-manager': ['name','email','password'], '/hr/add-employee': ['name','email','password']
  };
  for (const field of requiredByPath[req.path] || []) await body(field).exists({ values:'falsy' }).withMessage(`${field} is required`).run(req);
  if (/\/(register|add-hr|add-manager|add-employee)$/.test(req.path)) await body('password').isLength({ min:8,max:128 }).withMessage('Password must contain 8-128 characters').run(req);
  for (const rule of rules(req)) await rule.run(req);
  // Reject operator-shaped payloads even on legacy write handlers.
  function unsafe(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) => key.startsWith('$') || key.includes('.') || unsafe(child));
  }
  if (unsafe(req.body)) return res.status(400).json({ success: false, error: 'Invalid request fields' });
  finish(req, res, next);
}
const required = (...fields) => [...fields.map(f => body(f).exists({ values: 'falsy' }).withMessage(`${f} is required`)), finish];
module.exports = { validateWrite, required, finish };
