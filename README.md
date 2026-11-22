# RoleSphere

Employee management web application with **Admin, HR, Manager and Employee** dashboards, attendance, leave requests, projects/tasks, reporting, and account security. Express + EJS with React components, MongoDB/Mongoose sessions, Socket.IO and optional direct local HTTPS.

## Run locally on macOS

1. Open this folder in VS Code. Keep your own private `.env` outside version control (never put secrets in a ZIP or Git repository).
2. Install dependencies and compile assets:

```bash
npm ci
npm run build
```

3. For local HTTPS, install `mkcert` and run `npm run https:setup` (first time only), then:

```bash
npm run doctor:https
npm run doctor:google
npm run dev:https
```

Open the HTTPS URL printed by the server (normally `https://localhost:8001`). For HTTP-only local development, configure `.env` for HTTP and run `npm start`.

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be real RoleSphere OAuth web-client values. Register the exact `GOOGLE_REDIRECT_URI` with Google Cloud. A ready diagnostic is not proof of successful live sign-in.

## Test and quality checks

```bash
npm run check
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:tdd
npm run test:https
npm run build
```

The integration suite uses `mongodb-memory-server`; on first use it may need network access to download a MongoDB binary. Keep tests isolated from production data. On a machine where `node_modules` was copied from another OS/CPU architecture, delete `node_modules` and run `npm ci` before building.

## Structure

- `app.js` / `server.js` — stable Express app factory and server entrypoints
- `backend/config/` — runtime config, TLS and origin policies
- `backend/http/` — explicit route registrar preserving existing URLs
- `backend/routes/`, `controllers/`, `services/`, `models/` — HTTP and business/data layers
- `backend/validators/`, `middleware/`, `errors/` — request validation, security and error handling
- `backend/repositories/` — reserved for shared/complex persistence queries; avoid needless generic wrappers
- `backend/realtime/` — Socket.IO notifications
- `frontend/views/`, `frontend/public/` — EJS templates and compiled/static assets
- `frontend/src/components/`, `features/`, `services/`, `state/`, `lib/` — React UI, API transport, shared state and utilities
- `config/env/` — safe environment configuration examples; actual `.env` is private
- `docs/` — [architecture](docs/architecture/CODEBASE.md), [API](docs/api/README.md), setup, features and test guidance
- `tests/`, `scripts/` — automated checks and build/developer tooling

Existing routes, roles, database collections, Google OAuth callback paths, EJS template names and legacy browser asset URLs are compatibility contracts. Read [refactoring decisions](docs/architecture/REFACTORING.md) before moving or deleting runtime code.

## Demo data

The seed script only accepts a database named `rolesphere_demo` and requires you to set a unique `DEMO_PASSWORD` (at least 12 characters) in your private `.env`. There is no shared default demo password. See the [environment reference](docs/setup/ENVIRONMENT_REFERENCE.md).

## Deployment

Use your hosting provider's trusted HTTPS termination and set the correct public `BASE_URL`, `GOOGLE_REDIRECT_URI`, `COOKIE_SECURE=true` and trusted proxy setting. Do not deploy Mac local certificates. Keep production secrets in the host's secret manager. See [deployment setup](docs/setup/HTTPS_SETUP_AND_DEPLOY.md).
