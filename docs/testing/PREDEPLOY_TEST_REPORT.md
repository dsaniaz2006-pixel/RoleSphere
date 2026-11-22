# RoleSphere — predeployment audit and test report

**Audit date:** 14 November 2026. **Base:** `RoleSphere_Google_Login_Configuration_Fixed.zip`, the last project ZIP available to this session. This is a source-code audit and local automated testing report, **not** a certification of the user's deployed MongoDB/Google Cloud configuration.

## Executive result

**Not yet approved for public production deployment.** The tested source has passed 91 automated tests across 11 suites that can run without an external MongoDB server, and the TypeScript sources typechecked with a locally available TypeScript 5.8.3 compiler. Full database integration (74 tests), the frontend production rebuild on this Linux host, live Google OAuth, and a real Chrome browser E2E test remain unverified here.

## Verified fixes (all include regression tests)

| Issue | Root cause | Core change | Evidence |
| --- | --- | --- | --- |
| Google callback 8000/8001 port mismatch | Server silently picked a new free port even when Google had an explicit registered redirect URI | Refuse port fallback when configured OAuth uses a specific callback; give actionable startup error | `tests/predeploy-regressions.test.js` |
| Cross-origin session-write exposure | `sameSite=lax` cookies can be sent across same-site local ports, and CORS does not prevent CSRF | Reject write requests with an Origin different from the server origin, across legacy and new routes | `tests/predeploy-regressions.test.js` |
| Logout cookie inconsistency | Seven separate logout handlers destroyed sessions without consistently clearing `connect.sid` | Shared `backend/services/logout.js` clears session cookie after server-side invalidation | `tests/predeploy-regressions.test.js` |
| Password reset token can be raced/replayed | `findOne` then `deleteMany` allowed concurrent requests to read the same valid reset token before either consumed it | Atomic `findOneAndDelete` before the password update; missing target is treated as error | `tests/password-reset-regressions.test.js` |
| Legacy router could provision public Admin accounts if mounted independently or reordered | Unused older registration/controller code duplicated authentication with `isApproved = role === 'Admin'` | All registration paths and old controller exports delegate to canonical handler that denies public Admin creation | `tests/legacy-registration-regression.test.js` |

### Test-driven development (TDD) evidence

The new regression tests were first run against the previous behavior and failed (red): absent port guard, missing logout cookie clearing, reset-token reuse, and an Admin account successfully created through the standalone legacy router. After the corresponding code changes, the tests passed (green). The TDD scripts remain in the project for future regression checks.

## Four requested verification approaches

1. **Unit/component testing:** Existing 82 tests pass, covering login UI, configuration, Google signatures, workbench UI, and other components. New TDD tests cover ports, session writes, logout, password reset replay, and legacy registration. `npm run test:unit`.
2. **Integration testing:** Mock-backed Google routes and Express HTTP/session behavior pass. The pre-existing MongoDB integration suite (`tests/integration.test.js`, 74 tests) **could not start its test database**, because `mongodb-memory-server` tried downloading MongoDB 7.0.14 from `fastdl.mongodb.org` and failed DNS (`EAI_AGAIN`). Those 74 are *blocked*, not verified failing application tests. Run `npm run test:integration` on a machine with the MongoDB test binary or set `MONGOMS_SYSTEM_BINARY` to a compatible local `mongod` executable.
3. **End-to-end testing:** `tests/e2e-http.test.js` spawns a separate Express server, logs in through actual HTTP routes with session cookies, loads the Security settings JavaScript into a DOM, checks Google OAuth initialization (registered-port callback, state, nonce, PKCE), and logs out. This is an **HTTP+DOM end-to-end smoke test with a mock in-memory user**; a real Chrome/Playwright browser run **was attempted but blocked by this host's browser policy** before page navigation. Live Google authorization was not attempted with private credentials. Run the manual checklist below on the user's Mac.
4. **TDD:** Separate failing-first tests were introduced and retained for all fixes; run `npm run test:tdd`. TDD is a development process rather than a separate type of testing.

