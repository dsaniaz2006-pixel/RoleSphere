const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const Admin = require('../backend/models/Admin');
const HR = require('../backend/models/HR');
const Manager = require('../backend/models/Manager');
const Employee = require('../backend/models/Employee');
const Task = require('../backend/models/Task');
const Todo = require('../backend/models/ToDo');
const Attendance = require('../backend/models/Attendance');
const Leave = require('../backend/models/EmployeeLeave');
const Audit = require('../backend/models/AuditLog');
const Transfer = require('../backend/models/TransferRequest');
const Review = require('../backend/models/PerformanceReview');
const nodemailer = require('nodemailer');
jest.spyOn(nodemailer,'createTransport').mockReturnValue({ sendMail:jest.fn().mockResolvedValue({}) });
const password = 'TestPassword!123';
const accept = { Accept:'application/json' };
let mongo, app, users, agents, tasks;
async function login(email, role, target = app) { const agent = request.agent(target); const response = await agent.post('/api/auth/login').send({ email,password,role }); expect(response.status).toBe(302); return agent; }
beforeAll(async () => {
  const fs = require('fs'); const path = require('path');
  fs.mkdirSync(path.join(__dirname,'../tmp'), { recursive:true });
  const dbPath = fs.mkdtempSync(path.join(__dirname,'../tmp/test-mongo-'));
  mongo = await MongoMemoryServer.create({ instance:{ dbPath, args:['--nounixsocket'] } });
  process.env.MONGO_URI = mongo.getUri('rolesphere_test'); process.env.SESSION_SECRET='test-session-secret'; process.env.JWT_SECRET='test-jwt-secret';
  await mongoose.connect(process.env.MONGO_URI);
  app = createApp();
  const hash = await bcrypt.hash(password,4); const approved = { password:hash,status:'approved',isApproved:true };
  users = {};
  users.admin = await Admin.create({ name:'Admin',email:'admin@example.test',password:hash,role:'Admin' });
  users.hr = await HR.create({ name:'HR',email:'hr@example.test',role:'HR',...approved });
  users.m1 = await Manager.create({ name:'Manager One',email:'m1@example.test',...approved });
  users.m2 = await Manager.create({ name:'Manager Two',email:'m2@example.test',...approved });
  users.e1 = await Employee.create({ name:'Employee One',email:'e1@example.test',managerId:users.m1._id,department:'Engineering',...approved });
  users.e2 = await Employee.create({ name:'Employee Two',email:'e2@example.test',managerId:users.m2._id,department:'',...approved });
  tasks = {};
  tasks.own = await Task.create({ title:'Own test task',description:'Deliver tests',employeeId:users.e1._id,deadline:new Date('2030-02-10'),status:'Pending' });
  tasks.other = await Task.create({ title:'Other test task',description:'Private data',employeeId:users.e2._id,deadline:new Date('2030-02-10'),status:'Submitted' });
  for (const Model of [Employee,Attendance,Audit,Task,Todo,Leave]) await Model.init();
  agents={}; for (const [key,role] of [['admin','Admin'],['hr','HR'],['m1','Manager'],['m2','Manager'],['e1','Employee'],['e2','Employee']]) agents[key]=await login(users[key].email,role);
});
afterAll(async () => { await app?.get('sessionStore').close(); await mongoose.disconnect(); await mongo?.stop(); });
test('app construction imports without starting a listener', () => { expect(typeof createApp).toBe('function'); expect(app.get('io')).toBeUndefined(); });
test('health and database readiness return 200', async () => { expect((await request(app).get('/healthz')).status).toBe(200); expect((await request(app).get('/readyz')).body.ready).toBe(true); });
test('anonymous attendance mutation is denied', async () => { expect((await request(app).post('/api/attendance/checkin').set(accept).send({ userId:users.e1.id,userModel:'Employee' })).status).toBe(401); });
test('employee cannot open HR reports', async () => { expect((await agents.e1.get('/api/reports/summary').set(accept)).status).toBe(403); });
test('role violation renders a real 403 page', async () => { const r=await agents.e1.get('/hr/dashboard'); expect(r.status).toBe(403); expect(r.text).toContain('You do not have access'); });
test('public registration cannot create administrators', async () => { const r=await request(app).post('/register').send({ name:'New Admin',email:'hack@example.test',password,role:'Admin' }); expect(r.status).toBe(403); expect(await Admin.countDocuments()).toBe(1); });
test('registration requires a strong enough password', async () => { expect((await request(app).post('/api/auth/register').send({ name:'New',email:'new@example.test',password:'x',role:'Employee' })).status).toBe(400); });
test('legacy login normalizes admin session and never stores password', async () => { const agent=request.agent(app); expect((await agent.post('/login').send({ email:users.admin.email,password,role:'Admin' })).status).toBe(302); const r=await agent.get('/api/auth/me'); expect(r.body.user.role).toBe('Admin'); expect(r.body.user.password).toBeUndefined(); expect(r.body.user.id).toBe(users.admin.id); });
test('sessions survive app reconstruction with Mongo-backed store', async () => { const first=await agents.e1.get('/api/auth/me'); const stored=await mongoose.connection.db.collection('sessions').findOne({ session: { $regex:users.e1.email } }); expect(stored).toBeTruthy(); const other=createApp(); try { const r = await request(other).get('/api/auth/me').set('Cookie', 'connect.sid=' + require('cookie-signature').sign(stored._id, process.env.SESSION_SECRET)); expect(r.status).toBe(401);
    const signed = 's:' + require('cookie-signature').sign(stored._id, process.env.SESSION_SECRET);
    const persisted = await request(other).get('/api/auth/me').set('Cookie', 'connect.sid=' + encodeURIComponent(signed));
    expect(persisted.body.user.id).toBe(first.body.user.id); } finally { await other.get('sessionStore').close(); } });
