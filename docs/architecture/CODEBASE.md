# RoleSphere codebase architecture

## Design principle

Separate **transport** (HTTP/Socket.IO), **authentication/policies**, **business services**, **data models**, **persistence queries**, and **rendering**. Keep legacy URL contracts unchanged until a separate versioned migration is tested.

```text
RoleSphere/
  app.js                         # Express app factory: createApp({ store }) for tests
  server.js                      # HTTP / local HTTPS process and Mongo startup
  backend/
    config/                      # environment validation, allowed origins, ports, TLS
    http/registerRoutes.js       # all URL groups, ordered explicitly
    routes/                      # request/response adapters grouped by feature
    controllers/                 # HTTP handlers and orchestration
    services/                    # business rules, OAuth, email, reports, task logic
    repositories/                # shared/complex persistence boundaries (only when useful)
    models/                      # Mongoose entities
    middleware/                  # headers, sessions, access policy, error conversion
    validators/                  # shared request validation
    errors/                      # operational application error types
    realtime/                    # Socket.IO notification transport
    utils/                       # date, pagination utilities
  frontend/
    views/                       # server-rendered EJS templates and partials
    public/                      # compiled bundles, CSS, images, vendor files
    src/
      components/ui/             # reusable React primitives
      features/                  # feature-oriented React modules as extracted
      services/                  # shared HTTP/API transport
      state/                     # shared asynchronous UI state/hooks
      lib/                       # small pure UI utilities
  config/env/                    # redacted environment examples only
  docs/                          # setup, architecture, API, features, testing, history
  tests/ scripts/
```

### Stable entry points

`app.js` is an importable Express app factory; `server.js` is the process entry point. Tests, Docker and local HTTPS startup rely on these paths, so they remain stable.

### Backend boundaries

- `routes` register endpoints and translate HTTP concerns. Keep route modules thin when new feature work is added.
- `controllers` coordinate request-specific work and response decisions.
- `services` implement reusable business behavior and must not render EJS or depend on browser UI.
- `repositories` are added only for shared/complex persistence operations; avoid wrapping every Mongoose call in a generic abstraction.
- `models` declare schemas and persistence invariants.
- `middleware` centralizes sessions, access policies, security headers and error conversion.
- `validators` owns request payload validation. `backend/middleware/validation.js` remains a compatibility re-export for older imports.
- `errors/AppError.js` represents expected failures; `middleware/errorHandling.js` maps known errors to safe responses.

### Frontend boundaries

- `frontend/src/services/apiClient.ts` is the shared same-origin API transport and typed API error boundary.
- `frontend/src/state/api.ts` provides the React `useData` hook with loading/error state and request cancellation; it re-exports `api` for existing imports.
- `components/ui/` contains reusable UI primitives. Feature-specific components can move into `features/` incrementally.
- `frontend/views` and `frontend/public/js` remain active compatibility layers. Do not delete EJS views or legacy scripts because a TypeScript source file exists; several templates load browser scripts directly or dynamically.

### Environment and state

- `backend/config/environment.js` validates required runtime settings and production secrets.
- `config/env/` stores examples, not actual credentials. Keep local `.env`, certificates and private keys out of Git.
- Auth state remains server-session-backed. Do not store credentials in browser storage or duplicate session truth in a client-side store.

See [refactoring decisions](REFACTORING.md), [error handling](ERROR_HANDLING.md), [API contracts](API.md), [frontend state](STATE.md), and the [environment reference](../setup/ENVIRONMENT_REFERENCE.md).
