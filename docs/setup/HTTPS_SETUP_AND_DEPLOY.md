# RoleSphere — HTTPS migration (macOS local development + public deployment)

This change was made against **RoleSphere_Predeployment_Session_Fixed_2026-11-14.zip**. It retains the existing MongoDB models, pages, API routes, login sessions, and Google login/linking. HTTPS for **localhost** and HTTPS for a **publicly deployed site** are different setups.

## A. Local HTTPS on your Mac

**Before you start:** Close the old RoleSphere server and back up your existing project folder. The updated source ZIP intentionally **does not** contain your `.env`, MongoDB data, OAuth secret, uploaded files, or TLS certificates. Copy the current private `.env` into the new project's root, and preserve existing uploads/custom assets separately. Never publish any of these private files.

### First-time setup

1. Extract the new HTTPS ZIP into a **new folder**, open it in VS Code and open the terminal in that folder.
2. Copy **your own existing RoleSphere `.env`** from the previous folder into the new folder. Keep `MONGO_URI`, `SESSION_SECRET`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` intact.
3. Install dependencies: `npm ci`.
4. Install mkcert (requires Homebrew): `brew install mkcert`.
5. Run `npm run https:setup` **on your Mac**. This command:
   - Runs `mkcert -install` to trust a local development CA. macOS may ask for your account password; it is used by macOS to trust the CA, not by RoleSphere.
   - Generates `certs/localhost.pem` and `certs/localhost-key.pem` **locally** for `localhost`, `127.0.0.1`, and `::1`.
   - Makes a private `.env.https-backup-...` and updates **only** `PORT`, `HTTPS_ENABLED`, `TLS_CERT_PATH`, `TLS_KEY_PATH`, `COOKIE_SECURE`, `TRUST_PROXY`, `BASE_URL` and `GOOGLE_REDIRECT_URI`.
   - Retains all other existing `.env` values. If `PORT` is already 8001 it stays 8001; if it is 8000 it stays 8000. Do not assume a port: check the setup output.
6. Run `npm run doctor:https` and `npm run doctor:google`.
7. Register the exact **HTTPS** Google redirect URI printed by setup under **Google Cloud → Google Auth Platform → Clients → your RoleSphere Web application client → Authorized redirect URIs**. For port 8001:
   - `https://localhost:8001/api/auth/google/callback`
   - You may also add `https://localhost:8001` to Authorized JavaScript origins; this is not essential to the server-side callback flow.
   - The existing `http://` callback entries are *not* equivalent to `https://`.
   - Click **Save** and allow time for changes to propagate.
8. Run `npm run build` and `npm run dev:https` (or `npm start` after setup). Open **`https://localhost:<your PORT>`**. Do not use `http://` on the same port.
9. In Chrome go to **My profile → Security → Connect Google**. Confirm it returns to HTTPS and shows the account as connected.

### Verify HTTPS on your Mac

`curl -Iv https://localhost:8001/healthz` should report `SSL certificate verify ok` (or an equivalent successful TLS verification) if the mkcert trust setup is complete. `curl -i https://localhost:8001/healthz` should return `200` without `-k`. The certificate must be issued for `localhost`. Use the port printed by setup if not 8001.

Log in with an existing user. Check DevTools → Application → Cookies: `connect.sid` must be **Secure**, **HttpOnly**, **SameSite=Lax**. An ordinary login has no persistent `Expires`; Remember Me has approximately 30 days. Confirm notifications still work using `wss://` implicitly through the same-origin Socket.IO client. Check password reset links use HTTPS. Logout and confirm the session is invalidated.

### Common errors

