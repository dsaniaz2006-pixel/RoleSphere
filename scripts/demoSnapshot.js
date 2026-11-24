'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { DEMO_KEY } = require('../backend/middleware/demoIsolation');
const { DEMO_ACCOUNTS } = require('../backend/config/demoAccounts');

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

const ROLE_MODELS = Object.freeze({ Admin, HR, Manager, Employee });
const DAY_MS = 24 * 60 * 60 * 1000;

function shortTag(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

function dateOffset(value) {
  const digest = crypto.createHash('sha256').update(String(value)).digest();
  return (digest.readUInt16BE(0) % 121) - 60;
}

function shiftDate(value, offset) {
  if (value === null || value === undefined || value === '') return value;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setTime(date.getTime() + offset * DAY_MS);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toISOString().slice(0, 10);
  }
  return date;
}

function shiftPeriod(period, offset) {
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) return period;
  const date = new Date(period + '-01T00:00:00.000Z');
  date.setTime(date.getTime() + offset * DAY_MS);
  return date.toISOString().slice(0, 7);
}

function accountSeedId(role, sourceId) {
  return 'mirror:account:' + role + ':' + String(sourceId);
}

function recordSeedId(kind, sourceId) {
  return 'mirror:' + kind + ':' + String(sourceId);
}

function emailKey(role, email) {
  return role + ':' + String(email || '').trim().toLowerCase();
}

async function readOriginalRows(Model) {
  // Explicitly read original records only. Native collection reads bypass the
  // request context while { demoKey: null } includes old documents with no key.
  return Model.collection.find({ demoKey: null }).sort({ _id: 1 }).toArray();
}

async function upsertMirror(Model, demoSeedId, fields) {
  const filter = { demoKey: DEMO_KEY, demoSeedId };
  await Model.collection.updateOne(filter, {
    $set: { ...fields, demoKey: DEMO_KEY, isDemo: true, demoSeedId }
  }, { upsert: true });
  const row = await Model.collection.findOne(filter);
  if (!row) throw new Error('Unable to upsert sanitized demo snapshot ' + demoSeedId);
  return row;
}

async function removeStaleMirrors(Model, prefix, retainedIds) {
  // This namespace is exclusively owned by the snapshot sync. Base demo fixtures
  // use different IDs, and original data has no demoKey marker.
  await Model.collection.deleteMany({
    demoKey: DEMO_KEY,
    demoSeedId: { $regex: '^' + prefix, $nin: Array.from(retainedIds) }
  });
}

async function findCanonicalDemoAccounts() {
  const accounts = {};
  for (const role of Object.keys(ROLE_MODELS)) {
    const Model = ROLE_MODELS[role];
    const configured = DEMO_ACCOUNTS[role];
    const row = await Model.collection.findOne({
      email: configured.email,
      demoKey: DEMO_KEY,
      isDemo: true
    });
    if (!row) throw new Error('Missing seeded public demo account for role ' + role + '. Seed base demo accounts before snapshot sync.');
    accounts[role] = { _id: row._id, email: row.email, name: row.name, role };
  }
  return accounts;
}

