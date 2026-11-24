'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  seed,
  SEED_CONFIRMATION,
  DEFAULT_DEMO_PASSWORD
} = require('../scripts/seed');
const { DEMO_ACCOUNTS } = require('../backend/config/demoAccounts');
const { DEMO_KEY, runWithDemoContext } = require('../backend/middleware/demoIsolation');

const Admin = require('../backend/models/Admin');
const HR = require('../backend/models/HR');
const Manager = require('../backend/models/Manager');
const Employee = require('../backend/models/Employee');
const Attendance = require('../backend/models/Attendance');
const Task = require('../backend/models/Task');
const Leave = require('../backend/models/EmployeeLeave');

let mongo;
let uri;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  uri = mongo.getUri('EmployeeManage');
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongo?.stop();
});

test('seed refuses to overwrite a real account that collides with a demo email', async () => {
  await mongoose.connect(uri);
  await Employee.create({
    name: 'Real account using a reserved demo email',
    email: DEMO_ACCOUNTS.Employee.email,
    password: await bcrypt.hash('RealPassword!123', 4),
    isApproved: true,
    status: 'approved'
  });
  await mongoose.disconnect();

  const env = {
    MONGO_URI: uri,
    DEMO_MODE: 'true',
    DEMO_SEED_CONFIRM: SEED_CONFIRMATION
  };

  await expect(seed(env)).rejects.toThrow(/already exists outside the public demo/);

  await mongoose.connect(uri);
  expect(await Admin.countDocuments({ demoKey: DEMO_KEY })).toBe(0);
  const collision = await Employee.findOne({ email: DEMO_ACCOUNTS.Employee.email }).select('+password').lean();
  expect(collision.name).toBe('Real account using a reserved demo email');
  expect(await bcrypt.compare('RealPassword!123', collision.password)).toBe(true);

  // Remove this isolated test fixture only, so the next test can seed cleanly.
  await Employee.deleteOne({ _id: collision._id });
  await mongoose.disconnect();
});