test('bad login creates an anonymous failure audit', async () => { expect((await request(app).post('/api/auth/login').send({ email:'missing@example.test',password,role:'Employee' })).status).toBe(401); expect(await Audit.findOne({ action:'login.failure','meta.attemptedEmail':'missing@example.test' })).toMatchObject({ actorRole:'Anonymous' }); });
test.each([['admin','/api/admin/dashboard'],['hr','/hr/dashboard'],['m1','/manager/dashboard'],['e1','/employee/dashboard']])('%s dashboard and workspace render', async (key,url) => { const r=await agents[key].get(url); expect(r.status).toBe(200); expect(r.text).toContain('RoleSphere'); expect(r.text).not.toContain('cdn.tailwindcss.com'); const dom = new (require('jsdom').JSDOM)(r.text); for (const script of dom.window.document.querySelectorAll('script:not([src])')) { if (!script.type || script.type === 'text/javascript') { try { new (require('vm').Script)(script.textContent); } catch (error) { require('fs').writeFileSync(require('path').join(__dirname,`../../review/failing-${key}.js`),script.textContent); throw error; } } } dom.window.close(); expect((await agents[key].get('/workspace')).status).toBe(200); });
test('employee cannot impersonate attendance owner', async () => { expect((await agents.e1.post('/api/attendance/checkin').set(accept).send({ userId:users.e2.id,userModel:'Employee' })).status).toBe(403); });
test('manager attendance list only includes own team', async () => { const r=await agents.m1.get('/api/attendance/employees?month=2030-02').set(accept); expect(r.body.employees.map(e=>e._id)).toEqual([users.e1.id]); });
test('employee cannot read another email through legacy API', async () => { expect((await agents.e1.post('/employee/getTasks').send({ email:users.e2.email }).set(accept)).status).toBe(403); });
test('employee cannot toggle another person todo', async () => { const t=await Todo.create({ employeeEmail:users.e2.email,text:'Private' }); expect((await agents.e1.post('/employee/toggleTodo').send({ id:t.id })).status).toBe(404); });
test('personal board supports all three statuses', async () => { const t=await Todo.create({ employeeEmail:users.e1.email,text:'My todo' }); const r=await agents.e1.patch(`/api/board/todos/${t.id}/status`).send({ status:'In Progress' }); expect(r.status).toBe(200); expect(r.body.todo.status).toBe('In Progress'); expect((await agents.e1.patch(`/api/board/todos/${t.id}/status`).send({ status:'Done' })).body.todo.completed).toBe(true); });
test('manager task board is isolated to own team', async () => { const r=await agents.m1.get('/api/board/tasks'); expect(r.body.data.map(t=>t._id)).toEqual([tasks.own.id]); });
test('manager cannot approve another team task', async () => { expect((await agents.m1.patch(`/manager/tasks/${tasks.other.id}/status`).send({ status:'Approved' })).status).toBe(409); expect((await Task.findById(tasks.other.id)).status).toBe('Submitted'); });
test('manager cannot skip submission', async () => { expect((await agents.m1.post('/manager/updateTaskStatus').send({ taskId:tasks.own.id,status:'Approved' })).status).toBe(409); });
test('employee submit then manager review uses one validated transition', async () => { expect((await agents.e1.post('/employee/submitTask').send({ taskId:tasks.own.id })).status).toBe(200); const r=await agents.m1.patch(`/manager/tasks/${tasks.own.id}/status`).send({ status:'Approved',feedback:'Good' }); expect(r.status).toBe(200); expect(r.body.task.status).toBe('Approved'); expect((await agents.e1.post('/employee/submitTask').send({ taskId:tasks.own.id })).status).toBe(404); });
test('employee cannot review a task', async () => { expect((await agents.e1.patch(`/api/board/tasks/${tasks.other.id}/status`).set(accept).send({ status:'Approved' })).status).toBe(403); });
test('malformed dates and operator payloads are rejected', async () => { expect((await agents.e1.post('/api/leave/apply').send({ leaveType:'Annual',startDate:'not-a-date',endDate:'2030-02-10',reason:'Family event' })).status).toBe(400); expect((await request(app).post('/api/auth/login').send({ email:{ $ne:null },password,role:'Admin' })).status).toBe(400); });
test('leave overlap is rejected including legacy URL', async () => { const body={ leaveType:'Unpaid',startDate:'2030-02-11',endDate:'2030-02-12',reason:'Family appointment' }; expect((await agents.e1.post('/api/leave/apply').send(body)).status).toBe(200); const r=await agents.e1.post('/employee/applyLeave').send(body); expect(r.status).toBe(400); expect(r.body.error).toMatch(/overlapping/); });
test('manager cannot approve another team leave', async () => { const leave=await Leave.create({ email:users.e2.email,role:'Employee',leaveType:'Unpaid',startDate:'2030-02-11',endDate:'2030-02-12',totalDays:2,reason:'Family appointment' }); const r=await agents.m1.post('/api/leave/update-status').send({ leaveId:leave.id,status:'Approved' }); expect(r.status).toBe(403); expect((await Leave.findById(leave.id)).status).toBe('Pending'); });
test('HR cannot approve their own HR leave', async () => { const leave=await Leave.create({ email:users.hr.email,role:'HR',leaveType:'Unpaid',startDate:'2030-02-11',endDate:'2030-02-12',totalDays:2,reason:'Family appointment' }); expect((await agents.hr.post('/api/leave/update-status').send({ leaveId:leave.id,status:'Approved' })).status).toBe(403); });
test('transfer requires own manager and full approval chain', async () => {
  expect((await agents.e1.post('/api/transfer/request').send({ reason:'Move to another department for training' })).status).toBe(200);
  const transfer=await Transfer.findOne({ employeeId:users.e1._id });
  expect((await agents.hr.post('/api/transfer/hr-assign').send({ transferId:transfer.id,newManagerId:users.m2.id })).status).toBe(409);
  expect((await agents.m2.post('/api/transfer/manager-review').send({ transferId:transfer.id,status:'Approved' })).status).toBe(404);
  expect((await agents.m1.post('/api/transfer/manager-review').send({ transferId:transfer.id,status:'Approved' })).status).toBe(200);
  expect((await agents.hr.post('/api/transfer/hr-assign').send({ transferId:transfer.id,newManagerId:users.m2.id })).status).toBe(200);
  expect(String((await Employee.findById(users.e1.id)).managerId)).toBe(users.m2.id);
  expect((await agents.hr.post('/api/transfer/hr-assign').send({ transferId:transfer.id,newManagerId:users.m1.id })).status).toBe(409);
});
test('search escapes regex metacharacters', async () => { const r=await agents.admin.get('/api/search?q=%28%5B'); expect(r.status).toBe(200); expect(r.body.data).toEqual([]); });
test('employee search returns only their own tasks', async () => { const r=await agents.e1.get('/api/search?q=test'); expect(r.body.data.map(t=>t._id)).toEqual([tasks.own.id]); });
test('manager search respects current team after a transfer', async () => { expect((await agents.m1.get('/api/search?q=Employee')).body.data).toEqual([]); const r=await agents.m2.get('/api/search?q=Employee'); expect(r.body.data).toHaveLength(2); });
test('people endpoint caps pagination and excludes password', async () => { const r=await agents.hr.get('/api/people/employees?limit=999&page=1&sort=-name'); expect(r.body.limit).toBe(50); expect(r.body.total).toBe(2); expect(r.body.data[0].password).toBeUndefined(); });
test('analytics roles and empty department handling', async () => { expect((await agents.e1.get('/api/analytics/dept-headcount').set(accept)).status).toBe(403); const r=await agents.hr.get('/api/analytics/dept-headcount'); expect(r.body.data).toContainEqual({ _id:'Unassigned',n:1 }); });
test('attendance analytics fills exactly 30 days', async () => { const r=await agents.admin.get('/api/analytics/attendance-trend'); expect(r.body.data).toHaveLength(30); expect(r.body.data.every(d=>typeof d.present==='number')).toBe(true); });
test('leave analytics splits days across month boundary', async () => { await Leave.create({ email:users.e1.email,leaveType:'Unpaid',startDate:'2030-01-31',endDate:'2030-02-04',totalDays:3,reason:'Cross month',status:'Approved' }); const r=await agents.admin.get('/api/analytics/leave-by-month?year=2030'); expect(r.body.data[0]).toEqual({ _id:'2030-01',n:1 }); expect(r.body.data[1]).toEqual({ _id:'2030-02',n:2 }); });
test('audit table is Admin-only and filters actions', async () => { expect((await agents.hr.get('/api/activity').set(accept)).status).toBe(403); const r=await agents.admin.get('/api/activity?action=login.success&limit=2'); expect(r.body.data).toHaveLength(2); expect(r.body.data.every(a=>a.action==='login.success')).toBe(true); expect(r.body.total).toBeGreaterThan(2); });
test('org chart reflects transfer', async () => { const r=await agents.hr.get('/api/people/org'); expect(r.body.data.find(m=>m._id===users.m2.id).reports).toHaveLength(2); });
test('employee cannot read another employee performance history', async () => { expect((await agents.e1.get(`/api/performance/employee/${users.e2.id}`)).status).toBe(403); });
test('exports produce real Excel and PDF', async () => { const excel=await agents.admin.get('/api/reports/summary').buffer(true).parse((res, callback) => { const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>callback(null,Buffer.concat(chunks))); }); expect(excel.status).toBe(200); expect(excel.headers['content-type']).toContain('spreadsheetml'); expect(excel.body.slice(0,2).toString()).toBe('PK'); const pdf=await agents.hr.get('/api/reports/tasks?format=pdf'); expect(pdf.status).toBe(200); expect(pdf.headers['content-type']).toContain('application/pdf'); });
test('deletion via GET no longer mutates records', async () => { expect((await agents.admin.get(`/api/admin/delete-employee/${users.e2.id}`)).status).toBe(404); expect(await Employee.exists({ _id:users.e2.id })).toBeTruthy(); });

