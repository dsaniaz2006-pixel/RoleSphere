> **Archive:** Preserved for reference. For current paths and commands, use [the documentation index](../README.md).

# Fix for the local login connection error

Cause: after a successful login, fetch followed the dashboard redirect. The original Content Security Policy upgraded that redirect from http://localhost:8001 to https://localhost:8001. The local server did not provide TLS, causing ERR_SSL_PROTOCOL_ERROR. The frontend caught that as a generic connection failure. This affected all four roles.

Fix: app.js ties upgrade-insecure-requests and HSTS to the existing COOKIE_SECURE flag. HTTP development with COOKIE_SECURE=false no longer requests HTTPS; HTTPS deployments with COOKIE_SECURE=true keep those headers.

## Apply to your existing folder

1. Stop the running server with Ctrl+C.
2. Replace only app.js with the corrected app.js from this archive. Keep your own .env and database.
3. For localhost HTTP, ensure COOKIE_SECURE=false in your .env. Your existing PORT=8001 may stay.
4. Run npm run dev and refresh http://localhost:8001/login. Use your configured port if different.

No dependency installation, CSS rebuild, seed command, password reset or database reset is needed for this fix. The automated suite includes 73 passing tests and regression checks for both HTTP development and HTTPS deployment headers.
