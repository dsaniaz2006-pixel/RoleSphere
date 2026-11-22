# RoleSphere — source reorganization and regression report

**Source audited:** `RoleSphere_HTTPS_Updated_2026-11-14(1).zip`.
**Result:** Architecture cleanup with backward-compatible routes and stable server entrypoints.

## Code changes

1. Retained root `app.js`/`server.js` for all existing startup scripts and tests. `app.js` is now a short composition layer.
2. Extracted URL mounting and login rate-limit wiring to `backend/http/registerRoutes.js`, preserving mount order and public paths.
3. Extracted session cookies, security headers, same-origin mutations, old-role access rules and centralized error handling into separate `backend/middleware/*` modules.
4. Centralized required runtime setting validation in `backend/config/environment.js`; production now rejects weak known-placeholder session secrets and insecure cookie settings.
5. Moved Socket.IO bootstrap into `backend/realtime/socketServer.js` and notification event behavior into `backend/realtime/notificationHandlers.js`.
6. Fixed a crash pathway for malformed `notifications:mark_read` payloads: reject malformed IDs and emit a bounded error rather than destructuring unchecked client data.
7. Moved reusable React components from root `components/ui` to `frontend/src/components/ui` and helper `lib/utils.ts` to `frontend/src/lib/utils.ts`. Updated TypeScript, shadcn aliases, Tailwind content roots and esbuild resolution accordingly.
8. Shared `api()` and `useData()` now live in `frontend/src/state/api.ts`, avoiding duplicate data/async-error handling in the workspace view. Added a safe user-facing message for non-JSON responses.
9. Renamed `backend/routes/overview.js` to `overviewRoutes.js`; removed unused `backend/config/db.js` and unused `components/ui/demo.tsx` after checking imports.
10. Kept all active `frontend/public/js` assets, templates, MongoDB models and authentication routes. These compiled/static assets are not dead code.
11. Moved Markdown guides into `docs/setup`, `docs/architecture`, `docs/features`, `docs/testing`, and `docs/history`; added indices and repaired internal links.
12. Added redacted environment templates in `config/env`. Do not put real secrets in the archive.

## Automated tests

- **Before changes:** 95 non-database tests passed in 11 Jest suites.
- **After changes:** 106 tests passed in 15 Jest suites, including HTTP E2E, TLS, OAuth configuration, application security, UI behavior, new modular architecture, build entrypoint, and Socket.IO notification regressions.
- `tsc --noEmit`: passed using a Linux-installed TypeScript compiler.
- `node scripts/check.js`: 192 JavaScript/EJS syntax/template checks passed.
- `node scripts/vendor.js`: passed.
- MongoDB integration suite: **not verified here**. 74 tests could not initialize because the MongoDB Memory Server binary download from `fastdl.mongodb.org` failed with `EAI_AGAIN`. These are infrastructure-blocked, not 74 confirmed application bugs.
- Frontend esbuild asset generation: **not verified here** because this source ZIP's installed dependencies contain a macOS-specific esbuild executable rather than a Linux executable. Execute `npm ci && npm run build` on macOS.
- Real Chrome + live Google Cloud authentication: requires the owner's locally trusted TLS certificate, registered redirect URI and private credentials. Not verified here.

## TDD / bug reproduction

The new `tests/realtime-notifications.test.js` initially failed because no extracted handler existed. Tests exercised absent, operator-shaped and invalid ObjectId payloads, then passed after validating user input and centralizing notification event error handling.

`tests/architecture.test.js` validates folder presence, safe production configuration, same-origin writes, centralized error handling, async error forwarding and valid Markdown links. `tests/build-config.test.js` guards frontend source aliases and all four bundle entry points.

## Outstanding verification before deployment

On macOS, start from a fresh extracted directory, restore the **private** `.env` (do not paste it into chat), run `npm ci`, `npm run build`, `npm run test:integration`, `npm run test:unit`, `npm run test:e2e`, `npm run test:https`, and `npm run doctor:google`. Open the live HTTPS website and manually check all four role dashboards, session cookies, Google linking and unlinking, tasks, attendance, files, reports, and refresh persistence. Do not deploy before the database and live sign-in checks succeed.

## Rollback

Your original uploaded `RoleSphere_HTTPS_Updated_2026-11-14(1).zip` is the rollback snapshot. Restore the previous source files but **keep your private `.env` and user uploads separate**. Database schema and collection names were not migrated by this refactor.

## Scope limitation

Some large legacy route/controller files still combine HTTP response logic and domain operations. These were intentionally not rewritten in this compatibility-focused pass, because doing so safely requires full database, browser and role-authorized acceptance testing. This is a measured modularization, not a claim that every legacy handler was reimplemented.
