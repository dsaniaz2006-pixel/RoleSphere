> **Archive:** Preserved for reference. For current paths and commands, use [the documentation index](../README.md).

# PDF implementation map

Source: the supplied RoleSphere upgrade guide, 14 pages. Scope for this delivery: functional upgrade first; visual design afterward, as requested.

| Guide item | Delivered status | Evidence or remaining action |
| --- | --- | --- |
| Remove secrets from shipped source | Done | No .env in output; .env.example provided |
| Rotate exposed credentials | Account-owner action | Rotate Atlas/SMTP passwords and app secrets; inspect remote Git history |
| Remove personal uploads and dead duplicate/model | Done | Empty folders with .gitkeep; duplicate middleware, dead LeaveRequest and unused React file removed |
| Remove direct bcrypt/mongodb packages | Done | bcryptjs and Mongoose retained; lockfile included |
| Fix missing 403 | Done | Real HTML denial page; integration test |
| Escape HTML/data rendering | Done | escapeHtml, safe script JSON, delegated events, local DOMPurify at legacy sinks |
| IST date, late clock and Sunday | Done | Shared utility used for attendance and dashboard dates; boundary tests |
| Admin mobile navigation | Functional fix done | Menu toggle exposes existing sidebar |
| Local Tailwind build and CSP CDN removal | Done | Build config, compiled CSS, no Tailwind runtime CDN |
| Pin Chart.js and one FullCalendar | Done | Chart.js 4.4.3, FullCalendar 6.1.8; duplicate Chart.js includes removed |
| Unified design tokens/theme | Deferred UI phase | No full visual redesign applied |
| Shared layout/head/sidebar across all pages | Deferred UI phase | Minimal header/footer repair supplied for broken review pages; complete migration still planned |
| Toast/confirm helpers | Functional helpers done | Shared functions; new feature pages use them |
| Replace all alerts/confirms, skeletons, premium stat deltas, avatars, count-up | Deferred UI phase | Legacy dialogs/cards are retained |
| Login/register redesign | Done: chosen glass design | Animated role folders, matching forms, inline errors, password controls and responsive layouts |
| Landing page redesign | Separate UI phase | Existing landing page retained |
| Split all dashboard scripts into section modules / nonce CSP | Deferred UI phase | Event handlers extracted; legacy inline script blocks remain |
| Analytics: four endpoints and charts | Done | New analytics router and workspace section |
| Audit log: model/service/actions/Admin activity | Done | Persisted audit records, filters and pagination |
| Global search and Ctrl+K palette | Done | Role scope, escaped regex, keyboard controls, navigation commands |
| Manager task Kanban and three-column personal ToDo | Done | SortableJS pinned/local, server transitions and ownership, move buttons |
| Org chart (optional feature 5) | Done | Approved managers/reports and unassigned employees |
| Server pagination (optional feature 6) | Done in APIs; legacy controls deferred | People, activity and board APIs; legacy lists accept explicit paging with compatible keys. Legacy dashboard controls remain with UI work |
| Monthly report email (optional feature 7) | Implemented, disabled | Shared summary builder and node-cron; set recipients/SMTP to enable; real sending not tested |
| Write validation | Done | Global write middleware, route-required fields, multipart validation and existing business checks |
| State-changing GET review | Done | Admin delete actions now POST; logout intentionally retained |
| csrf-csrf token package | Optional, not added | Existing sameSite cookie approach retained |
| Importable app / server bootstrap split | Done | createApp export, startup isolated |
| Meaningful Jest + Supertest tests | Done | Real temporary MongoDB; see VERIFICATION.md |
| Demo seed data and credentials | Done | Requested user counts, 60-day attendance, all task/leave states, reviews; idempotence verified |
| Dockerfile and GitHub Actions | Files done | Live Docker build and hosted Actions run not executed here |
| Render and health endpoint | Config done | Actual deployment, database and HTTPS credentials are account setup work |
| Durable upload hosting | Documented option | Mount persistent disk/volume; cloud object storage not implemented |
| Honest README / architecture / tradeoffs | Done | Correct stack, startup, credentials, security and deployment notes |
| Screenshots/GIF/live demo URL | Deferred until UI/deployment | No fabricated screenshots, badges or URLs |

## Constraints to keep visible

Leave application overlap checks and balance changes span multiple documents. Existing workflows use checks plus writes; a production concurrency pass with MongoDB transactions would be useful before supporting high write contention. Task review and final status claims use atomic filters, but transfer assignment and balance updates are not a complete multi-document transaction. Audit persistence is best effort and logs a failure rather than blocking a business action, as the guide specifies.

The optional monthly job runs inside the server process and is intended for one scheduler-enabled process. A distributed scheduler and retries are outside this scope.
