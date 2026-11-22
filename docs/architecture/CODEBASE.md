# RoleSphere codebase architecture

## Design principle

Separate **transport** (HTTP/Socket.IO), **authentication/policies**, **business services**, **data models**, and **rendering**. Keep legacy URL contracts unchanged until a separate versioned migration is tested.

```text
RoleSphere/
  app.js                       # Express app factory: createApp({ store }) for tests
  server.js                    # HTTP / local HTTPS process and Mongo startup
  backend/
    config/                    # environment, allowed origins, port rules, TLS
    http/registerRoutes.js     # all URL groups, ordered explicitly
    middleware/                # headers, same-origin, sessions, validation, auth, errors
    routes/                    # request/response adapters grouped by feature
    controllers/               # HTTP handlers and orchestration
    services/                  # business rules, OAuth, email, reports, task logic
    models/                    # Mongoose entities
    realtime/socketServer.js   # Socket.IO private rooms
    utils/                     # date, pagination utilities
  frontend/
    views/                     # server-rendered EJS templates and partials
    src/
      components/              # React components, independent of Express
      lib/                     # utilities such as cn()
      state/api.ts             # shared API request + loading/reload hook
      workbench.tsx            # workspace UI, local form state
    public/                    # compiled bundles, CSS, images, vendor files
  config/env/                  # redacted environment examples only
  docs/                        # setup/ architecture/ features/ testing/ history/
  tests/ scripts/
```

### Why root `app.js` and `server.js` remain

Existing tests, Docker, and startup scripts import them. Keeping these two stable entrypoints avoids changing external interfaces while the implementations are separated.

### Boundary rules

- `routes` register endpoints and make response decisions; prefer calling services for business rules.
- `services` implement business behavior; should not render EJS or access browser UI.
- `models` declare schemas; do not put OAuth secrets in records.
- `middleware` centralizes auth, CSRF-related origin policy, session management and HTTP error conversion.
- `frontend/src/state/api.ts` owns the shared request and asynchronous data-loading hook; component-local state remains local.
- `frontend/public/js` contains both bundled React output and legacy direct browser scripts. These are still needed; **do not delete public JS just because a TypeScript source file exists**.

### Compatibility and remaining technical debt

- Some legacy route files still mix handlers with business operations (e.g., large role routes). They were deliberately *not* rewritten wholesale: doing so without full integration/browser testing risks changing permissions.
- Public routes are not prefixed by `/api/v1` yet. `registerRoutes.js` centralizes mounts so API versioning can be added behind a separately tested, nonbreaking migration.
- `frontend/views` contains legacy camelCase template names referenced by active URLs; retained for compatibility.
- Demo and unused database connection helper were removed only after checking that no runtime imports referenced them.
- Legacy documentation remains in `docs/history` for troubleshooting but may contain outdated paths.