test('seed is idempotent and leaves unrelated existing records untouched', async () => {
  await mongoose.connect(uri);
  await HR.create({
    name: 'Real HR - Private Name',
    email: 'real.hr@example.test',
    password: await bcrypt.hash('RealHrPassword!123', 4),
    role: 'HR',
    isApproved: true,
    status: 'approved'
  });
  const realManager = await Manager.create({
    name: 'Real Manager - Private Name',
    email: 'real.manager@example.test',
    password: await bcrypt.hash('RealManagerPassword!123', 4),
    isApproved: true,
    status: 'approved'
  });
  const real = await Employee.create({
    name: 'Production employee preserved',
    email: 'production.employee@example.test',
    password: await bcrypt.hash('AnotherRealPassword!123', 4),
    managerId: realManager._id,
    department: 'Confidential Department',
    phone: '+1-555-0100',
    address: 'Private home address',
    isApproved: true,
    status: 'approved'
  });
  const originalRealId = String(real._id);
  const sourceAttendance = await Attendance.create({
    userId: real._id, userModel: 'Employee', date: '2026-01-12', month: '2026-01',
    status: 'present', checkIn: '09:07:00', checkOut: '17:14:00', isLate: true
  });
  const sourceTask = await Task.create({
    employeeId: real._id, managerId: realManager._id, assignedToModel: 'Employee',
    title: 'Confidential customer migration', description: 'Private task details must not be copied.',
    deadline: new Date('2026-02-10T12:00:00Z'), status: 'Pending', managerFeedback: 'Private feedback'
  });
  const sourceLeave = await Leave.create({
    email: real.email, role: 'Employee', leaveType: 'Sick',
    startDate: '2026-02-12', endDate: '2026-02-13', totalDays: 2,
    reason: 'Private medical explanation must not be copied.', status: 'Pending'
  });
  await mongoose.disconnect();

  const env = {
    MONGO_URI: uri,
    DEMO_MODE: 'true',
    DEMO_SEED_CONFIRM: SEED_CONFIRMATION
  };

  await seed(env);
  await seed(env);

  await mongoose.connect(uri);
  const demoSnapshot = await runWithDemoContext({ demoKey: DEMO_KEY }, async () => {
    const [admin, hr, manager, employee] = await Promise.all([
      Admin.findOne({ email: DEMO_ACCOUNTS.Admin.email }).select('+password').lean(),
      HR.findOne({ email: DEMO_ACCOUNTS.HR.email }).select('+password').lean(),
      Manager.findOne({ email: DEMO_ACCOUNTS.Manager.email }).select('+password').lean(),
      Employee.findOne({ email: DEMO_ACCOUNTS.Employee.email }).select('+password').lean()
    ]);
    const counts = await Promise.all([
      Admin.countDocuments({}), HR.countDocuments({}), Manager.countDocuments({}),
      Employee.countDocuments({}), Attendance.countDocuments({}), Task.countDocuments({}),
      Leave.countDocuments({})
    ]);
    return { users: [admin, hr, manager, employee], counts };
  });
  const { users, counts } = demoSnapshot;
  expect(users.every(Boolean)).toBe(true);
  expect(users.every(user => user.demoKey === DEMO_KEY && user.isDemo === true)).toBe(true);
  for (const user of users) {
    expect(await bcrypt.compare(DEFAULT_DEMO_PASSWORD, user.password)).toBe(true);
  }
  expect(counts).toEqual([1, 2, 2, 2, 43, 3, 4]);

  const mirrorSeedId = 'mirror:account:Employee:' + originalRealId;
  const mirroredEmployee = await Employee.collection.findOne({ demoKey: DEMO_KEY, demoSeedId: mirrorSeedId });
  expect(mirroredEmployee).toBeTruthy();
  expect(mirroredEmployee.name).toMatch(/^Sample Employee /);
  expect(mirroredEmployee.email).toMatch(/^sample\.employee\.[a-f0-9]{8}@demo\.invalid$/);
  expect(mirroredEmployee.phone).toBe('');
  expect(mirroredEmployee.address).toBe('');
  expect(mirroredEmployee.department).toBe('Sample Department');
  const demoManager = await Manager.collection.findOne({ email: DEMO_ACCOUNTS.Manager.email, demoKey: DEMO_KEY });
  expect(String(mirroredEmployee.managerId)).toBe(String(demoManager._id));
  const mirroredManager = await Manager.collection.findOne({ demoKey: DEMO_KEY, demoSeedId: 'mirror:account:Manager:' + String(realManager._id) });
  expect(mirroredManager).toBeTruthy();
  expect(mirroredManager.name).toMatch(/^Sample Manager /);
  expect(mirroredManager.email).toMatch(/^sample\.manager\.[a-f0-9]{8}@demo\.invalid$/);
  const realHr = await HR.collection.findOne({ email: 'real.hr@example.test', demoKey: null });
  const mirroredHr = await HR.collection.findOne({ demoKey: DEMO_KEY, demoSeedId: 'mirror:account:HR:' + String(realHr._id) });
  expect(mirroredHr).toBeTruthy();
  expect(mirroredHr.name).toMatch(/^Sample HR /);
  expect(mirroredHr.email).toMatch(/^sample\.hr\.[a-f0-9]{8}@demo\.invalid$/);

  const mirroredTask = await Task.collection.findOne({ demoKey: DEMO_KEY, demoSeedId: 'mirror:task:' + sourceTask._id });
  expect(mirroredTask).toBeTruthy();
  expect(String(mirroredTask.employeeId)).toBe(String(mirroredEmployee._id));
  expect(String(mirroredTask.managerId)).toBe(String(demoManager._id));
  expect(mirroredTask.description).not.toContain('Private task details');
  expect(mirroredTask.managerFeedback).toBe('');

  const mirroredAttendance = await Attendance.collection.findOne({ demoKey: DEMO_KEY, demoSeedId: 'mirror:attendance:' + sourceAttendance._id });
  expect(mirroredAttendance).toBeTruthy();
  expect(String(mirroredAttendance.userId)).toBe(String(mirroredEmployee._id));

  const mirroredLeave = await Leave.collection.findOne({ demoKey: DEMO_KEY, demoSeedId: 'mirror:leave:' + sourceLeave._id });
  expect(mirroredLeave).toBeTruthy();
  expect(mirroredLeave.email).toBe(mirroredEmployee.email);
  expect(mirroredLeave.reason).not.toContain('medical');

  const unchanged = await Employee.findById(originalRealId).lean();
  expect(unchanged.name).toBe('Production employee preserved');
  expect(unchanged.email).toBe('production.employee@example.test');
  expect(unchanged.department).toBe('Confidential Department');
  expect(unchanged.phone).toBe('+1-555-0100');
  expect(unchanged.address).toBe('Private home address');
  expect(unchanged.demoKey).toBeNull();
  const unchangedTask = await Task.findById(sourceTask._id).lean();
  expect(unchangedTask.description).toBe('Private task details must not be copied.');
  const unchangedLeave = await Leave.findById(sourceLeave._id).lean();
  expect(unchangedLeave.reason).toBe('Private medical explanation must not be copied.');
});
