'use strict';

jest.mock('../backend/models/Manager', () => ({ findById: jest.fn() }));
jest.mock('../backend/models/Employee', () => ({ findById: jest.fn() }));

const Manager = require('../backend/models/Manager');
const Employee = require('../backend/models/Employee');
const { addEmployeeToTeam } = require('../backend/controllers/managerController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function invoke(body) {
  const res = response();
  const next = jest.fn();
  await addEmployeeToTeam({ body }, res, next);
  return { res, next };
}

beforeEach(() => jest.clearAllMocks());

test('manager assignment forwards a validation error when IDs are missing', async () => {
  const { next } = await invoke({});
  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    statusCode: 400,
    code: 'VALIDATION_ERROR'
  }));
});

test('manager assignment returns a typed not-found error for an unknown manager', async () => {
  Manager.findById.mockResolvedValue(null);
  const { next } = await invoke({ managerId: 'manager-id', employeeId: 'employee-id' });
  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    statusCode: 404,
    code: 'MANAGER_NOT_FOUND'
  }));
});

test('manager assignment returns a typed not-found error for an unknown employee', async () => {
  Manager.findById.mockResolvedValue({ _id: 'manager-id' });
  Employee.findById.mockResolvedValue(null);
  const { next } = await invoke({ managerId: 'manager-id', employeeId: 'employee-id' });
  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    statusCode: 404,
    code: 'EMPLOYEE_NOT_FOUND'
  }));
});

test('manager assignment rejects an employee already assigned to the same manager', async () => {
  Manager.findById.mockResolvedValue({ _id: 'manager-id' });
  Employee.findById.mockResolvedValue({ managerId: { toString: () => 'manager-id' }, save: jest.fn() });
  const { next } = await invoke({ managerId: 'manager-id', employeeId: 'employee-id' });
  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    statusCode: 400,
    code: 'EMPLOYEE_ALREADY_ASSIGNED'
  }));
});

test('manager assignment persists the new manager and preserves the success response', async () => {
  const employee = { managerId: null, save: jest.fn().mockResolvedValue(undefined) };
  Manager.findById.mockResolvedValue({ _id: 'manager-id' });
  Employee.findById.mockResolvedValue(employee);

  const { res, next } = await invoke({ managerId: 'manager-id', employeeId: 'employee-id' });
  expect(next).not.toHaveBeenCalled();
  expect(employee.managerId).toBe('manager-id');
  expect(employee.save).toHaveBeenCalledTimes(1);
  expect(res.statusCode).toBe(200);
  expect(res.body.message).toBe('Employee assigned to manager successfully');
  expect(res.body.employee).toBe(employee);
});
