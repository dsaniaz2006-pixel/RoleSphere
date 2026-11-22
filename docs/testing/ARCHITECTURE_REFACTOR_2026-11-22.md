# RoleSphere architecture refactor — verification record

## Scope

This change was applied to the uploaded RoleSphere source archive (the archive's source timestamps are from 14 November 2026). It is a conservative architecture increment, not a wholesale migration of all legacy dashboards/routes.

## Changes implemented

- Added `backend/errors/AppError.js` for expected, safe application errors.
- Expanded the global error boundary to normalize duplicate-key, Mongoose validation/cast, Multer, payload-size, malformed-JSON and JWT errors. API responses retain `success`/`error`, add a stable `code`, and include an additive `message` alias for older consumers. Unexpected errors do not expose raw messages or stacks.
- Refactored the active manager-assignment controller to forward typed errors through `asyncHandler` and the global error boundary. Existing success response shape and duplicate-assignment HTTP 400 behavior are preserved.
- Moved the shared write-validation implementation to `backend/validators/writeValidation.js`; the old middleware path remains a compatibility re-export. The route-access and multipart-upload code now use the validator's owning directory.
- Separated the React HTTP client into `frontend/src/services/apiClient.ts`; `frontend/src/state/api.ts` retains the established `api` re-export and owns `useData` loading/error/cancellation state.
- Strengthened production placeholder detection and removed the shared default demo seed password. The seed process now requires a unique local `DEMO_PASSWORD` of at least 12 characters and does not print it.
- Added `.editorconfig` and `.gitattributes` for consistent text encoding, LF line endings and whitespace behavior.
- Added architecture, API, error-handling, environment, repository-policy, frontend-feature and development documentation.
- Removed `backend/controllers/employeeController.js` and `backend/controllers/taskController.js` after repository-wide source/reference searches found no imports, path references or function references. Active feature routes remain unchanged.

## Audit findings

- Exact file-content scan: no byte-identical source files found.
- Repeated basenames: root `README.md` and `docs/README.md`; they are distinct documents, not duplicates.
- Legacy EJS templates and public browser scripts were retained because references can be dynamic and those assets remain part of the active dashboard runtime.
- A general Mongoose repository abstraction was not added. Existing services already form a business-logic boundary; `backend/repositories/README.md` documents when a repository is warranted rather than adding a needless wrapper around every model.
- `/api/v1` was documented as an additive future migration; no route prefix was changed or mounted in this increment.

## Verification performed in the Linux review environment

| Check | Result |
|---|---|
| `npm run check` | Passed — 194 JavaScript/EJS files |
| `npm run typecheck` | Passed |
| `npm run test:unit` | Passed — 16 suites, 111 tests |
| `npm run test:e2e` | Passed — 1 suite, 2 tests |
| `npm run test:tdd` | Passed — 6 suites, 18 tests |
| `npm run test:https` | Passed — 1 suite, 5 tests |
| `npm run build:vendor` | Passed |
| `npm run build:css` | Passed; generated output was restored afterward to avoid introducing a presentation-only generated-file diff |
| `npm run test:integration` | Blocked: `mongodb-memory-server` could not download MongoDB 7.0.14 (`EAI_AGAIN fastdl.mongodb.org`); subsequent Mongoose buffering timeouts are consequences of the missing test database binary |
| `npm run build` | Blocked at `build:ui`: the uploaded `node_modules` contains the macOS ARM64 esbuild binary but this review environment is Linux x64. Run `npm ci` on the target Mac/CI environment before building; do not copy `node_modules` across platforms. |

## Remaining work / technical debt

- Many legacy routes and controllers still use feature-specific `try/catch` blocks. They need incremental migration to `AppError`/`asyncHandler` with real Mongo integration tests, not a blanket replacement.
- Some large legacy route modules still mix HTTP handling and business operations. Extract services only where behavior can be isolated and regression-tested.
- Some optional environment values are still read directly by existing feature modules. Centralize those consumers incrementally; startup validation and safe examples already exist.
- React feature extraction is still partial; EJS/browser-script dashboards remain supported and should not be removed until parity is tested.
- Integration suite and final full asset build must be rerun on the user's Mac with dependencies installed using `npm ci` and with MongoDB binary download access or a configured test MongoDB binary.