async function mirrorAccounts(canonicalAccounts) {
  const peopleByRoleId = new Map();
  const peopleByEmail = new Map();
  const retained = { HR: new Set(), Manager: new Set(), Employee: new Set() };
  const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);

  // Map real Admin identities to the one public demo Admin. Their identity data
  // is never copied into the public scope.
  for (const source of await readOriginalRows(Admin)) {
    peopleByRoleId.set('Admin:' + String(source._id), canonicalAccounts.Admin);
    if (source.email) peopleByEmail.set(emailKey('Admin', source.email), canonicalAccounts.Admin);
  }

  // HR and Manager rows are mirrored as synthetic, non-login identities. This
  // preserves per-person attendance and leave-balance relationships while the
  // shared demo HR/Manager accounts get organization-wide demo-scoped visibility.
  for (const role of ['HR', 'Manager']) {
    const Model = ROLE_MODELS[role];
    for (const source of await readOriginalRows(Model)) {
      const tag = shortTag(source._id);
      const seedId = accountSeedId(role, source._id);
      const email = 'sample.' + role.toLowerCase() + '.' + tag + '@demo.invalid';
      const name = 'Sample ' + role + ' ' + tag.toUpperCase();
      const fields = {
        name,
        email,
        password: randomPasswordHash,
        isApproved: source.isApproved === true,
        status: source.status || (source.isApproved === true ? 'approved' : 'pending'),
        preferredLogin: 'password'
      };
      if (role === 'HR') fields.role = 'HR';
      const mirror = await upsertMirror(Model, seedId, fields);
      const person = { _id: mirror._id, email, name, role };
      peopleByRoleId.set(role + ':' + String(source._id), person);
      if (source.email) peopleByEmail.set(emailKey(role, source.email), person);
      retained[role].add(seedId);
    }
    await removeStaleMirrors(Model, 'mirror:account:' + role + ':', retained[role]);
  }

  // Employee identities are synthetic and cannot sign in. All mirrored employees
  // are assigned to the public demo Manager, allowing the Manager dashboard to
  // inspect the complete anonymized roster in one place.
  for (const source of await readOriginalRows(Employee)) {
    const tag = shortTag(source._id);
    const seedId = accountSeedId('Employee', source._id);
    const email = 'sample.employee.' + tag + '@demo.invalid';
    const name = 'Sample Employee ' + tag.toUpperCase();
    const mirror = await upsertMirror(Employee, seedId, {
      name,
      email,
      password: randomPasswordHash,
      managerId: canonicalAccounts.Manager._id,
      isApproved: source.isApproved === true,
      status: source.status || (source.isApproved === true ? 'approved' : 'pending'),
      preferredLogin: 'password',
      department: 'Sample Department',
      phone: '',
      address: '',
      profilePhoto: null,
      removalReason: null,
      removalManagerName: null,
      removalAccepted: false,
      complaintStatus: 'None'
    });
    const person = { _id: mirror._id, email, name, role: 'Employee' };
    peopleByRoleId.set('Employee:' + String(source._id), person);
    if (source.email) peopleByEmail.set(emailKey('Employee', source.email), person);
    retained.Employee.add(seedId);
  }
  await removeStaleMirrors(Employee, 'mirror:account:Employee:', retained.Employee);

  return { peopleByRoleId, peopleByEmail };
}

