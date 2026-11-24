"use strict";

const Employee = require("../models/Employee");

/**
 * One-time backfill: activate employees who registered under the old
 * pending-approval system. Rejected and permanently removed employees
 * are left untouched.
 */
async function backfillPendingEmployees() {
  try {
    const result = await Employee.updateMany(
      { isApproved: false, status: "pending" },
      { $set: { isApproved: true, status: "approved" } }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `[RoleSphere Migration] Activated ${result.modifiedCount} pending Employee account(s).`
      );
    }
  } catch (error) {
    console.error(
      "[RoleSphere Migration] Employee activation backfill failed:",
      error.message
    );
  }
}

module.exports = { backfillPendingEmployees };