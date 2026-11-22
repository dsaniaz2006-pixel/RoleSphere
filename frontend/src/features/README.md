# Frontend feature modules

Place new feature-specific React code under this directory when a feature has a meaningful set of components, hooks, and API interactions. Keep shared primitives in `components/ui/`, shared HTTP calls in `services/`, and reusable asynchronous UI state in `state/`.

Do not move the existing `workbench.tsx` entry point or legacy EJS/browser-script dashboards in a mechanical rename. Extract one feature at a time, keep the existing entry point as a compatibility boundary, and add UI/API contract tests before removing the old implementation.