async function syncExistingDataToDemoSnapshot() {
  const canonicalAccounts = await findCanonicalDemoAccounts();
  const { peopleByRoleId, peopleByEmail } = await mirrorAccounts(canonicalAccounts);
  const counts = {};

  async function copyRows(kind, Model, mapRow) {
    const retained = new Set();
    let copied = 0;
    for (const source of await readOriginalRows(Model)) {
      const seedId = recordSeedId(kind, source._id);
      const fields = await mapRow(source);
      if (!fields) continue;
      await upsertMirror(Model, seedId, fields);
      retained.add(seedId);
      copied += 1;
    }
    await removeStaleMirrors(Model, 'mirror:' + kind + ':', retained);
    counts[kind] = copied;
  }

  await copyRows('attendance', Attendance, source => {
    const person = peopleByRoleId.get(source.userModel + ':' + String(source.userId));
    if (!person) return null;
    const offset = dateOffset(source.userId);
    const date = shiftDate(source.date, offset);
    return {
      userId: person._id,
      userModel: source.userModel,
      date,
      month: typeof date === 'string' ? date.slice(0, 7) : date.toISOString().slice(0, 7),
      status: source.status,
      checkIn: source.checkIn || null,
      checkOut: source.checkOut || null,
      isLate: Boolean(source.isLate)
    };
  });

  const sourceTasks = await readOriginalRows(Task);
  const retainedTasks = new Set();
  const taskIds = new Map();
  let copiedTasks = 0;
  for (const source of sourceTasks) {
    const employee = source.employeeId
      ? peopleByRoleId.get('Employee:' + String(source.employeeId))
      : null;
    if (source.employeeId && !employee) continue;
    const seedId = recordSeedId('task', source._id);
    const offset = dateOffset(source.employeeId || source.managerId || source._id);
    const mirror = await upsertMirror(Task, seedId, {
      employeeId: employee?._id || null,
      managerId: source.managerId ? canonicalAccounts.Manager._id : null,
      assignedToModel: source.assignedToModel || 'Employee',
      title: 'Sample task ' + shortTag(source._id).toUpperCase(),
      description: 'Sanitized task snapshot. Original task text and attachments are not shared in the public demo.',
      deadline: shiftDate(source.deadline, offset),
      status: source.status || 'Pending',
      submission: null,
      submittedAt: shiftDate(source.submittedAt, offset),
      managerFeedback: ''
    });
    taskIds.set(String(source._id), mirror._id);
    retainedTasks.add(seedId);
    copiedTasks += 1;
  }
  await removeStaleMirrors(Task, 'mirror:task:', retainedTasks);
  counts.task = copiedTasks;

  await copyRows('leave', Leave, source => {
    const role = source.role === 'HR' ? 'HR' : 'Employee';
    const person = peopleByEmail.get(emailKey(role, source.email));
    if (!person) return null;
    const offset = dateOffset(source.email);
    return {
      email: person.email,
      role,
      leaveType: source.leaveType,
      startDate: shiftDate(source.startDate, offset),
      endDate: shiftDate(source.endDate, offset),
      totalDays: source.totalDays,
      reason: 'Sanitized sample leave request. Personal explanation removed.',
      status: source.status,
      cancelledAt: null,
      createdAt: shiftDate(source.createdAt, offset)
    };
  });

  await copyRows('leave-balance', Balance, source => {
    const role = source.role === 'HR' ? 'HR' : 'Employee';
    const person = peopleByEmail.get(emailKey(role, source.email));
    if (!person) return null;
    return {
      email: person.email,
      role,
      year: source.year,
      Annual: source.Annual ? { ...source.Annual } : undefined,
      Sick: source.Sick ? { ...source.Sick } : undefined,
      Casual: source.Casual ? { ...source.Casual } : undefined,
      Unpaid: source.Unpaid ? { ...source.Unpaid } : undefined
    };
  });

  await copyRows('performance-review', Review, source => {
    const employee = peopleByRoleId.get('Employee:' + String(source.employeeId));
    const reviewer = peopleByRoleId.get(source.reviewerModel + ':' + String(source.reviewerId));
    if (!employee || !reviewer) return null;
    const offset = dateOffset(source.employeeId);
    return {
      employeeId: employee._id,
      reviewerId: reviewer._id,
      reviewerModel: source.reviewerModel,
      reviewerName: reviewer.name,
      period: shiftPeriod(source.period, offset),
      rating: 4,
      comments: 'Sanitized sample performance review. Original private comments removed.',
      strengths: 'Sample strength',
      improvements: 'Sample development area',
      goals: (source.goals || []).map((goal, index) => ({
        description: 'Sample review goal ' + (index + 1),
        status: goal.status || 'Pending'
      })),
      createdAt: shiftDate(source.createdAt, offset)
    };
  });

  await copyRows('todo', Todo, source => {
    const person = peopleByEmail.get(emailKey('Employee', source.employeeEmail));
    if (!person) return null;
    return {
      employeeEmail: person.email,
      text: 'Sample to-do ' + shortTag(source._id).toUpperCase(),
      status: source.status || 'Pending',
      completed: Boolean(source.completed),
      createdAt: shiftDate(source.createdAt, dateOffset(source.employeeEmail))
    };
  });

  await copyRows('work-report', WorkReport, source => {
    const person = peopleByEmail.get(emailKey('Employee', source.employeeEmail));
    if (!person) return null;
    const offset = dateOffset(source.employeeEmail);
    return {
      employeeEmail: person.email,
      startDate: shiftDate(source.startDate, offset),
      endDate: shiftDate(source.endDate, offset),
      totalHours: source.totalHours,
      reportName: 'Sample work report ' + shortTag(source._id).toUpperCase(),
      description: 'Sanitized work report snapshot. Original report text is not shared.',
      submittedAt: shiftDate(source.submittedAt, offset),
      status: source.status || 'Pending',
      managerRemarks: '',
      reviewedOn: shiftDate(source.reviewedOn, offset)
    };
  });

  await copyRows('team', Team, source => {
    const creator = peopleByRoleId.get(source.createdByRole + ':' + String(source.createdBy));
    if (!creator) return null;
    const memberIds = (source.memberIds || [])
      .map(id => peopleByRoleId.get('Employee:' + String(id)))
      .filter(Boolean)
      .map(person => person._id);
    return {
      name: 'Sample team ' + shortTag(source._id).toUpperCase(),
      description: 'Sanitized sample team snapshot.',
      managerId: canonicalAccounts.Manager._id,
      memberIds,
      createdBy: creator._id,
      createdByRole: source.createdByRole
    };
  });

  await copyRows('announcement', Announcement, source => ({
    title: 'Sample announcement ' + shortTag(source._id).toUpperCase(),
    message: 'Sanitized sample announcement. Original organization-specific content and attachments are not shared.',
    date: shiftDate(source.date, dateOffset(source._id)),
    attachmentUrl: null
  }));

  await copyRows('notification', Notification, source => {
    const person = peopleByRoleId.get(source.recipientModel + ':' + String(source.recipientId));
    if (!person) return null;
    return {
      recipientId: person._id,
      recipientModel: source.recipientModel,
      type: source.type || 'system',
      title: 'Sample notification',
      message: 'This notification is anonymized sample activity.',
      link: '/workbench',
      isRead: Boolean(source.isRead),
      readAt: shiftDate(source.readAt, dateOffset(source.recipientId)),
      createdAt: shiftDate(source.createdAt, dateOffset(source.recipientId))
    };
  });

  const retainedPlans = new Set();
  let copiedPlans = 0;
  for (const source of await readOriginalRows(TaskPlan)) {
    const taskId = taskIds.get(String(source.taskId));
    if (!taskId) continue;
    const seedId = recordSeedId('task-plan', source._id);
    await upsertMirror(TaskPlan, seedId, {
      taskId,
      startDate: shiftDate(source.startDate, dateOffset(source._id)),
      submissionDate: shiftDate(source.submissionDate, dateOffset(source._id)),
      progress: source.progress || 0,
      notes: 'Sanitized sample task plan.',
      goals: (source.goals || []).map((goal, index) => ({
        text: 'Sample task-plan goal ' + (index + 1),
        done: Boolean(goal.done)
      }))
    });
    retainedPlans.add(seedId);
    copiedPlans += 1;
  }
  await removeStaleMirrors(TaskPlan, 'mirror:task-plan:', retainedPlans);
  counts['task-plan'] = copiedPlans;

  await copyRows('transfer-request', TransferRequest, source => {
    const employee = peopleByRoleId.get('Employee:' + String(source.employeeId));
    if (!employee) return null;
    return {
      employeeId: employee._id,
      employeeName: employee.name,
      employeeEmail: employee.email,
      currentManagerId: source.currentManagerId ? canonicalAccounts.Manager._id : null,
      currentManagerName: source.currentManagerId ? canonicalAccounts.Manager.name : 'Unassigned',
      newManagerId: source.newManagerId ? canonicalAccounts.Manager._id : null,
      newManagerName: source.newManagerId ? canonicalAccounts.Manager.name : null,
      reason: 'Sanitized sample transfer request.',
      managerStatus: source.managerStatus || 'Pending',
      managerNote: '',
      hrStatus: source.hrStatus || 'Pending',
      hrNote: ''
    };
  });

  await copyRows('removal-complaint', RemovalComplaint, source => {
    const employee = peopleByRoleId.get('Employee:' + String(source.employeeId));
    if (!employee) return null;
    return {
      employeeId: employee._id,
      employeeName: employee.name,
      employeeEmail: employee.email,
      managerId: canonicalAccounts.Manager._id,
      managerName: canonicalAccounts.Manager.name,
      removalReason: 'Sanitized sample employee-removal reason.',
      complaintText: 'Sanitized sample HR complaint. Original private text and attachments are not shared.',
      attachmentPath: null,
      attachmentName: null,
      status: source.status || 'Pending',
      hrNote: ''
    };
  });

  counts.accounts = peopleByRoleId.size;
  return { mirroredAccounts: peopleByRoleId.size, records: counts };
}

module.exports = { syncExistingDataToDemoSnapshot, shiftDate, dateOffset, shortTag };
