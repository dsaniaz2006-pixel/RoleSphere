# Architecture and maintainability decisions

## Current boundaries

- `app.js` is the Express application factory; `server.js` owns process startup, database connection, HTTP/TLS listener and shutdown.
- `backend/http/registerRoutes.js` owns route mounting/order. Route modules preserve existing URL contracts.
- `backend/routes/` adapts HTTP requests and responses; `backend/controllers/` coordinates feature-specific handlers; `backend/services/` owns reusable business operations.
- `backend/models/` owns Mongoose schemas; `backend/repositories/` is reserved for shared/complex persistence queries where an abstraction provides measurable value.
- `backend/middleware/` owns transport concerns such as sessions, security headers and access policies. Request validation is in `backend/validators/`; `middleware/validation.js` remains a compatibility re-export.
- `backend/errors/` owns application error types; the global error boundary converts known failures to safe HTTP responses.
- `frontend/views/` and `frontend/public/` continue to serve EJS templates and existing browser assets. `frontend/src/components/ui/` contains reusable React UI primitives; `frontend/src/services/` owns shared API transport; `frontend/src/state/` owns reusable UI/data state.
- `config/env/` contains examples only. Actual secrets stay outside the repository.

## Stable compatibility boundaries

Keep `app.js` and `server.js`, MongoDB model/collection names, session authentication, OAuth callback path, EJS template names, existing browser script paths and established API URLs stable. Treat any change to those as an API migration requiring regression tests.

## Duplicate/dead-code audit

An exact-content scan of the uploaded source found no byte-identical source files. The only repeated basename at the time of the scan was the root `README.md` and `docs/README.md`, which serve different purposes.

`backend/controllers/employeeController.js` and `backend/controllers/taskController.js` had no references from application source, templates, scripts, tests or documentation. Their CRUD/task handlers duplicate active feature routes and were removed from this refactor. `authController.js` remains because it explicitly provides compatibility exports. No other legacy browser assets or EJS templates were deleted: those can be referenced dynamically and remain part of the dashboard runtime.

## Naming and formatting

Use camelCase for JavaScript functions/variables, PascalCase for React component names and classes, and descriptive kebab-case names for CSS/assets where already established. Existing EJS view filenames and public URLs are compatibility surfaces and should not be renamed casually. `.editorconfig` and `.gitattributes` standardize UTF-8/LF and whitespace behavior across operating systems.

## Repository pattern policy

Do not wrap every Mongoose call in a generic repository. Add a repository only when a query is shared, complex, transaction-sensitive, or needs an independently testable persistence boundary. Keep repositories independent of Express and rendering.

## API versioning strategy

Current endpoints remain unversioned. For future versioning, mount a new `/api/v1` router additively and delegate to the same service layer. Add tests for authentication, role authorization, payload validation and response compatibility for both the new version and legacy endpoints before migrating any frontend caller. Do not duplicate business logic between versions.

## Remaining technical debt

- Some legacy route/controller modules still contain local catch blocks because they render page-specific HTML or preserve established response shapes. Migrate feature-by-feature using integration tests.
- Some route modules are large and combine transport and business operations. Extract services only where the business rule is clear and independently testable.
- Environment validation is centralized at startup, but several existing services read optional environment values directly. Consolidate those consumers incrementally rather than introducing a large configuration rewrite in one change.
- The EJS/browser-script dashboards are not fully migrated to React. Preserve both systems until page-by-page parity and role/access tests exist.
- Integration tests rely on `mongodb-memory-server` downloading a MongoDB binary on first use; offline environments must provide a cached binary or a reachable test MongoDB service.
