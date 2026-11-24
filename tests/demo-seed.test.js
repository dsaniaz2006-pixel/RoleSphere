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
  const real = await Employee.create({
    name: 'Production employee preserved',
    email: 'production.employee@example.test',
    password: await bcrypt.hash('AnotherRealPassword!123', 4),
    isApproved: true,
    status: 'approved'
  });
  const originalRealId = String(real._id);
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
  expect(counts).toEqual([1, 1, 1, 1, 42, 2, 3]);

  const unchanged = await Employee.findById(originalRealId).lean();
  expect(unchanged.name).toBe('Production employee preserved');
  expect(unchanged.email).toBe('production.employee@example.test');
  expect(unchanged.demoKey).toBeNull();
});
