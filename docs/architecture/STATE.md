# Frontend state management

`frontend/src/services/apiClient.ts` owns same-origin API transport. It normalizes `/api/` URLs, handles JSON and empty responses, supports `AbortSignal`, and returns `ApiError` instances with HTTP status and stable error code. It redirects to `/login` on HTTP 401 as before.

`frontend/src/state/api.ts` owns the React `useData<T>(path)` hook. It exposes `data`, `error`, `loading`, `setData`, and `reload`; it aborts an in-flight request when the path changes or the component unmounts. It re-exports `api`/`ApiError` to preserve existing imports in `workbench.tsx`.

Form, modal and tab state remains component-local in `frontend/src/workbench.tsx`. Lift state only when sibling components genuinely share it. Authentication state comes from the server session cookie, not local storage. Local storage may contain harmless display preferences only, never credentials or session tokens.

Avoid Redux/Zustand until there is a demonstrated cross-route coordination requirement. As the workbench grows, extract one feature at a time into `frontend/src/features/` and cover each extraction with UI/API contract tests.
