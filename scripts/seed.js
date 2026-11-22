require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../backend/models/Admin');
const HR = require('../backend/models/HR');
const Manager = require('../backend/models/Manager');
const Employee = require('../backend/models/Employee');
const Attendance = require('../backend/models/Attendance');
const Task = require('../backend/models/Task');
const Leave = require('../backend/models/EmployeeLeave');
const Balance = require('../backend/models/LeaveBalance');
const Review = require('../backend/models/PerformanceReview');
const Todo = require('../backend/models/ToDo');
const { ymd, workingDays } = require('../backend/utils/dates');
const { isPlaceholder } = require('../backend/config/environment');

function requireDemoPassword(env = process.env) {
  const password = typeof env.DEMO_PASSWORD === 'string' ? env.DEMO_PASSWORD.trim() : '';
  if (!password || password.length < 12 || isPlaceholder(password)) {
    throw new Error('Set a unique DEMO_PASSWORD of at least 12 characters in your local .env before seeding.');
  }
  return password;
}
async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri || !/\/rolesphere_demo(?:[?]|$)/.test(uri)) throw new Error('Seed only accepts a database named rolesphere_demo. Set MONGO_URI accordingly.');
  const password = requireDemoPassword();
  await mongoose.connect(uri);
  console.log('Connected. Creating demo accounts...');
  const hashed = await bcrypt.hash(password, 12);
  async function person(Model, email, name, extra = {}) {
    return Model.findOneAndUpdate({ email }, { $set: { name, password: hashed, ...extra } }, { upsert:true,new:true,setDefaultsOnInsert:true });
  }
  const approved = { isApproved:true,status:'approved' };
  await person(Admin,'admin@rolesphere.demo','Demo Admin',{ role:'Admin' });
  const hrs = await Promise.all([1,2].map(i => person(HR,`hr${i}@rolesphere.demo`,`HR ${i}`,{ ...approved,role:'HR' })));
  const managers = await Promise.all([1,2,3].map(i => person(Manager,`manager${i}@rolesphere.demo`,`Manager ${i}`,approved)));
  const departments = ['Engineering','Design','Sales','Operations'];
  const employees = [];
  for (let i = 1; i <= 20; i++) employees.push(await person(Employee,`employee${i}@rolesphere.demo`,`Employee ${String(i).padStart(2,'0')}`,{ ...approved,managerId:managers[(i-1)%3]._id,department:departments[(i-1)%4] }));
  // Touch only the known demo accounts; rerunning does not duplicate sample records.
  const people = [...employees.map(p => [p,'Employee']),...managers.map(p => [p,'Manager']),...hrs.map(p => [p,'HR'])];
  const ids = people.map(([p]) => p._id); const emails = people.map(([p]) => p.email);
  await Promise.all([Attendance.deleteMany({ userId:{ $in:ids } }),Task.deleteMany({ employeeId:{ $in:employees.map(e => e._id) } }),Leave.deleteMany({ email:{ $in:emails } }),Balance.deleteMany({ email:{ $in:emails } }),Review.deleteMany({ employeeId:{ $in:employees.map(e => e._id) } }),Todo.deleteMany({ employeeEmail:{ $in:emails } })]);
  console.log('Creating attendance and workflow records...');
  const records = [];
  for (let day = 0; day < 60; day++) {
    const date = ymd(new Date(Date.now() - day * 864e5)); const sunday = new Date(date+'T00:00:00Z').getUTCDay() === 0;
    for (const [index,[p,userModel]] of people.entries()) { const absent = !sunday && (index+day)%11 === 0; const late = !sunday && !absent && (index+day)%7 === 0;
      records.push({ userId:p._id,userModel,date,month:date.slice(0,7),status:sunday?'holiday':absent?'absent':'present',checkIn:sunday||absent?null:late?'09:35:00':'09:00:00',checkOut:sunday||absent?null:'17:30:00',isLate:late }); }
  }
  await Attendance.insertMany(records);
  const statuses = ['Pending','Submitted','Approved','Rejected'];
  await Task.insertMany(employees.flatMap((e,i) => statuses.map((status,j) => ({ employeeId:e._id,title:`${departments[i%4]} task ${j+1}`,description:'Demo task for the workflow walkthrough',deadline:new Date(Date.now()+(j-1)*864e5),status,...(status!=='Pending'?{ submittedAt:new Date() }:{}) }))));
  const leaves = employees.flatMap((e,i) => ['Pending','Approved','Rejected'].map((status,j) => { let date = ymd(new Date(Date.now()+(i+j*30+1)*864e5)); while (!workingDays(date,date)) date = new Date(new Date(date+'T00:00:00Z').getTime()+864e5).toISOString().slice(0,10); return { email:e.email,role:'Employee',leaveType:'Unpaid',startDate:date,endDate:date,totalDays:Math.max(1,workingDays(date,date)),reason:'Demo family appointment',status }; }));
  await Leave.insertMany(leaves);
  await Review.insertMany(employees.slice(0,8).map((e,i) => ({ employeeId:e._id,reviewerId:e.managerId,reviewerModel:'Manager',reviewerName:managers.find(m => String(m._id)===String(e.managerId)).name,period:ymd().slice(0,7),rating:3+i%3,comments:'Consistent delivery with clear communication',strengths:'Teamwork',improvements:'Documentation',goals:[{ description:'Complete onboarding notes',status:'In Progress' }] })));
  await Todo.insertMany(employees.flatMap(e => ['Pending','In Progress','Done'].map(status => ({ employeeEmail:e.email,text:`Demo ${status.toLowerCase()} item`,status,completed:status==='Done' }))));
  console.log('Demo data ready: 1 Admin, 2 HR, 3 managers, 20 employees, 60 days attendance, 80 tasks, 60 leaves, 8 reviews.');
  console.log('Logins: admin@rolesphere.demo; hr1@rolesphere.demo; manager1@rolesphere.demo; employee1@rolesphere.demo');
}
if (require.main === module) seed().catch(e => { console.error(e.message); process.exitCode=1; }).finally(() => mongoose.disconnect());
module.exports = { seed, requireDemoPassword };
