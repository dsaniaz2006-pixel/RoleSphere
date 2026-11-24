'use strict';

// These credentials are intentionally public and read-only. They are for the
// demo workspace only; real user passwords must never be shared here.
const DEMO_PASSWORD = 'RoleSphereDemo@2026!';
const DEMO_ACCOUNTS = Object.freeze({
  Admin: Object.freeze({ email: 'admin@rolesphere.demo', role: 'Admin' }),
  HR: Object.freeze({ email: 'hr1@rolesphere.demo', role: 'HR' }),
  Manager: Object.freeze({ email: 'manager1@rolesphere.demo', role: 'Manager' }),
  Employee: Object.freeze({ email: 'employee1@rolesphere.demo', role: 'Employee' })
});

module.exports = { DEMO_PASSWORD, DEMO_ACCOUNTS };
