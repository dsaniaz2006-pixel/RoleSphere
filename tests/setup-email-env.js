"use strict";

// These values are ONLY for Jest.
// They are not real Gmail credentials.
process.env.NODE_ENV = "test";
process.env.EMAIL_SERVICE = "gmail";
process.env.EMAIL_USER = "rolesphere-test@example.test";
process.env.EMAIL_PASS = "jest-only-not-a-real-password";
process.env.EMAIL_FROM = "RoleSphere <no-reply@example.test>";
