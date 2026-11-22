# RoleSphere — Google login and login-method settings

This upgrade keeps existing RoleSphere email/password accounts, four role models, MongoDB sessions, and non-admin approval requirements. No MongoDB data migration is required: `google_identities` is created automatically when the first Google identity is linked. It has a unique Google subject and a unique `(role, userId)` pair, so a Google account cannot be connected to multiple RoleSphere accounts.

## What users can do

1. Register with **full name, email and password** at `/register/<Role>`; Admin public registration remains disabled.
2. Wait for administrator approval if registering as Employee, HR or Manager.
3. Log in with email and password once, select **My profile → Security** (or click **Login methods & security** in the profile workspace).
4. Click **Connect Google**, select the Google account with the **same verified email** as their RoleSphere account, and authorize the minimal `openid email profile` scopes.
5. Use **Continue with Google** on the matching role login screen on subsequent visits.
6. In Security, choose the **preferred** method; both linked methods remain available. The most recently selected preference is highlighted first on the same browser, while MongoDB stores the preference for the account.
7. To **Disconnect Google**, confirm the current RoleSphere password. Password sign-in remains available.

Google login does not create an account automatically and cannot elevate a role or bypass approval. An unlinked user is asked to use the original password login and connect Google in profile settings. This is intentional protection against accidental account merging.

## If the Connect Google button is disabled

The Security tab now displays the **exact configuration problem** returned by the server, rather than a generic administrator message. Before retrying:

1. Open the **same project folder** that you run with `npm start`.
2. Check the root `.env` file for non-placeholder `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. Never share the secret.
3. Run `npm run doctor:google` — it prints only safe guidance and reports missing variables or a localhost port mismatch. It does not contact Google or verify credentials are accepted.
4. If RoleSphere starts at `http://localhost:8001`, set `PORT=8001`, `BASE_URL=http://localhost:8001`, and `GOOGLE_REDIRECT_URI=http://localhost:8001/api/auth/google/callback`. Register the **exact same redirect** under Google Cloud → Google Auth Platform → Clients → RoleSphere OAuth client.
5. Stop the old app (`Control+C`), then run `npm start` again. A running Node process will **not** reload `.env` automatically.
6. Return to `http://localhost:8001/workbench`, open **My profile → Security** and click **Connect Google**. Start a new flow rather than reloading an old OAuth callback.

If the doctor reports READY but the screen stays disabled, you likely have an old server process running or you opened another extracted project folder. Stop all older RoleSphere processes, make sure your terminal is inside the folder containing the updated `package.json`, and restart.

## Google Cloud Console setup (required)

1. Open [Google Cloud Console](https://console.cloud.google.com/), choose or create a project.
2. Under **Google Auth Platform / OAuth consent screen**, configure the app name, audience and contact details. If the app is in **Testing** mode, add the Gmail addresses you will use under **Test users**.
3. Open **Clients → Create client**, select **Web application**.
4. Add the **Authorized redirect URI** `http://localhost:8000/api/auth/google/callback` for the default local server. Configure authorized JavaScript origins only if Google requests them (for example `http://localhost:8000`). Google does not need a browser SDK for this server-side redirect flow.
5. Add to your project's existing PRIVATE `.env`:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
```

6. Run `npm ci`, `npm run build`, `npm start` and open `http://localhost:8000/login/Employee`. The Google button is enabled only when all three environment variables are set and the redirect is a valid Google callback URL.

**Production:** Google requires HTTPS for normal non-localhost redirects; set `GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback` and add exactly that URI in Google Cloud Console. Set `COOKIE_SECURE=true` behind a working HTTPS reverse proxy. Redirect URL matching is exact (scheme, hostname, port and path). If the project changes from port 8000 to 8001 because a port is busy, update both your `.env` redirect URI and Google Cloud credentials and restart.

## Security design

- Server-side authorization code + PKCE (`S256`), random one-time state and nonce, 10-minute flow expiry, and session regeneration on login.
- Google ID tokens are verified using the signed RS256 certificate (Google's JWKS endpoint), with issuer, audience, expiry, nonce, verified email, and subject checks.
- All account links require an already authenticated RoleSphere session and a matching verified email. There is **no automatic account creation or email-only linking**.
- Link records are unique across all role collections. Only the currently logged-in role/account may change methods.
- Google access and refresh tokens are not saved to MongoDB; only the stable Google subject and role/account mapping are stored.
- Disconnect requires the original account password and leaves password login enabled. A Google-only account is not supported by this release.
- Login preference does not remove the other allowed login option, preventing accidental account lockout.
- Do not place OAuth client credentials in JavaScript, EJS, Git, screenshots, or the downloaded ZIP. `.env` is omitted from this delivery.

## APIs

| Path | Method | Use |
| --- | --- | --- |
| `/api/auth/google/start?role=Employee&intent=login` | GET | Begin Google login for selected role |
| `/api/auth/google/start?intent=link` | GET | Begin linking while authenticated |
| `/api/auth/google/callback` | GET | Receive Google OAuth response |
| `/api/auth/google/methods` | GET | Read connected providers and preferred method (login required) |
| `/api/auth/google/preferred` | POST JSON `{ "method": "google" }` | Change preferred login method |
| `/api/auth/google/disconnect` | POST JSON `{ "password": "..." }` | Remove Google identity mapping after password confirmation |
| `/account/login-methods` | GET | Standalone profile-security interface (works even before recompiling React assets) |

## Verification checklist

- Email/password registration still validates email and requires admin approval for non-admin roles.
- Password login works for each of Admin, HR, Manager and Employee.
- Google sign-in before linking produces a safe error and cannot log in.
- Connect a verified Google account under Security and check it becomes **Connected**.
- Choose Google as the preferred method, log out and use **Continue with Google** for the same role.
- Try linking a different Google email — it must be rejected.
- Try signing into a different role or a pending account — access must be rejected.
- Disconnect with a wrong password (rejected), then with the correct password (accepted). Password sign-in still works.

Run source checks and tests on macOS with `npm ci && npm run build && npm run typecheck && npm test`. `tests/google-auth.test.js` mocks Google's token exchange/JWKS and uses a cryptographically signed test ID token. The broader integration suite requires mongodb-memory-server and its MongoDB binary. The Google Cloud consent screen and live Google sign-in must be manually verified with your actual Google OAuth configuration.
