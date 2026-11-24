'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DEMO_KEY, installDemoIsolation, runWithSystemContext } = require('../backend/middleware/demoIsolation');
const { DEMO_PASSWORD: DEFAULT_DEMO_PASSWORD, DEMO_ACCOUNTS } = require('../backend/config/demoAccounts');

// Install the same schema marker/query plugin as the live application before
// importing any models. Seeding itself uses explicit demoKey filters.
installDemoIsolation(mongoose);

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
const WorkReport = require('../backend/models/WorkReport');
const Team = require('../backend/models/Team');
const Announcement = require('../backend/models/Announcement');
const Notification = require('../backend/models/Notification');
const TaskPlan = require('../backend/models/TaskPlan');
const TransferRequest = require('../backend/models/TransferRequest');
const RemovalComplaint = require('../backend/models/RemovalComplaint');
const { syncExistingDataToDemoSnapshot } = require('./demoSnapshot');

const SEED_CONFIRMATION = 'I_UNDERSTAND_DEMO_DATA_IN_EMPLOYEEMANAGE';
const ACCOUNT_MODELS = [Admin, HR, Manager, Employee];

function getDatabaseName(uri) {
  if (typeof uri !== 'string') return null;
  // Do not use WHATWG URL for mongodb:// multi-host URIs: its authority can
  // contain a comma-separated host list that the URL parser rejects.
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function requireDemoPassword() {
  // The shared credentials are intentionally fixed for public demo access.
  // A stale DEMO_PASSWORD in an old .env must not seed a password that the
  // deployed login page does not display.
  return DEFAULT_DEMO_PASSWORD;
}

function validateSeedTarget(env = process.env) {
  if (env.DEMO_MODE !== 'true') {
    throw new Error('Refusing to seed: set DEMO_MODE=true explicitly.');
  }
  if (env.DEMO_SEED_CONFIRM !== SEED_CONFIRMATION) {
    throw new Error(`Refusing to seed: set DEMO_SEED_CONFIRM=${SEED_CONFIRMATION} for this one-time command.`);
  }
  const databaseName = getDatabaseName(env.MONGO_URI);
  if (databaseName !== 'EmployeeManage') {
    throw new Error('Refusing to seed: MONGO_URI must continue to point to your existing EmployeeManage database. The connection URI is not changed by this script.');
  }
  return databaseName;
}

function dateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}


async function assertNoDemoAccountCollisions() {
  const wanted = [
    { Model: Admin, email: DEMO_ACCOUNTS.Admin.email },
    { Model: HR, email: DEMO_ACCOUNTS.HR.email },
    { Model: Manager, email: DEMO_ACCOUNTS.Manager.email },
    { Model: Employee, email: DEMO_ACCOUNTS.Employee.email }
  ];

  for (const account of wanted) {
    for (const Candidate of ACCOUNT_MODELS) {
      const existing = await Candidate.findOne({ email: account.email }).select('_id demoKey').lean();
      if (!existing) continue;
      if (Candidate !== account.Model || existing.demoKey !== DEMO_KEY) {
        throw new Error(`Refusing to reuse ${account.email}: an account with this email already exists outside the public demo. No records were changed.`);
      }
    }
  }
}

async function ensureDemoAccount(Model, email, name, fields, passwordHash) {
  // Check all four role collections first. A pre-existing real account with a
  // demo email is a hard stop; never convert, reset, or overwrite it.
  for (const Candidate of ACCOUNT_MODELS) {
    const existing = await Candidate.findOne({ email }).select('_id demoKey').lean();
    if (!existing) continue;
    if (Candidate !== Model || existing.demoKey !== DEMO_KEY) {
      throw new Error(`Refusing to reuse ${email}: an account with this email already exists outside the public demo. No account was changed.`);
    }
  }

  const current = await Model.findOne({ email, demoKey: DEMO_KEY }).select('_id').lean();
  const values = {
    name,
    email,
    password: passwordHash,
    ...fields,
    demoKey: DEMO_KEY,
    isDemo: true,
    demoSeedId: `account:${email}`
  };

  if (current) {
    await Model.updateOne({ _id: current._id, email, demoKey: DEMO_KEY }, { $set: values });
  } else {
    await Model.create(values);
  }

  return Model.findOne({ email, demoKey: DEMO_KEY }).lean();
}

async function upsertDemoRecord(Model, demoSeedId, values) {
  const filter = { demoKey: DEMO_KEY, demoSeedId };
  await Model.updateOne(filter, {
    $set: { ...values, demoKey: DEMO_KEY, isDemo: true, demoSeedId }
  }, { upsert: true, setDefaultsOnInsert: true });
  const document = await Model.findOne(filter).lean();
  if (!document) throw new Error(`Failed to create demo fixture: ${demoSeedId}`);
  return document;
}