- `mkcert is not installed` — run `brew install mkcert`, then rerun `npm run https:setup`.
- macOS password request — `mkcert -install` needs OS trust approval; do not put any password into RoleSphere's `.env`.
- `Port 8001 is occupied` — stop the other service. TLS/OAuth will **not** silently switch ports. Or change `PORT`, `BASE_URL`, `GOOGLE_REDIRECT_URI` together to a free port and add that exact URL to Google Cloud.
- `redirect_uri_mismatch` — Google Cloud client and `.env` must use the exact same `https://localhost:<PORT>/api/auth/google/callback` (including scheme, port and path). Ensure the correct OAuth client ID is used.
- `ERR_SSL_PROTOCOL_ERROR` — you're likely opening HTTPS against the **old HTTP server**, or the new server is not running. Stop previous Node processes and start from the new folder.
- Browser warns about certificate — first confirm `mkcert -install` ran and that you used `https://localhost`, not an unrelated host. Don't bypass warnings for an unexpected certificate.
- `connect.sid` not stored — ensure HTTPS is used and `COOKIE_SECURE=true`; don't mix `localhost` and `127.0.0.1` in one login flow.
- Google login disabled — run `npm run doctor:google`; do not share `GOOGLE_CLIENT_SECRET` or `.env`.

### Local-only security notes

`mkcert` is **for local testing, not production**. `certs/` and any `.env` backups are excluded from Git and Docker contexts. The mkcert **CA private key** lives outside this project and must never be distributed. No real TLS key, OAuth secret or MongoDB credentials are packaged in this ZIP. RoleSphere HTTPS mode serves TLS on its configured port **without a second plaintext HTTP listener**. For local development, HSTS is disabled so Chrome does not permanently pin localhost; production enables HSTS.

## B. Public deployment over HTTPS

For a deployment on Render or another trusted hosting platform, **let the platform handle the real publicly trusted TLS certificate**. Do not upload localhost mkcert keys, and do not enable `HTTPS_ENABLED=true` inside a platform that already terminates HTTPS in front of Node.

Set hosting environment variables (values are examples, not a real registered domain):

```dotenv
NODE_ENV=production
HTTPS_ENABLED=false
COOKIE_SECURE=true
TRUST_PROXY=true
BASE_URL=https://your-actual-domain.example
GOOGLE_REDIRECT_URI=https://your-actual-domain.example/api/auth/google/callback
GOOGLE_CLIENT_ID=<RoleSphere OAuth client ID>
GOOGLE_CLIENT_SECRET=<RoleSphere OAuth client secret>
MONGO_URI=<hosted MongoDB URI>
SESSION_SECRET=<strong private random string>
JWT_SECRET=<different strong private random string>
```

Keep existing secrets private in the host's dashboard. `TRUST_PROXY=true` must **only** be used behind a properly configured trusted reverse proxy (Render's managed ingress). A direct HTTPS local process uses `TRUST_PROXY=false` to avoid spoofed forwarded-scheme headers.

In Google Cloud, register the **real production HTTPS URL**, including `/api/auth/google/callback`. Configure your domain DNS, host-provided SSL certificate, HTTP → HTTPS redirect and domain-specific CORS as required by your host; these external actions cannot be completed by packaging application source. Test Admin, HR, Manager and Employee login, Google connect/disconnect, secure cookies, registration, uploads, notifications, password reset and MongoDB before public launch.

## C. Test commands

```bash
npm ci
npm run build
npm run check
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:tdd
npm run test:https
npm run doctor:https
npm run doctor:google
npm run dev:https
```

The new `tests/https.test.js` runs a real HTTPS fixture with a **temporary disposable test certificate**, not your private certificate, and validates secure cookies, OAuth redirects and the Socket.IO TLS endpoint. It never calls the real Google OAuth service or requires the MongoDB integration test database. It does not replace manual real-browser and Google-account verification.


## Structure note (November 2026 refactor)

`server.js` remains the entrypoint. The actual Socket.IO bootstrap is now `backend/realtime/socketServer.js` and the endpoint mounts are in `backend/http/registerRoutes.js`. Local certificate setup remains `npm run https:setup`; do not deploy `certs/`. See [code architecture](../architecture/CODEBASE.md).
