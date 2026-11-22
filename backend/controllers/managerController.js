'use strict';

const Manager = require('../models/Manager');
const Employee = require('../models/Employee');
const AppError = require('../errors/AppError');
const { asyncHandler } = require('../middleware/errorHandling');

// Assign an employee to a manager. Errors are normalized by the app-level
// error boundary instead of being converted into ad-hoc response payloads.
const addEmployeeToTeam = asyncHandler(async (req, res) => {
  const { managerId, employeeId } = req.body;

  if (!managerId || !employeeId) {
    throw new AppError('managerId and employeeId are required', {
      statusCode: 400,
      code: 'VALIDATION_ERROR'
    });
  }

  const manager = await Manager.findById(managerId);
  if (!manager) {
    throw new AppError('Manager not found', { statusCode: 404, code: 'MANAGER_NOT_FOUND' });
  }

  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new AppError('Employee not found', { statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' });
  }

  if (employee.managerId && employee.managerId.toString() === managerId) {
    throw new AppError('Employee is already assigned to this manager', {
      statusCode: 400,
      code: 'EMPLOYEE_ALREADY_ASSIGNED'
    });
  }

  employee.managerId = managerId;
  await employee.save();

  return res.status(200).json({
    message: 'Employee assigned to manager successfully',
    employee
  });
});

module.exports = { addEmployeeToTeam };
