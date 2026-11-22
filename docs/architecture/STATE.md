# Frontend state management

`frontend/src/state/api.ts` contains the shared API client and `useData<T>(path)` hook. Every request uses relative, same-origin `/api/` URLs, and the hook tracks loading/error/refresh via component state. A cleanup guard prevents late responses from updating an unmounted view.

`frontend/src/workbench.tsx` keeps form and modal state locally using React `useState`. Login preference is persisted server-side. Local storage contains only a harmless UI preference hint, never an auth credential. Authentication state comes from the server session cookie.

Prefer lifting state only when two sibling components actually share it. Avoid an extra Redux/Zustand dependency until cross-route data coordination is needed. As the application grows, split `workbench.tsx` by feature (`profile/`, `tasks/`, `attendance/`, `teams/`) with tests around each UI contract.

If an API returns invalid JSON or rejects, the common client emits an actionable error rather than leaving the view permanently loading. Add new React API calls through `api()` rather than repeating fetch/JSON/error logic.