async function seedDemoData(password) {
  await assertNoDemoAccountCollisions();
  const passwordHash = await bcrypt.hash(password, 12);
  const approved = { isApproved: true, status: 'approved' };

  const admin = await ensureDemoAccount(Admin, DEMO_ACCOUNTS.Admin.email, 'RoleSphere Demo Admin', {
    role: 'Admin'
  }, passwordHash);
  const hr = await ensureDemoAccount(HR, DEMO_ACCOUNTS.HR.email, 'RoleSphere Demo HR', {
    role: 'HR', ...approved
  }, passwordHash);
  const manager = await ensureDemoAccount(Manager, DEMO_ACCOUNTS.Manager.email, 'RoleSphere Demo Manager', {
    ...approved
  }, passwordHash);
  const employee = await ensureDemoAccount(Employee, DEMO_ACCOUNTS.Employee.email, 'RoleSphere Demo Employee', {
    ...approved, managerId: manager._id, department: 'Engineering'
  }, passwordHash);

  const people = [
    { user: hr, role: 'HR' },
    { user: manager, role: 'Manager' },
    { user: employee, role: 'Employee' }
  ];

  // A rolling two-week attendance history. Each row has a stable key and is
  // upserted; no existing attendance rows are deleted.
  for (let day = 0; day < 14; day++) {
    const date = dateOnly(Date.now() - day * 86400000);
    const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    for (const [index, person] of people.entries()) {
      const absent = !sunday && (day + index) % 9 === 0;
      const late = !sunday && !absent && (day + index) % 6 === 0;
      await upsertDemoRecord(Attendance, `attendance:${person.role}:${date}`, {
        userId: person.user._id,
        userModel: person.role,
        date,
        month: date.slice(0, 7),
        status: sunday ? 'holiday' : absent ? 'absent' : 'present',
        checkIn: sunday || absent ? null : late ? '09:25:00' : '09:00:00',
        checkOut: sunday || absent ? null : '17:30:00',
        isLate: late
      });
    }
  }

  const taskPending = await upsertDemoRecord(Task, 'task:employee-pending', {
    employeeId: employee._id,
    managerId: manager._id,
    assignedToModel: 'Employee',
    title: 'Demo: complete employee onboarding',
    description: 'Review the RoleSphere onboarding checklist and submit the completed steps.',
    deadline: new Date(futureDate(5) + 'T12:00:00Z'),
    status: 'Pending'
  });
  const taskSubmitted = await upsertDemoRecord(Task, 'task:manager-submitted', {
    managerId: manager._id,
    assignedToModel: 'Manager',
    title: 'Demo: review team weekly progress',
    description: 'Review the team dashboard and prepare a short weekly progress update.',
    deadline: new Date(futureDate(2) + 'T12:00:00Z'),
    status: 'Submitted',
    submittedAt: new Date()
  });

  await upsertDemoRecord(TaskPlan, 'task-plan:employee-pending', {
    taskId: taskPending._id,
    startDate: dateOnly(Date.now()),
    submissionDate: futureDate(5),
    progress: 35,
    notes: 'Demo progress plan for the onboarding task.',
    goals: [{ text: 'Review the onboarding checklist', done: true }, { text: 'Complete profile setup', done: false }]
  });

  await upsertDemoRecord(Leave, 'leave:pending', {
    email: employee.email, role: 'Employee', leaveType: 'Casual',
    startDate: futureDate(8), endDate: futureDate(8), totalDays: 1,
    reason: 'Demo pending leave request', status: 'Pending'
  });
  await upsertDemoRecord(Leave, 'leave:approved', {
    email: employee.email, role: 'Employee', leaveType: 'Unpaid',
    startDate: futureDate(18), endDate: futureDate(18), totalDays: 1,
    reason: 'Demo approved leave request', status: 'Approved'
  });
  await upsertDemoRecord(Leave, 'leave:rejected', {
    email: employee.email, role: 'Employee', leaveType: 'Casual',
    startDate: futureDate(25), endDate: futureDate(25), totalDays: 1,
    reason: 'Demo rejected leave request', status: 'Rejected'
  });

  await upsertDemoRecord(Balance, `leave-balance:${employee.email}:${new Date().getFullYear()}`, {
    email: employee.email, role: 'Employee', year: new Date().getFullYear(),
    Annual: { entitled: 15, used: 2, pending: 1 },
    Sick: { entitled: 10, used: 1, pending: 0 },
    Casual: { entitled: 7, used: 1, pending: 0 },
    Unpaid: { entitled: 999, used: 0, pending: 0 }
  });

  await upsertDemoRecord(Review, 'review:employee-current', {
    employeeId: employee._id,
    reviewerId: manager._id,
    reviewerModel: 'Manager',
    reviewerName: manager.name,
    period: dateOnly(Date.now()).slice(0, 7),
    rating: 4,
    comments: 'Consistent delivery and clear communication in the demo review.',
    strengths: 'Teamwork and ownership',
    improvements: 'Continue documenting decisions',
    goals: [{ description: 'Complete onboarding documentation', status: 'In Progress' }]
  });

  for (const [status, text] of [
    ['Pending', 'Review the weekly team goals'],
    ['In Progress', 'Complete the onboarding checklist'],
    ['Done', 'Read the RoleSphere welcome guide']
  ]) {
    await upsertDemoRecord(Todo, `todo:${status.toLowerCase().replace(/\s/g, '-')}`, {
      employeeEmail: employee.email, text, status, completed: status === 'Done'
    });
  }

  await upsertDemoRecord(WorkReport, 'work-report:employee-week', {
    employeeEmail: employee.email,
    startDate: new Date(Date.now() - 6 * 86400000),
    endDate: new Date(),
    totalHours: 35,
    reportName: 'Demo weekly progress report',
    description: 'Worked on onboarding, task planning and team collaboration workflows.',
    status: 'Pending'
  });

  await upsertDemoRecord(Team, 'team:engineering', {
    name: 'Demo Engineering Team',
    description: 'Sample team used to explore RoleSphere team and manager views.',
    managerId: manager._id,
    memberIds: [employee._id],
    createdBy: hr._id,
    createdByRole: 'HR'
  });

  await upsertDemoRecord(Announcement, 'announcement:welcome', {
    title: 'Welcome to the RoleSphere demo',
    message: 'Explore the Admin, HR, Manager and Employee workspaces using the public demo accounts.',
    date: new Date()
  });

  for (const [person, role] of [[admin, 'Admin'], [hr, 'HR'], [manager, 'Manager'], [employee, 'Employee']]) {
    await upsertDemoRecord(Notification, `notification:welcome:${person._id}`, {
      recipientId: person._id,
      recipientModel: role,
      type: 'system',
      title: 'Welcome to RoleSphere',
      message: 'This is sample notification data for the public demo.',
      link: '/workbench',
      isRead: false
    });
  }

  await upsertDemoRecord(TransferRequest, 'transfer:employee-demo', {
    employeeId: employee._id,
    employeeName: employee.name,
    employeeEmail: employee.email,
    currentManagerId: manager._id,
    currentManagerName: manager.name,
    newManagerId: null,
    newManagerName: null,
    reason: 'Sample transfer request for exploring the approval workflow.',
    managerStatus: 'Pending',
    hrStatus: 'Pending'
  });

  await upsertDemoRecord(RemovalComplaint, 'complaint:employee-demo', {
    employeeId: employee._id,
    employeeName: employee.name,
    employeeEmail: employee.email,
    managerId: manager._id,
    managerName: manager.name,
    removalReason: 'Sample removal scenario',
    complaintText: 'This sample complaint demonstrates the HR review workflow.',
    status: 'Pending'
  });

  return { accounts: 4, attendanceRows: 42, sampleTasks: 2, sampleLeaveRequests: 3 };
}

