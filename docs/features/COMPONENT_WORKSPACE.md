# RoleSphere component workspace

Open **Profile, calendar & teams** in any role's dashboard sidebar, or visit `/workbench` after signing in. The existing dashboards and operations workspace remain available.

## Reference mapping

These are original RoleSphere implementations adapted from the layouts and behavior in the supplied public component demos, screenshots and recordings. They are not purchased 21st.dev premium source packages or exact copies of unavailable source. No paid license was purchased, no private attachment was bypassed, and no claim of paid-component ownership is made.

| Selected reference | Integration |
| --- | --- |
| [HeroUI Table](https://21st.dev/@hero_ui/components/heroui-table) | Rounded, theme-aware semantic tables with quiet headers, status badges and row detail. Shared table treatment also enhances existing dashboard tables. |
| [Flexi Filter Table](https://21st.dev/@ruixen.ui/components/flexi-filter-table) | Task/attendance search, status filters, date range, name sorting, row selection, empty states and pagination. Existing dashboard tables receive a search of loaded rows without replacing existing action handlers. |
| [Apple Calendar Picker](https://21st.dev/@pulseawan/components/apple-calendar-picker) | Month/year selection and calendar grid for attendance, project start, planned submission and profile DOB. Black date text in light mode; white in dark. Selected day reverses contrast. Existing native date fields get the same picker. |
| [Floating Panel](https://21st.dev/@cult-ui/components/floating-panel) | Rounded modal form panels for calendars, milestones and team creation. Existing dashboard textareas gain an expanded editor with Apply/Cancel. |
| [Activity Card](https://21st.dev/@kokonutd/components/activity-card) | Task progress rings and saved milestone checklist sit beside the project calendar, with notes and explicit save. |
| [Vertical Settings Tabs](https://21st.dev/@cnippet-dev/components/v-tabs-13) | Working My profile / Security tabs. Profiles include name, email, phone, DOB and bio for all four roles. No Integrations section or placeholder security switches. |
| [Team Showcase](https://21st.dev/@makviesainte/components/team-showcase) | Overlapping member cards with hover/focus emphasis and actual team roster. HR and Manager can create saved teams from eligible staff. Initials represent real employees; no stock photographs imply fictional employees. |

The project remains Express/EJS with React islands. Installing HeroUI v3 would introduce its separate styling stack; the existing Tailwind 3 application was retained instead of migrating unrelated screens.

## Source and styles

- Reusable React/TypeScript components: `/frontend/src/components/ui/` (AppleCalendarPicker, FloatingPanel, ActivityCard, FilteredTable, TeamShowcase).
- shadcn configuration: `/components.json`; `@/components/ui` resolves to `frontend/src/components/ui`. The shared `cn` utility remains `/frontend/src/lib/utils.ts`.
- Tailwind entry: `/frontend/src/tailwind.css`; theme tokens: `/frontend/public/css/premium.css`.
- New shared component styles: `/frontend/public/css/workbench.css`.
- Workbench entry: `/frontend/src/workbench.tsx`; existing form/table enhancements: `/frontend/src/component-enhancements.tsx`.
- Generated local scripts: `/frontend/public/js/workbench-ui.js` and `component-enhancements.js`.
- Server routes: `/backend/routes/workbenchRoutes.js`, mounted at `/api/workbench`.
- No new external packages, contexts, image assets or icon providers are required. Existing React, lucide-react, TypeScript, Tailwind and esbuild packages are reused.

## Saved behavior and boundaries

Profiles use the existing role account; no duplicate account is created. Updates allow name, phone, DOB and bio only, and refresh the session name. DOB must be a real past date, from 1900 onward. DOB and bio are excluded from ordinary model projections. Team directory/card responses omit phone, DOB, email and passwords.

Task plans live in `TaskPlan` records linked to existing tasks. Planning dates are date-only strings, avoiding timezone shifts. A plan saves start date, planned submission, estimated progress, notes and milestones. It does not modify assigned deadlines, submission files, submitted timestamps, task approval status or existing review permissions. Admin/HR can plan organization tasks; Managers see their own assigned tasks and employee tasks within their current reporting group; Employees see only their own assignments. Task assignments load 40 per page; the table filters the loaded assignment page.

Attendance loads only the signed-in person's month. Selecting a calendar date is read-only. Check-in/out buttons call the existing endpoints, which use today's India Standard Time date and retain Sunday/duplicate checks. Administrators use their existing organization attendance reports rather than an invented personal attendance identity.

Only HR and Manager can create teams. An HR selects an approved Manager; a Manager can select only themselves. Members must be approved and currently report to that Manager. Team creation never reassigns employees or skips transfer approval. Team cards filter out members who have transferred or lost approval. Admin can view organization teams, Managers their teams, and Employees teams they currently belong to. The newest 100 teams are returned.

The old form fields, IDs, required constraints and submit listeners are retained. Calendar selection emits the original input/change events. Expanded text editing updates the original textarea and requires the original form's normal submit to persist. Existing table search filters only loaded rows and does not alter server pagination or action buttons.

## Run and upgrade

Back up your current application. Copy this version while preserving your own `.env`, existing database and upload directory. Install and build with:

```sh
npm ci
npm run build
npm start
```

MongoDB creates the new `Team` and `TaskPlan` collections when first used. Added profile fields default to empty strings; no destructive migration or demo seed is required. Do not run the demo seed against a real database. Compiled assets are included in this archive. Existing login autofill/native submission, theme controls and authorization workflows are preserved.

## Verification

`npm run typecheck`, `npm run build` and `npm run check` pass. Jest covers API persistence and permissions as well as rendered React interaction with JSDOM. The tests exercise profile save, calendar selection, milestones, team creation, table filtering and original-field event compatibility.

Full visual browser QA was unavailable in this environment. Responsive CSS and light/dark tokens are implemented and stylesheet syntax is checked; these checks do not substitute for checking the final layout in a real browser. On your running app, review both themes at phone/tablet/desktop widths and test the native dialog keyboard/focus behavior in your supported browsers. Native `<dialog>` requires a modern browser.
