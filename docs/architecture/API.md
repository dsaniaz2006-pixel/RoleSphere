# HTTP/API layout

`backend/http/registerRoutes.js` is the central registration point. Existing URL names and request/response contracts are retained for current dashboards and browser scripts.

| Prefix | Handler | Purpose |
|---|---|---|
| `/api/auth`, `/api/auth/google` | `authRoutes`, `googleAuthRoutes` | Password + Google OAuth, login methods |
| `/api/workbench` | `workbenchRoutes` | Profile, task calendar/progress, teams |
| `/api/dashboard`, `/api/analytics` | dashboard/analytics routes | Dashboards and reports |
| `/api/attendance`, `/api/leave` | attendance/leave routes | Attendance and leave requests |
| `/api/people`, `/api/search`, `/api/activity` | directory/search/audit routes | Scoped lists, search and audit |
| `/api/notifications`, `/api/board` | notification/board routes | Task and notification actions |
| `/api/reports`, `/api/performance` | report/performance routes | Exports and reviews |
| `/api/transfer`, `/api/complaints` | transfer/complaint routes | Team transfers and complaints |
| `/api/admin`, `/hr`, `/manager`, `/employee` | legacy role routes | Existing role-specific screens and actions |
| `/` | frontend routes | Public pages and role login |

Request pipeline in `app.js`: security headers → parsers → CORS + same-origin write checks → cookies → Mongo sessions → request validation + access controls → guarded uploads/static EJS → route registrar → central error boundary → 404.

## Error response contract

API failures use `{ success: false, error: string, code: string }`. The `code` is additive; legacy clients that read `success` and `error` remain compatible. Known validation, duplicate-key, file upload, JSON parsing, JWT and application errors are mapped centrally. Unexpected failures return a generic message without exposing stacks, database queries or secrets. See [error handling](ERROR_HANDLING.md).

## Adding a new endpoint

1. Add schema validation and role/session policy before the handler.
2. Put reusable business rules in a service; introduce a repository only for shared/complex persistence operations.
3. Keep the route focused on HTTP parameters and response status.
4. Register it in `registerRoutes.js` in the correct order (especially before frontend route mounts).
5. Add tests for anonymous access, cross-role denial, input validation and the response contract.
6. Update this inventory and `docs/api/`.

## API versioning

The current production contract is unversioned. `/api/v1` is a future additive migration, not yet mounted. When introduced, it must delegate to the existing services and be covered by parity tests while legacy paths remain available. Do not duplicate business logic or silently redirect existing callers.
