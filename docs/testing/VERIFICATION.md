# Verification

Validation performed for this delivery:

- `npm test`: **73 tests passed** across three suites. Integration tests use a real disposable MongoDB server, real Mongoose operations, real Mongo-backed sessions and Supertest HTTP requests. SMTP transports are mocked.
- Four existing role dashboards and the new workspace render through HTTP. Their rendered inline JavaScript is syntax-checked; EJS templates and project JavaScript are also checked by `npm run check`.
- `npm run build`: local vendor assets and Tailwind production CSS build successfully.
- Demo seed executed twice against a separate disposable `rolesphere_demo` database. It produced 1 Admin, 2 HR, 3 managers, 20 employees, 1,500 attendance records (60 days × 25 staff), 80 tasks and retained those counts on rerun.
- Excel summary output has the expected ZIP workbook signature; PDF task export returns application/pdf. Both exercise real report builders.
- DOM tests verify script/event/unsafe-URL removal, escaping and delegated data values. Date tests verify the IST midnight boundary, Sunday and late cutoff.

Glass authentication browser checks: desktop role selection and sign-in at 1440px, registration and role selection at 390px, rendered artwork, folder navigation, password visibility and inline rate-limit errors passed in headless Chromium with no page errors. Layout screenshots were inspected internally. The rate-limit browser response was mocked; existing real-MongoDB integration tests cover authentication and sessions.

Not verified here: full interactive dashboard workflows, live SMTP delivery, Atlas credentials, a production container build, hosted CI execution, Render deployment, persistent production upload storage, or real-world concurrent multi-document approvals. These are not reported as completed checks.

An existing malformed announcement-script fragment in the Admin and HR templates was discovered by rendered-script tests and repaired. The document also describes why the original exposed secrets still need rotation even though they are absent from the updated ZIP.

## Local HTTP login regression fix

Successful browser sign-in previously received a 302 dashboard redirect that Helmet's default upgrade-insecure-requests policy upgraded to HTTPS. An HTTP-only localhost:8001 server then failed with ERR_SSL_PROTOCOL_ERROR, and the form displayed its generic connection error. This was reproduced for Employee, Manager, HR and Admin using temporary accounts.

The app now enables HTTPS upgrade and HSTS only when COOKIE_SECURE=true. Local HTTP with COOKIE_SECURE=false retains its original scheme; HTTPS deployments keep both protections. Two regression tests verify the header behavior.

After the fix, a real headless Chromium browser signed in through the actual form on http://localhost:8001 for all four roles and verified /api/auth/me. Accounts were temporary fixtures in a real disposable MongoDB database. All four dashboard URLs retained HTTP. External dashboard CDN resources were unavailable in the test environment, so this check verifies sign-in/navigation/session behavior rather than complete dashboard rendering.