test('HR employee reads never expose a password hash', async () => {
  const response=await agents.hr.get('/hr/employees'); expect(response.status).toBe(200); expect(response.body.every(p=>p.password===undefined)).toBe(true);
  const detail=await agents.hr.get(`/hr/view-employee/${users.e1.id}`); expect(detail.body.password).toBeUndefined();
});
test('missing task fields fail validation before writing', async () => { expect((await agents.m2.post('/manager/assignTask').send({ employeeId:users.e1.id,title:'Incomplete' })).status).toBe(400); });
test('role approval and password changes create audit entries', async () => {
  const pending=await Employee.create({ name:'Pending',email:'pending@example.test',password:await bcrypt.hash(password,4) });
  expect((await agents.admin.post('/api/admin/approve-user').send({ userId:pending.id,role:'Employee' })).status).toBe(302);
  const changed=await agents.e2.post('/api/auth/change-password').send({ currentPassword:password,newPassword:'Replacement!1234' }); expect(changed.status).toBe(200);
  expect(await Audit.findOne({ action:'password.change',targetId:users.e2._id })).toBeTruthy();
  expect(await Audit.findOne({ action:'user.approve',targetId:pending._id })).toBeTruthy();
});
test('only pending leave can be reviewed once', async () => {
  const leave=await Leave.create({ email:users.e1.email,role:'Employee',leaveType:'Unpaid',startDate:'2030-03-04',endDate:'2030-03-05',totalDays:2,reason:'Family appointment' });
  expect((await agents.m2.post('/api/leave/update-status').send({ leaveId:leave.id,status:'Approved' })).status).toBe(200);
  expect((await agents.m2.post('/api/leave/update-status').send({ leaveId:leave.id,status:'Rejected' })).status).toBe(400);
});
test('legacy employee list supports paginated filtered responses', async () => {
  const response=await agents.hr.get('/hr/employees?page=1&limit=1&q=Employee&sort=-name');
  expect(response.status).toBe(200); expect(response.body.total).toBe(2); expect(response.body.employees).toHaveLength(1); expect(response.body.data).toEqual(response.body.employees);
});
test('legacy task pagination keeps employee ownership', async () => {
  const response=await agents.e1.post('/employee/getTasks?page=1&limit=1').send({});
  expect(response.status).toBe(200); expect(response.body.tasks.map(t=>t._id)).toEqual([tasks.own.id]);
});
test('a successful login provides a stable welcome token until the next sign-in', async () => {
  const first = await login(users.hr.email, 'HR');
  const a = await first.get('/hr/dashboard');
  expect(a.status).toBe(200);
  const token = /data-login-token="([^"]+)"/.exec(a.text)?.[1];
  expect(token).toMatch(/^[a-f0-9-]{36}$/);
  const refresh = await first.get('/hr/dashboard');
  expect(refresh.text).toContain(`data-login-token="${token}"`);
  const second = await login(users.hr.email, 'HR');
  const b = await second.get('/hr/dashboard');
  expect(b.text).not.toContain(`data-login-token="${token}"`);
  expect(b.text).toContain('data-name="HR"');
});