## Local automated check summary

| Command / check | Status | Detail |
| --- | --- | --- |
| Focused baseline | PASS | 82 / 82 tests, 7 suites |
| New regressions, auth security and E2E HTTP+DOM | PASS | Total 91 / 91 tests, 11 suites |
| JavaScript and EJS syntax check | PASS | `npm run check` |
| TypeScript source check (global compiler 5.8.3) | PASS | `tsc --noEmit` |
| Project-provided TypeScript 7 binary on Linux | BLOCKED | Downloaded dependencies contained the Mac-only native binary, not `@typescript/typescript-linux-x64` |
| `npm run build` on this Linux host | BLOCKED | Downloaded dependencies contained Mac-only esbuild binary, not Linux binary |
| Real MongoDB integration (74 cases) | BLOCKED | DNS failure when downloading temporary MongoDB server executable |
| Real Chrome/Playwright browser | BLOCKED | Chromium returned `ERR_BLOCKED_BY_ADMINISTRATOR` on navigation, including `data:` URLs |
| Live Google account linking | NOT RUN | Requires user's OAuth credentials and approved Google test account |

**Do not interpret blocked checks as passing tests.** On the user's Mac, rerun `npm ci && npm run build && npm run typecheck && npm test` and preserve the full terminal output.

## Before deploying: manual acceptance checklist

- [ ] Copy the existing **private** `.env` into the updated project, with no duplicate `PORT`/`GOOGLE_REDIRECT_URI` definitions. Do not commit credentials.
- [ ] On macOS, run `npm ci`, `npm run build`, `npm run typecheck`, `npm run check`, `npm test`, `npm run test:e2e`, and `npm run doctor:google`.
- [ ] Make sure the website starts on exactly the port declared in `.env`. If the port is busy, Google OAuth configuration should cause a descriptive startup failure rather than silently switching ports.
- [ ] In Google Cloud, verify `GOOGLE_REDIRECT_URI` is listed under **Authorized redirect URIs** of the **same Client ID** used by RoleSphere.
- [ ] In a real Chrome browser, register a new Employee account with email; verify it stays pending until Admin approval.
- [ ] Sign in as an existing approved employee via password; go to **My profile → Security**. Connect Google with the same verified email and confirm the account is linked to the existing role.
- [ ] Log out and sign in using **Continue with Google**. Verify correct role dashboard and no duplicate account.
- [ ] Check that a different Google email cannot attach to the existing account; test a rejected/pending user cannot bypass approval.
- [ ] Change login preference to Google and back; disconnect Google with wrong and correct passwords; confirm password login survives.
- [ ] Verify Admin, HR, Manager and Employee permissions, attendance, task assignments, transfers, reports, and file uploads against the **real database**.
- [ ] Verify reset-password links expire and cannot be reused; email delivery and session behavior depend on the deployment environment.
- [ ] Deploy over HTTPS with `COOKIE_SECURE=true`, a valid `BASE_URL`, configured Google HTTPS redirect, secrets stored as host environment variables, and persistent upload storage.

### AI feature inventory

A repository search did **not** find OpenAI, Gemini, LLM, embedding, vector retrieval or AI-agent integrations in this RoleSphere source. It is currently an employee management and authentication app. AI-specific evaluations (prompt injection, model accuracy, RAG retrieval, hallucination rates) are therefore **not applicable to this inspected build**. This does not rule out AI features in a newer file not provided here.

## Notes / limits

- Cookie-origin enforcement is a defensive improvement; full anti-CSRF tokens, CSP without unsafe-inline and a complete security review are still recommended for an internet-exposed production service.
- Existing compiled React UI bundles in the supplied ZIP might be older than the TypeScript source; `npm run build` on the Mac must succeed before judging the Security screen or deploying static assets.
- This audit did not include load testing, penetration testing, real external email delivery or production monitoring.