async function seed(env = process.env) {
  validateSeedTarget(env);
  const password = requireDemoPassword(env);
  if (mongoose.connection.readyState !== 0) {
    throw new Error('Refusing to seed while this process already has an active Mongoose connection.');
  }

  await mongoose.connect(env.MONGO_URI);
  try {
    const summary = await runWithSystemContext(async () => {
      const base = await seedDemoData(password);
      const snapshot = await syncExistingDataToDemoSnapshot();
      return { ...base, snapshot };
    });
    console.log('Public RoleSphere demo data is ready.');
    console.log('Accounts: 1 Admin, 1 HR, 1 Manager, 1 Employee.');
    console.log('Sample records: attendance, tasks, leave requests, leave balance, review, todos, work report, team, announcement, notifications and approval workflows.');
    console.log('Demo emails: admin@rolesphere.demo; hr1@rolesphere.demo; manager1@rolesphere.demo; employee1@rolesphere.demo');
    console.log(`Shared demo password: ${password}`);
    console.log('Sanitized live-data snapshot synchronized into the demo scope:', summary.snapshot);
    console.log('Original records were not modified. Only obsolete records in the dedicated mirror namespace may be removed.');
    return summary;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seed().catch(error => {
    console.error('[RoleSphere Demo Seed] Refused or failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  seed,
  seedDemoData,
  requireDemoPassword,
  getDatabaseName,
  validateSeedTarget,
  DEFAULT_DEMO_PASSWORD,
  SEED_CONFIRMATION
};
