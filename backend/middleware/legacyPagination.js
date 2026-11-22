/* Existing dashboards retain their original response shape when they do not
   request paging. New callers can page/filter/sort without another API rewrite. */
const { requireRole } = require('./authMiddleware');
const { list, escapeRegex } = require('../utils/pagination');
const Employee = require('../models/Employee');
const Manager = require('../models/Manager');
const HR = require('../models/HR');
const Task = require('../models/Task');
const Leave = require('../models/EmployeeLeave');
const Todo = require('../models/ToDo');
const WorkReport = require('../models/WorkReport');
const Transfer = require('../models/TransferRequest');
const Complaint = require('../models/RemovalComplaint');
const Review = require('../models/PerformanceReview');
const Announcement = require('../models/Announcement');
const routes = {
  '/hr/employees': [Employee, 'employees', ['HR'], ['name','email','department']],
  '/hr/managers': [Manager, 'managers', ['HR'], ['name','email']],
  '/hr/assignedTasks': [Task, 'tasks', ['HR'], ['title'], () => ({ assignedToModel:'Manager' })],
  '/manager/employees': [Employee, 'employees', ['Manager'], ['name','email','department'], req => ({ managerId:req.currentUser.id })],
  '/manager/availableEmployees': [Employee, 'employees', ['Manager'], ['name','email'], () => ({ managerId:null,status:'approved' })],
  '/employee/getTasks': [Task, 'tasks', ['Employee'], ['title'], req => ({ employeeId:req.currentUser.id })],
  '/employee/getTodos': [Todo, 'todos', ['Employee'], ['text'], req => ({ employeeEmail:req.currentUser.email })],
  '/employee/getLeaves': [Leave, 'leaves', ['Employee'], ['reason'], req => ({ email:req.currentUser.email })],
  '/employee/getWorkReports': [WorkReport, 'reports', ['Employee'], ['reportName','description'], req => ({ employeeEmail:req.currentUser.email })],
  '/employee/getManagerReports': [WorkReport, 'reports', ['Employee'], ['reportName'], req => ({ employeeEmail:req.currentUser.email,status:{ $in:['Approved','Rejected'] } })],
  '/manager/getMyTasks': [Task, 'tasks', ['Manager'], ['title'], req => ({ managerId:req.currentUser.id,assignedToModel:'Manager' })],
  '/api/leave/my-leaves': [Leave, 'leaves', ['Employee','HR'], ['reason'], req => ({ email:req.currentUser.email })],
  '/api/leave/all-leaves': [Leave, 'leaves', ['Admin','HR'], ['email','reason']],
  '/api/transfer/manager-requests': [Transfer, 'requests', ['Manager'], ['employeeName','reason'], req => ({ currentManagerId:req.currentUser.id })],
  '/api/transfer/hr-requests': [Transfer, 'requests', ['HR'], ['employeeName','reason'], () => ({ managerStatus:'Approved',hrStatus:'Pending' })],
  '/api/complaints/all': [Complaint, 'complaints', ['HR'], ['employeeName','complaintText']],
  '/api/performance/my-reviews': [Review, 'reviews', ['Employee'], ['period','comments'], req => ({ employeeId:req.currentUser.id })],
  '/api/performance/manager-reviews': [Review, 'reviews', ['Manager'], ['period','comments'], req => ({ reviewerId:req.currentUser.id })],
  '/api/performance/all': [Review, 'reviews', ['Admin','HR'], ['period','comments']],
  '/api/overview/announcements': [Announcement, 'announcements', ['Admin','HR','Manager','Employee'], ['title','message']],
};
module.exports = function legacyPagination(req, res, next) {
  const config = routes[req.path];
  if (!config || !['GET','POST'].includes(req.method) || !['page','limit','sort','q'].some(k => req.query[k] !== undefined)) return next();
  const [Model,key,roles,search,scope] = config;
  requireRole(...roles)(req,res,async () => {
    try {
      const filter = scope ? scope(req) : {};
      if (req.query.q) {
        const rx = new RegExp(escapeRegex(String(req.query.q).slice(0,80)),'i');
        filter.$or = search.map(field => ({ [field]:rx }));
      }
      if (req.query.status && !filter.status) filter.status=String(req.query.status).slice(0,30);
      const allowed=[...search,'status','createdAt','deadline','startDate','submittedAt'];
      const result=await list(Model,filter,req.query,'-password -__v',allowed,search[0]);
      if (key === 'leaves' || key === 'reports') {
        const emails=result.data.map(r=>r.email || r.employeeEmail);
        const employees=await Employee.find({ email:{ $in:emails } }).select('name email').lean();
        const names=new Map(employees.map(e=>[e.email,e.name]));
        result.data=result.data.map(r=>({ ...r,employeeName:names.get(r.email || r.employeeEmail) || r.email || r.employeeEmail }));
      }
      res.json({ success:true,...result,[key]:result.data });
    } catch (error) { next(error); }
  });
};