test.each([['hr','HR','Admin'],['admin','Admin','HR'],['m1','Manager','Employee'],['e1','Employee','Manager']])('verified %s credentials guide the user away from the wrong role',async(key,correct,wrong)=>{
  const session = require('express-session');
  const local = createApp({ store:new session.MemoryStore() });
  const client = request.agent(local);
  const result = await client.post('/login').set(accept).send({email:users[key].email,password,role:wrong});
  expect(result.status).toBe(409);expect(result.body).toMatchObject({code:'WRONG_ROLE',role:correct,redirect:'/login/'+correct});
  expect((await client.get('/api/auth/me').set(accept)).status).toBe(401);
  const target=await client.get(result.body.redirect);expect(target.status).toBe(200);expect(target.text).toContain('Your account belongs to '+correct);expect(target.text).toContain(`value="${users[key].email}"`);expect(target.text).not.toContain(password);
});
test('unverified passwords never reveal another role',async()=>{
 const result=await request(app).post('/login').set(accept).send({email:users.hr.email,password:'Incorrect!12345',role:'Admin'});
 expect(result.status).toBe(401);expect(result.text).toContain('Invalid credentials');expect(result.body.role).toBeUndefined();expect(result.text).not.toContain('Your account belongs');
});
test('remembered sessions last 30 days and ordinary sign-ins use browser-session cookies',async()=>{
 const remembered=await request(app).post('/login').send({email:users.hr.email,password,role:'HR',rememberMe:'on'});expect(remembered.status).toBe(302);const cookie=remembered.headers['set-cookie'].find(c=>c.startsWith('connect.sid='));expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Lax');const expires=/Expires=([^;]+)/.exec(cookie)[1];expect(new Date(expires).getTime()-Date.now()).toBeGreaterThan(29*86400000);
 const ordinary=await request(app).post('/login').send({email:users.hr.email,password,role:'HR'});expect(ordinary.status).toBe(302);expect(ordinary.headers['set-cookie'].find(c=>c.startsWith('connect.sid='))).not.toContain('Expires=');
});
test('dashboard pulse scopes employee tasks and attendance to the signed-in user',async()=>{
 const hash=await bcrypt.hash(password,4),approved={password:hash,status:'approved',isApproved:true};
 const manager=await Manager.create({name:'Scope Manager',email:'scope-manager@example.test',...approved});
 const employee=await Employee.create({name:'Scope Employee',email:'scope-employee@example.test',managerId:manager.id,...approved});
 const other=await Employee.create({name:'Other Scope Employee',email:'other-scope@example.test',...approved});
 await Task.create({title:'Scoped',description:'Own task',employeeId:employee.id,deadline:new Date(),status:'Approved'});
 await Task.create({title:'Private',description:'Other task',employeeId:other.id,deadline:new Date(),status:'Pending'});
 const today=require('../backend/utils/dates').ymd();await Attendance.create({userId:employee.id,userModel:'Employee',date:today,month:today.slice(0,7)});await Attendance.create({userId:other.id,userModel:'Employee',date:today,month:today.slice(0,7)});
 const owner=await login(employee.email,'Employee');const pulse=await owner.get('/api/dashboard/pulse?userId='+other.id).set(accept);expect(pulse.status).toBe(200);expect(pulse.body.totalTasks).toBe(1);expect(pulse.body.completionRate).toBe(100);expect(pulse.body.attendance.reduce((n,r)=>n+r.present,0)).toBe(1);expect(pulse.body.attendance).toHaveLength(7);
 const leader=await login(manager.email,'Manager');const team=await leader.get('/api/dashboard/pulse').set(accept);expect(team.body.totalTasks).toBe(1);expect(team.body.completionRate).toBe(100);expect(team.body.attendance.reduce((n,r)=>n+r.present,0)).toBe(0);
 expect((await request(app).get('/api/dashboard/pulse').set(accept)).status).toBe(401);
});
test('password reset uses the glass layout, updates the hash and consumes its token',async()=>{
 const Token=require('../backend/models/PasswordResetToken');const crypto=require('crypto');const email='recovery@example.test';const original=await bcrypt.hash(password,4);
 await Employee.create({name:'Recovery Test',email,password:original,isApproved:true,status:'approved'});
 const token=crypto.randomBytes(32).toString('hex');await Token.create({email,role:'Employee',token:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)});
 const page=await request(app).get('/reset-password/'+token);expect(page.status).toBe(200);expect(page.text).toContain('auth-form-card');expect(page.text).toContain('/css/auth.css');
 const mismatch=await request(app).post('/reset-password/'+token).send({password:'NewPassword!123',confirmPassword:'NotTheSame!123'});expect(mismatch.text).toContain('Passwords do not match');expect(await Token.countDocuments({email})).toBe(1);
 const changed=await request(app).post('/reset-password/'+token).send({password:'NewPassword!123',confirmPassword:'NewPassword!123'});expect(changed.text).toContain('You’re all set.');const record=await Employee.findOne({email}).select('+password');expect(record.password).not.toBe('NewPassword!123');expect(await bcrypt.compare('NewPassword!123',record.password)).toBe(true);expect(await Token.countDocuments({email})).toBe(0);
 const reused=await request(app).get('/reset-password/'+token);expect(reused.text).toContain('invalid or has expired');expect(reused.text).not.toContain('id="recovery-form"');
});


