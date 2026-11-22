# Recovery, remembered sign-in and sidebar dashboard update

Built from your latest `RoleSphere_Premium_UI(2).zip`, using the supplied finance-dashboard screenshot and this reference:
https://dribbble.com/shots/26150398-Finance-Dashboard-design

Design credit: Ghulam for Upnow Studio. This is an adaptation for RoleSphere's people, attendance and tasks, rather than a finance app or a reproduction of its sample sales figures.

## Start

Keep your existing `.env`, database and personal `uploads/` directory. Use the full updated project because the changes span authentication, views, shared styling and a dashboard API.

```bash
npm ci
npm run build
npm run dev
```

Use the HTTP address printed by the server. Hard refresh once if old CSS is cached. No database reset is needed. Dependencies are unchanged from the previous premium update; if merging into the same installed folder with identical package files, rebuilding and restarting is enough.

## 1. Matching recovery pages

Forgot password, reset password, reset success, reset-link-sent and invalid/expired-link states now use the same glass form, warm palette, shared wordmark, serif typography and responsive split layout as login. Dark/light appearance controls remain available.

The forms keep their existing POST endpoints. Password visibility toggles, matching confirmation, native validation, and the server's 8–128 character limit are in place. Reset tokens remain hashed, expire after one hour and are deleted after successful use.

For real reset email delivery, configure the existing SMTP settings and set `BASE_URL` in `.env` to the actual URL printed by the running server (or your deployed HTTPS URL). Delivery was not exercised against a live inbox in this run.

## 2. Remembered email, password autofill and persistent sign-in

The login form supports browser password managers using a username field and `current-password` autocomplete. Save the credentials once when your browser offers, then select the saved credential when entering the email. Saving and filling passwords remains under the browser/password manager's control; a website cannot guarantee its save prompt or force its autofill behavior.

**Keep me signed in** is opt-in:

- Checked: the existing server session receives a 30-day HTTP-only cookie. The email and role are remembered locally for the same period.
- Unchecked: the login uses a browser-session cookie. Existing logout routes end the session.
- The local email record contains only email, role and expiration. It never contains a password.
- On approved successful authentication, the server still compares the submitted password with the stored bcrypt hash. Password hashes cannot be retrieved as original passwords to prefill a form.

This implements the convenience of remembered access without adding recoverable passwords to the project database. On a shared device, leave the checkbox off and sign out after use.

## 3. Finance-inspired dashboards with sidebars

All four role dashboards use translucent rounded cards, a lavender accent, soft pink/blue ambient gradients, quieter type and a sidebar shell. Desktop page chrome no longer shows the old top header bar. Navigation stays in the sidebar. On phones a compact brand/menu strip opens the same sidebar, with Escape/backdrop close, keyboard focus handling and an accessible expanded state.

The earlier Admin ASMR and other roles' dots remain as subtle background layers. Light/dark themes, welcome animation, upload empty states and hover buttons remain in place.

A new Workspace Pulse presents real data:

| Role | Attendance panel | Task-completion panel |
| --- | --- | --- |
| Admin / HR | Organization, seven days | All assigned Task records |
| Manager | Their own attendance | Tasks assigned to employees currently on their team |
| Employee | Their own attendance | Their own tasks |

Task completion is approved tasks divided by assigned tasks. When there are no tasks, the gauge shows an empty state rather than an invented percentage. Bars include present and late records with accessible date/count labels. Existing employee, manager, approval and task counts are retained. No finance balances, sales figures, fake people or sample percentages were added.

The read-only `/api/dashboard/pulse` route derives scope from the signed-in session and ignores user IDs supplied through query parameters. Existing analytics permissions remain unchanged.

## 4. Wrong-role sign-in guidance

Example: an HR user opens Admin sign-in and submits valid HR credentials.

1. The server checks the selected role's credentials.
2. If they do not match, it checks other roles using the submitted password.
3. A single verified match receives a notice naming the correct role.
4. After about 1.8 seconds the client opens that role's login page. A direct link is also available.
5. The target page shows the notice and fills the email. The password field stays empty; the browser password manager can fill it.
6. The user signs in on the correct role page. No session is authenticated merely by the role-guidance response.

The same flow applies to Admin, HR, Manager and Employee. A wrong password or unknown email receives a generic error without revealing a role. If the credentials match more than one alternate role, the site asks the user to choose rather than silently selecting an account. Approval rules still apply on the correct role page.

The notice/email hint is stored briefly in the existing session, expires after two minutes and is consumed on the target page. Passwords are not placed in URLs, browser storage, role hints or response bodies. Without client JavaScript, the server redirects directly to the matching login page and shows the notice there.

## Changed implementation

- `frontend/views/partials/recovery-page.ejs`, `frontend/public/css/recovery.css`, `frontend/public/js/recovery.js`: shared recovery design and form behavior.
- `frontend/views/partials/auth-page.ejs`, `frontend/public/js/auth.js`: autofill metadata, remembered email, persistent-session option and role notices.
- `backend/routes/authRoutes.js`, `frontend/routes/frontendRoutes.js`: verified role guidance and one canonical sign-in implementation.
- `backend/controllers/passwordResetController.js`: recovery input validation.
- `backend/routes/dashboardRoutes.js`, `app.js`: authenticated, scoped activity API.
- Four role dashboards, `finance-pulse.ejs`, `finance-mobile.ejs`, `finance-dashboard.css`, `finance-dashboard.js`: sidebar design and real-data activity cards.
- `frontend/src/premium.tsx`: welcome focuses a visible dashboard heading after finishing.

## Verification and limits

Automated checks cover recovery rendering, expired-link states, password confirmation/visibility, token consumption, bcrypt updates, wrong-role handling for all four roles, no role disclosure for an invalid password, cookie lifetime, absence of passwords in browser storage, real-data chart rendering, sidebar interaction and data isolation.

**Final verification: 114 tests passed; TypeScript and production build passed; 153 JavaScript/EJS files passed compilation checks.** TypeScript, production assets and JavaScript/EJS compilation are checked separately. Full browser visual inspection, browser-specific password-manager prompts and real SMTP delivery remain unverified in this environment.
