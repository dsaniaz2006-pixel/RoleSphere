# RoleSphere Predeployment Audit Report

## 1. Application Entry Point
- **Entry point:** `server.js` (bootstraps DB, starts HTTP/HTTPS server, sets up Socket.IO)
- **Express factory:** `app.js` (initializes middleware, routes, and session store)
- **Route registration:** `backend/http/registerRoutes.js`

## 2. Build Process & Assets
- **Build command:** `npm run build` (runs `build:vendor`, `build:ui`, `build:css`)
- **Generated assets:** `frontend/public/` (compiled Tailwind CSS, React UI bundles)
- **Node version required:** Node 24 LTS (currently pinned to 20 in render.yaml - needs update)

## 3. MongoDB Atlas Integration
- **Connection method:** `mongoose.connect(process.env.MONGO_URI)`
- **Location:** `server.js` (before starting the HTTP server)
- **Graceful shutdown:** Yes (handled on `SIGTERM`/`SIGINT`)

## 4. MongoDB-Backed Session Storage
- **Library:** `connect-mongo`
- **Location:** `backend/middleware/sessionStore.js` (or equivalent)
- **Survives restarts:** Yes
- **Cookie settings:** `secure: true` (when `COOKIE_SECURE=true`), `httpOnly: true`, `sameSite: 'lax'`

## 5. File Upload & Storage
- **Library:** `multer`
- **Location:** `backend/middleware/uploadConfig.js`
- **Storage path:** `uploads/` (relative to project root)
- **Production issue:** Ephemeral on Render (requires Persistent Disk or S3/R2)

## 6. Email Delivery Architecture
- **Library:** `nodemailer`
- **Location:** `backend/services/emailService.js`
- **Provider:** SMTP (Gmail or generic SMTP)
- **Production issue:** Render free tier blocks SMTP ports (requires HTTP API like Resend)

## 7. Google OAuth
- **Routes:** `backend/routes/googleAuthRoutes.js`
- **Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- **Status:** Will fail in production if redirect URI is not updated to HTTPS domain

## 8. HTTPS & Reverse Proxy
- **Config:** `render.yaml` sets `TRUST_PROXY=true`, `HTTPS_ENABLED=false`, `COOKIE_SECURE=true`
- **Local HTTPS:** Supported via `mkcert` (must NOT be used in production)

## 9. Socket.IO Connections
- **Location:** `backend/realtime/socketServer.js`
- **Auth:** Uses Express session middleware
- **Rooms:** Private user rooms and role-based rooms

## 10. Scheduled Monthly Reports
- **Location:** `backend/services/monthlyReports.js`
- **Startup:** `startMonthlyReports()` called in `server.js`
- **Status:** Controlled by `ENABLE_MONTHLY_REPORTS=false` (disabled by default)

## 11. Migrations & Seed Scripts
- **Migration:** `backend/services/employeeMigration.js` (runs on startup, backfills pending employees)
- **Seeds:** `scripts/seed.js` (must NOT be run against production)

## 12. Existing Tests & Outstanding Failures
- **Test runner:** Jest (19 suites, 193+ tests)
- **CI:** `.github/workflows/ci.yml` (Node 20 - needs update to 24)
- **Current status:** All passing locally

## 13. Missing Production Env Variables
- `MONGO_URI` (Atlas connection string)
- `SESSION_SECRET` (strong, unique)
- `JWT_SECRET` (strong, unique, different from session)
- `BASE_URL` (exact Render HTTPS domain)
- `RESEND_API_KEY` (if replacing SMTP)
- `UPLOAD_ROOT` (if using Persistent Disk)

## 14. Dev vs Prod Differences
- Dev uses local `uploads/` folder (ephemeral on Render)
- Dev uses Gmail SMTP (blocked on Render free tier)
- Dev uses `localhost` for OAuth redirects (must be HTTPS in prod)
