'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../app');
const { DEMO_KEY, runWithDemoContext, runWithSystemContext } = require('../backend/middleware/demoIsolation');
const HR = require('../backend/models/HR');
const Manager = require('../backend/models/Manager');
const Employee = require('../backend/models/Employee');

const PASSWORD = 'TestPassword!123';
const accepted = { Accept: 'application/json' };
let mongo;
let app;
let demoHrAgent;
let realHrAgent;
let realEmployee;
let demoEmployee;
let previousEnv;

async function login(email, role) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD, role });
  expect(response.status).toBe(302);
  return agent;
}

beforeAll(async () => {
  previousEnv = {
    MONGO_URI: process.env.MONGO_URI,
    SESSION_SECRET: process.env.SESSION_SECRET,
    JWT_SECRET: process.env.JWT_SECRET,
    DEMO_MODE: process.env.DEMO_MODE
  };
  const fs = require('node:fs');
  const path = require('node:path');
  const dbPath = fs.mkdtempSync(path.join(__dirname, '../tmp/demo-isolation-'));
  mongo = await MongoMemoryServer.create({ instance: { dbPath, args: ['--nounixsocket'] } });

  process.env.MONGO_URI = mongo.getUri('rolesphere_demo_test');
  process.env.SESSION_SECRET = 'demo-isolation-session-secret';
  process.env.JWT_SECRET = 'demo-isolation-jwt-secret';
  process.env.DEMO_MODE = 'true';

  await mongoose.connect(process.env.MONGO_URI);
  app = createApp();

  const hash = await bcrypt.hash(PASSWORD, 4);
  const approved = { password: hash, isApproved: true, status: 'approved' };

  await runWithSystemContext(async () => {
    const demoManager = await Manager.create({
      name: 'Demo Manager', email: 'manager1@rolesphere.demo', ...approved,
      demoKey: DEMO_KEY, isDemo: true, demoSeedId: 'account:manager1'
    });
    demoEmployee = await Employee.create({
      name: 'Demo Employee', email: 'employee1@rolesphere.demo', managerId: demoManager._id,
      department: 'Engineering', ...approved,
      demoKey: DEMO_KEY, isDemo: true, demoSeedId: 'account:employee1'
    });
    realEmployee = await Employee.create({
      name: 'Real Employee - Must Stay Private', email: 'real.employee@example.test',
      department: 'Operations', password: hash, isApproved: true, status: 'approved'
    });
    await HR.create({
      name: 'Demo HR', email: 'hr1@rolesphere.demo', role: 'HR', ...approved,
      demoKey: DEMO_KEY, isDemo: true, demoSeedId: 'account:hr1'
    });
    await HR.create({
      name: 'Real HR', email: 'real.hr@example.test', role: 'HR', ...approved
    });
  });
  demoHrAgent = await login('hr1@rolesphere.demo', 'HR');
  realHrAgent = await login('real.hr@example.test', 'HR');
});

