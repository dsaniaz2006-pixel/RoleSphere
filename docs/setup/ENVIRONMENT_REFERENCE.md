# Environment configuration reference

Copy `.env.example` to a local `.env` for development. Keep `.env`, local TLS certificates, and all actual secrets outside Git. The files under `config/env/` are redacted setting examples for local HTTP, local HTTPS, and production behind a hosting provider's HTTPS proxy; they are not complete secret stores.

| Variable | Purpose | Handling |
|---|---|---|
| `MONGO_URI` | MongoDB connection URI | Secret when it contains credentials; use a local/test database for tests and a private managed secret in production |
| `SESSION_SECRET` | Express session signing secret | Secret; use a unique random value, at least 32 characters in production |
| `JWT_SECRET` | JWT signing/verification secret | Secret; use a unique random value, at least 32 characters in production |
| `PORT` | HTTP/HTTPS listener port | Non-secret setting |
| `NODE_ENV` | Runtime mode | `development` or `production` |
| `COOKIE_SECURE` | Secure session-cookie flag | `true` for public HTTPS deployments |
| `TRUST_PROXY` | Trust configured reverse proxy | Enable only behind the intended trusted proxy |
| `HTTPS_ENABLED` | Use direct local TLS | `true` for local mkcert HTTPS; production usually terminates TLS at the host |
| `TLS_CERT_PATH`, `TLS_KEY_PATH` | Local TLS files | Paths only; keep certificate/private-key files out of Git |
| `BASE_URL` | Canonical public/local origin | Must match the active scheme, host and port |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client credentials | Secret values supplied through local `.env` or host secret settings |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | Non-secret URL; register the exact URL in Google Cloud |
| `EMAIL_SERVICE`, `EMAIL_HOST`, `EMAIL_PORT` | Email transport selection | Non-secret provider settings |
| `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | Email account and sender | Credentials are secrets; `EMAIL_FROM` is a configured sender identity |
| `ENABLE_MONTHLY_REPORTS` | Enable scheduled monthly reports | Boolean setting; keep disabled until recipients/transport are configured |
| `MONTHLY_REPORT_TO` | Monthly report recipients | Treat as private operational data |
| `DEMO_PASSWORD` | Password assigned by the demo seed script | Local-only secret; unique, at least 12 characters; never use a shared default or production password |

## Local seed safety

The seed script accepts only a MongoDB database named `rolesphere_demo` and now requires an explicitly configured `DEMO_PASSWORD`. It no longer supplies a public default password. Set the value only in your private local `.env` before running `npm run seed`.

## Production

Set secrets in the hosting provider's environment/secret manager. Do not copy a local `.env`, mkcert certificate, or private key to the deployment. Configure `BASE_URL`, `GOOGLE_REDIRECT_URI`, `COOKIE_SECURE=true`, and `TRUST_PROXY` according to the hosting provider's documented proxy model. `npm run doctor:https` validates local TLS configuration; it is not a substitute for testing the deployed domain and OAuth callback.