describe('connected component workspace',()=>{
 let own,other,manager,second,ownAgent,managerAgent,task;
 beforeAll(async()=>{
  const hash=await bcrypt.hash(password,4),approved={password:hash,status:'approved',isApproved:true};
  manager=await Manager.create({name:'Studio Manager',email:'studio-manager@example.test',...approved});
  second=await Manager.create({name:'Other Studio',email:'other-studio@example.test',...approved});
  own=await Employee.create({name:'Studio Member',email:'studio-member@example.test',managerId:manager.id,...approved});
  other=await Employee.create({name:'Private Studio',email:'private-studio@example.test',managerId:second.id,...approved});
  ownAgent=await login(own.email,'Employee');managerAgent=await login(manager.email,'Manager');
  task=await Task.create({title:'Studio project',description:'A real scoped assignment',employeeId:own.id,deadline:new Date('2031-05-20')});
 });
 test.each([['admin','Admin'],['hr','HR'],['m1','Manager'],['e1','Employee']])('%s has a unified private profile and workspace',async(key,role)=>{
  const r=await agents[key].get('/workbench');expect(r.status).toBe(200);expect(r.text).toContain('workbench-ui.js');expect(r.text).toContain(`data-role="${role}"`);
  const profile=await agents[key].get('/api/workbench/profile').set(accept);expect(profile.status).toBe(200);expect(profile.body.profile.role).toBe(role);expect(profile.body.profile.password).toBeUndefined();
 });
 test('workspace APIs require a session',async()=>{expect((await request(app).get('/api/workbench/profile').set(accept)).status).toBe(401);});
 test('profile persists phone and DOB, ignores privilege fields and updates session name',async()=>{
  expect((await ownAgent.patch('/api/workbench/profile').send({name:'New Studio Name',phone:'+91 123 456 7890',dob:'1998-04-12',bio:'Design and delivery',role:'Admin',email:'stolen@example.test',isApproved:false})).status).toBe(200);
  const r=await ownAgent.get('/api/workbench/profile');expect(r.body.profile).toMatchObject({name:'New Studio Name',phone:'+91 123 456 7890',dob:'1998-04-12',bio:'Design and delivery',email:own.email,role:'Employee'});
  expect((await ownAgent.get('/api/auth/me')).body.user.name).toBe('New Studio Name');expect((await Employee.findById(own.id)).dob).toBeUndefined();
 });
 test.each(['1998-02-30','9999-01-01','not-a-date'])('profile rejects invalid or future DOB %s',async dob=>{expect((await ownAgent.patch('/api/workbench/profile').send({name:'Studio',phone:'',dob,bio:''})).status).toBe(400);});
 const plan={startDate:'2031-05-01',submissionDate:'2031-05-18',progress:65,notes:'Design review complete',goals:[{text:'Review',done:true},{text:'Delivery',done:false}]};
 test('task calendar and progress persist without changing workflow status',async()=>{
  expect((await ownAgent.put(`/api/workbench/tasks/${task.id}/plan`).send(plan)).status).toBe(200);
  const r=await ownAgent.get('/api/workbench/tasks');expect(r.body.tasks.find(t=>t._id===task.id).plan).toMatchObject(plan);expect((await Task.findById(task.id)).status).toBe('Pending');
  const managed=await managerAgent.get('/api/workbench/tasks');expect(managed.body.tasks.map(t=>t._id)).toContain(task.id);
 });
 test('task plans reject reversed dates, excessive progress and invalid milestones',async()=>{
  for(const patch of [{submissionDate:'2031-04-30'},{progress:101},{goals:[{text:'',done:true}]},{startDate:'2031-02-30'}])expect((await ownAgent.put(`/api/workbench/tasks/${task.id}/plan`).send({...plan,...patch})).status).toBe(400);
 });
 test('another manager and employee cannot access task plans',async()=>{
  expect((await agents.e2.put(`/api/workbench/tasks/${task.id}/plan`).send(plan)).status).toBe(404);
  expect((await agents.m2.put(`/api/workbench/tasks/${task.id}/plan`).send(plan)).status).toBe(404);
 });
 test('manager assigned tasks also appear in their own planner',async()=>{
  const t=await Task.create({title:'Manager delivery',description:'Own assignment',managerId:manager.id,assignedToModel:'Manager',deadline:new Date('2031-06-20')});
  expect((await managerAgent.get('/api/workbench/tasks')).body.tasks.map(t=>t._id)).toContain(t.id);
  expect((await ownAgent.get('/api/workbench/tasks')).body.tasks.map(t=>t._id)).not.toContain(t.id);
 });
 test('attendance calendar is self scoped, supports historical months and never writes a record',async()=>{
  await Attendance.create([{userId:own.id,userModel:'Employee',date:'2031-05-02',month:'2031-05',checkIn:'09:00',status:'present'},{userId:other.id,userModel:'Employee',date:'2031-05-02',month:'2031-05',checkIn:'09:10',status:'present'}]);
  const before=await Attendance.countDocuments();const r=await ownAgent.get(`/api/workbench/attendance?month=2031-05&userId=${other.id}`);expect(r.body.records).toHaveLength(1);expect(r.body.records[0].checkIn).toBe('09:00');expect(r.body.records[0].userId).toBeUndefined();expect(await Attendance.countDocuments()).toBe(before);
  expect((await ownAgent.get('/api/workbench/attendance?month=2031-99')).status).toBe(400);
 });
 test('team candidate directory omits private profile data',async()=>{
  const r=await managerAgent.get('/api/workbench/team-options');expect(r.status).toBe(200);expect(r.body.employees.map(e=>e._id)).toEqual([own.id]);expect(r.body.employees[0].dob).toBeUndefined();expect(r.body.employees[0].phone).toBeUndefined();expect(r.body.employees[0].email).toBeUndefined();
  expect((await ownAgent.get('/api/workbench/team-options').set(accept)).status).toBe(403);
 });
 test('HR and Manager create teams, preserving reporting lines and role boundaries',async()=>{
  const body={name:'Studio team',description:'Build together',managerId:manager.id,memberIds:[own.id]};
  expect((await managerAgent.post('/api/workbench/teams').send(body)).status).toBe(201);
  expect((await agents.hr.post('/api/workbench/teams').send({...body,name:'HR studio'})).status).toBe(201);
  expect((await managerAgent.post('/api/workbench/teams').send({...body,memberIds:[other.id]})).status).toBe(400);
  expect((await managerAgent.post('/api/workbench/teams').send({...body,managerId:second.id,memberIds:[other.id]})).status).toBe(403);
  expect((await ownAgent.post('/api/workbench/teams').set(accept).send(body)).status).toBe(403);
  expect((await agents.admin.post('/api/workbench/teams').set(accept).send(body)).status).toBe(403);
  expect((await Employee.findById(own.id)).managerId.toString()).toBe(manager.id);
  expect((await ownAgent.get('/api/workbench/teams')).body.teams).toHaveLength(2);
  expect((await agents.m2.get('/api/workbench/teams')).body.teams).toHaveLength(0);
 });
 test('team cards stop exposing members after a reporting transfer',async()=>{
  await Employee.updateOne({_id:own.id},{$set:{managerId:second.id}});
  const teams=(await managerAgent.get('/api/workbench/teams')).body.teams;expect(teams.every(t=>t.members.length===0)).toBe(true);
  expect((await ownAgent.get('/api/workbench/teams')).body.teams).toHaveLength(0);
 });
});

test('demo seed creates requested dataset and reruns without duplicates', async () => {
  await mongoose.disconnect();
  process.env.MONGO_URI = mongo.getUri('rolesphere_demo');
  const { seed } = require('../scripts/seed');
  const logs = jest.spyOn(console,'log').mockImplementation(() => {});
  await seed();
  const db=mongoose.connection.db;
  expect(await db.collection('Admin').countDocuments()).toBe(1);
  expect(await db.collection('HR').countDocuments()).toBe(2);
  expect(await db.collection('Manager').countDocuments()).toBe(3);
  expect(await db.collection('Employees').countDocuments()).toBe(20);
  expect(await db.collection('attendances').countDocuments()).toBe(1500);
  expect(await db.collection('Tasks').countDocuments()).toBe(80);
  await seed();
  expect(await db.collection('Tasks').countDocuments()).toBe(80);
  expect(await db.collection('Employees').countDocuments()).toBe(20);
  logs.mockRestore();
});
