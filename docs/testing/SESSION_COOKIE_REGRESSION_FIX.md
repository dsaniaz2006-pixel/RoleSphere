# RoleSphere: Remember Me / browser-session cookie regression fix

## Original failure on macOS (14 November 2026)

`npm run test:integration` reported **73 passed / 1 failed** out of 74 tests. The failed test was:

`remembered sessions last 30 days and ordinary sign-ins use browser-session cookies`

The ordinary sign-in returned `connect.sid` with an `Expires` attribute approximately 14 days in the future. It should have been a browser-session cookie without `Expires` or `Max-Age`.

## Root cause

`app.js` configured a 14-day `cookie.maxAge` for **all** Express sessions. `backend/services/authSession.js` increased it to 30 days for Remember Me logins, but did not clear it for ordinary logins.

The MongoDB store's `ttl: 14 days` controls **server-side record expiry** for sessions that do not have an explicit cookie expiration. It does not require browser cookies to have an `Expires` attribute.

## Changes

- `app.js`: Remove the global persistent `cookie.maxAge`. New sessions are browser-session cookies by default; keep the MongoDB store's server-side TTL.
- `backend/services/authSession.js`: After regenerating the session, explicitly set `cookie.maxAge` to **30 days** if Remember Me was selected, otherwise **null**. This applies to both password and Google sign-ins through the shared session helper.
- `tests/e2e-http.test.js`: Add an HTTP regression test that exercises both modes against real Express endpoints, including `connect.sid` response headers and 30-day expiry.

## TDD verification performed

1. **RED:** The new HTTP test failed on the original source because ordinary login produced `Expires=...`.
2. **GREEN:** After the changes, both HTTP E2E tests passed.
3. **REGRESSION:** All **92 tests across 11 non-MongoDB Jest suites** passed.
4. `tsc --noEmit` (available global TypeScript 5.8.3) passed.
5. `node scripts/check.js`: **176 JavaScript/EJS checks passed**.

**Full MongoDB integration suite is not verified here:** this environment lacks the MongoDB test binary. On the user's Mac, the original 74-test suite reached all tests and failed only the identified cookie assertion. Rerun it with the patch applied. No claim is made that the 74/74 result was observed here.

## Install and verify on Mac

Back up your RoleSphere directory. Extract `RoleSphere_Session_Cookie_Fix_Patch.zip` over the **latest predeployment-audit project**, replacing the matching files. Do not overwrite `.env` or project data.

Run these commands from the project root in VS Code **one at a time** (no shell-comment lines):

```sh
npm run test:integration
npm run test:e2e
npm run test:tdd
npm run test:unit
npm run typecheck
npm run check
npm run doctor:google
npm run build
npm start
```

Expected result for `npm run test:integration` on Mac: **74 tests passed**. This is a target to verify, not a locally observed result.

After signing in, verify that an ordinary login returns a `connect.sid` cookie without `Expires` / `Max-Age`, while Remember Me produces an expiration about 30 days ahead. Previously issued cookies may still contain old attributes until a new login creates a fresh session.

For public deployment, additionally verify live Google callback, database connectivity, browser tests, and production HTTPS settings.