afterAll(async () => {
  await app?.get('sessionStore').close();
  await mongoose.disconnect();
  await mongo?.stop();
  for (const [key, value] of Object.entries(previousEnv || {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('demo HR employee list returns demo rows only', async () => {
  const response = await demoHrAgent.get('/hr/employees').set(accepted);
  expect(response.status).toBe(200);
  expect(response.body.map(person => person.email)).toEqual(['employee1@rolesphere.demo']);
});

test('demo HR dashboard opens successfully', async () => {
  const response = await demoHrAgent.get('/hr/dashboard');
  expect(response.status).toBe(200);
  expect(response.text).toContain('RoleSphere');
});

test('demo HR legacy stats use demo-only employee and manager counts', async () => {
  const response = await demoHrAgent.get('/hr/stats').set(accepted);
  expect(response.status).toBe(200);
  expect(response.body.stats.employeeCount).toBe(1);
  expect(response.body.stats.managerCount).toBe(1);
});

test('demo Mongoose find, count, and aggregate queries are scoped to demo records', async () => {
  const findRows = await runWithDemoContext({ demoKey: DEMO_KEY }, async () => await Employee.find({}).select('email').lean());
  const count = await runWithDemoContext({ demoKey: DEMO_KEY }, async () => await Employee.countDocuments({}));
  const aggregate = await runWithDemoContext({ demoKey: DEMO_KEY }, async () => await Employee.aggregate([
    { $group: { _id: null, count: { $sum: 1 } } }
  ]));

  expect(findRows.map(person => person.email)).toEqual(['employee1@rolesphere.demo']);
  expect(count).toBe(1);
  expect(aggregate[0].count).toBe(1);

  const normalAggregate = await Employee.aggregate([
    { $group: { _id: null, count: { $sum: 1 } } }
  ]);
  expect(normalAggregate[0].count).toBe(1);
});

test('demo HR can create and update demo records but cannot modify records outside the demo scope', async () => {
  const create = await demoHrAgent.post('/hr/add-employee')
    .send({ name: 'Interactive Demo Employee', email: 'interactive.employee@rolesphere.demo', password: PASSWORD, department: 'Engineering' });
  expect(create.status).toBe(200);

  const created = await runWithDemoContext({ demoKey: DEMO_KEY }, async () =>
    await Employee.findOne({ email: 'interactive.employee@rolesphere.demo' }).lean()
  );
  expect(created).toBeTruthy();
  expect(created.demoKey).toBe(DEMO_KEY);
  expect(created.isDemo).toBe(true);

  const update = await demoHrAgent.put(`/hr/edit-employee/${demoEmployee._id}`)
    .send({ name: 'Updated Demo Employee', email: demoEmployee.email });
  expect(update.status).toBe(200);

  const updated = await runWithDemoContext({ demoKey: DEMO_KEY }, async () =>
    await Employee.findById(demoEmployee._id).lean()
  );
  expect(updated.name).toBe('Updated Demo Employee');

  const outsideScopeUpdate = await demoHrAgent.put(`/hr/edit-employee/${realEmployee._id}`)
    .send({ name: 'Compromised', email: realEmployee.email });
  expect(outsideScopeUpdate.status).toBe(404);

  const unchanged = await Employee.findById(realEmployee._id).lean();
  expect(unchanged.name).toBe('Real Employee - Must Stay Private');
  expect(unchanged.email).toBe('real.employee@example.test');
  expect(await Employee.findOne({ email: 'injected@example.test' })).toBeNull();
});

test('normal HR sessions retain their existing organization-wide visibility', async () => {
  const response = await realHrAgent.get('/hr/employees').set(accepted);
  expect(response.status).toBe(200);
  expect(response.body.map(person => person.email)).toEqual(['real.employee@example.test']);
  const stats = await realHrAgent.get('/hr/stats').set(accepted);
  expect(stats.status).toBe(200);
  expect(stats.body.stats.employeeCount).toBe(1);
  expect(stats.body.stats.managerCount).toBe(0);

  const attemptedDemoEdit = await realHrAgent.put(`/hr/edit-employee/${demoEmployee._id}`)
    .send({ name: 'Changed by a real account', email: demoEmployee.email });
  expect(attemptedDemoEdit.status).toBe(404);

  const stillDemo = await runWithDemoContext({ demoKey: DEMO_KEY }, async () =>
    await Employee.findById(demoEmployee._id).lean()
  );
  expect(stillDemo.name).toBe('Demo Employee');
});

test('demo credentials are shown on role login only when demo mode is enabled', async () => {
  const visible = await request(app).get('/login/HR');
  expect(visible.status).toBe(200);
  expect(visible.text).toContain('hr1@rolesphere.demo');
  expect(visible.text).toContain('RoleSphereDemo@2026!');

  process.env.DEMO_MODE = 'false';
  const hidden = await request(app).get('/login/HR');
  expect(hidden.status).toBe(200);
  expect(hidden.text).not.toContain('hr1@rolesphere.demo');
  const blocked = await demoHrAgent.get('/hr/employees').set(accepted);
  expect(blocked.status).toBe(403);
  expect(blocked.body.code).toBe('DEMO_MODE_DISABLED');
});
