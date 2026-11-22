# RoleSphere

Employee management web application with **Admin, HR, Manager and Employee** dashboards, attendance, leave requests, projects/tasks, reporting, and account security. Express + EJS with React components, MongoDB/Mongoose sessions, Socket.IO and optional direct local HTTPS.

## Run locally on macOS

1. Open this folder in VS Code and keep a copy of your **own private** `.env` from the previous installation (never place secrets in a ZIP or Git repository).
2. Install and compile:

```bash
npm ci
npm run build
```

3. For local HTTPS, first install `mkcert` and run `npm run https:setup` (first time only), then:

```bash
npm run doctor:https
npm run doctor:google
npm run dev:https
```

Open the HTTPS URL printed by the server (normally `https://localhost:8001`). For HTTP-only local development, configure `.env` for HTTP and run `npm start`.

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be real **RoleSphere** OAuth web-client values for Google login. Register the exact `GOOGLE_REDIRECT_URI` with Google Cloud. A ready diagnostic is not proof of successful live sign-in.

## Test and quality checks

```bash
npm run check
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:tdd
npm run test:https
```

The MongoDB integration suite needs a reachable test MongoDB (it uses mongodb-memory-server). Run it and a real Chrome sign-in check on your Mac before deployment. `npm run doctor:https` checks local certificate configuration but cannot by itself verify browser trust.

## Structure

- `app.js` / `server.js` — stable Express app factory and server entrypoints
- `backend/config/` — runtime config, TLS and origin policies
- `backend/http/` — explicit route registrar preserving existing URLs
- `backend/routes/`, `controllers/`, `services/`, `models/` — backend HTTP and business/data layers
- `backend/middleware/` — security, sessions, validation and error handling
- `backend/realtime/` — Socket.IO notification transport
- `frontend/views/`, `frontend/public/` — EJS templates and compiled/static assets
- `frontend/src/components/ui/`, `frontend/src/state/`, `frontend/src/lib/` — reusable React UI, API/data hooks and utilities
- `config/env/` — safe environment configuration examples (no real secrets)
- `docs/` — [setup, architecture, features, tests and archive](docs/README.md)
- `tests/`, `scripts/` — automated checks and build/developer tooling

**Existing routes, roles, database collections and Google OAuth callback paths are intentionally unchanged.** Read the [refactor guide](docs/architecture/CODEBASE.md) and [test report](docs/testing/REFACTOR_VALIDATION_2026-11-14.md) for code ownership, migration decisions and limitations.

## Deployment

Use your hosting provider's trusted HTTPS termination and set the correct public `BASE_URL`, `GOOGLE_REDIRECT_URI`, `COOKIE_SECURE=true` and trusted proxy setting. Do not deploy Mac local certificates. Keep production secrets outside the repository. See [deployment setup](docs/setup/HTTPS_SETUP_AND_DEPLOY.md).
