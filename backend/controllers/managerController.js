const Manager = require("../models/Manager");
const Employee = require("../models/Employee");

// Assign Employee to Manager's Team
exports.addEmployeeToTeam = async (req, res) => {
  try {
    const { managerId, employeeId } = req.body;

    if (!managerId || !employeeId) {
      return res.status(400).json({ message: "managerId and employeeId are required" });
    }

    const manager = await Manager.findById(managerId);
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Link employee to this manager via the Employee's managerId field
    if (employee.managerId && employee.managerId.toString() === managerId) {
      return res.status(400).json({ message: "Employee is already assigned to this manager" });
    }

    employee.managerId = managerId;
    await employee.save();

    res.status(200).json({ message: "Employee assigned to manager successfully", employee });
  } catch (err) {
    res.status(500).json({ message: "Error assigning employee", error: err.message });
  }
};