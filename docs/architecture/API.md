# HTTP/API layout

`backend/http/registerRoutes.js` is the central registration point. Existing URL names remain unchanged.

| Prefix | Handler | Purpose |
|---|---|---|
| `/api/auth`, `/api/auth/google` | `authRoutes`, `googleAuthRoutes` | password + Google OAuth, login methods |
| `/api/workbench` | `workbenchRoutes` | profile, task calendar/progress, teams |
| `/api/dashboard`, `/api/analytics` | dashboard/analytics routes | dashboards and reports |
| `/api/attendance`, `/api/leave` | attendance/leave routes | attendance and leave requests |
| `/api/people`, `/api/search`, `/api/activity` | directory/search/audit routes | scoped lists, search and audit |
| `/api/notifications`, `/api/board` | notification/board routes | task and notification actions |
| `/api/reports`, `/api/performance` | report/performance routes | exports and reviews |
| `/api/transfer`, `/api/complaints` | transfer/complaint routes | team transfers and complaints |
| `/api/admin`, `/hr`, `/manager`, `/employee` | legacy role routes | existing role-specific screens and actions |
| `/` | frontend routes | public pages and role login |

Request pipeline in `app.js`: response headers → parsers → CORS + same-origin write checks → cookies → Mongo sessions → validation + access controls → guarded uploads/static EJS → route registrar → central error boundary → 404.

### Error handling

`backend/middleware/errorHandling.js` maps known validation errors to HTTP 400, file-size limit errors to 413, unexpected errors to 500 without exposing stack traces. `asyncHandler()` is provided for new Express 4 promise handlers; new routes should call services and use that wrapper. JSON 404s return `{ success:false, error:'Route not found' }`. Keep domain-specific errors handled by feature services/controllers.

### Adding a new endpoint

1. Create its model/service if necessary, test service rules, then create a thin route module.
2. Add role/session middleware and schema validation; avoid trusting request body role/owner IDs.
3. Register it in `registerRoutes.js` in the correct ordering (especially before frontend catch-all).
4. Add integration tests including anonymous and cross-role denial, plus docs updates.
5. Don't add or change public URL prefixes without migration tests.
