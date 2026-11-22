# RoleSphere — Fix disabled “Connect Google” on localhost:8001

Your previous Google OAuth flow reached Google's account selection successfully, but Google sent the callback to port **8000** while RoleSphere was running on **8001**. After changing settings, the Security page showed **“Your administrator must set up Google OAuth”** and disabled the button. The updated source now shows the concrete configuration error and includes an offline doctor command.

## Install without deleting any private settings

1. Back up your current RoleSphere directory and `.env` file.
2. Extract this ZIP into a **fresh directory**. It has `package.json` in the project root.
3. Copy your **current working** `.env` into this new project directory. The ZIP does not contain any credentials.
4. In the new `.env`, keep your existing MongoDB, session, and JWT values. Check these entries (replace placeholders with your **real RoleSphere OAuth client credentials**):

```dotenv
PORT=8001
BASE_URL=http://localhost:8001
COOKIE_SECURE=false
GOOGLE_CLIENT_ID=your-real-rolesphere-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-real-rolesphere-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8001/api/auth/google/callback
```

5. In Google Cloud Console → **Google Auth Platform → Clients** → your **RoleSphere OAuth client**, add this **Authorized redirect URI** exactly:

`http://localhost:8001/api/auth/google/callback`

6. Run from the project directory:

```bash
npm ci
npm run build
npm run doctor:google
npm start
```

The doctor command checks `.env` but **never prints Client ID or Client Secret**. It will explain which setting is missing or whether the redirect port is wrong. If the result says NOT READY, correct the specific issue and rerun. Run RoleSphere at `http://localhost:8001/workbench`, sign in with your password, then open My profile → Security → Connect Google. Use the Google account with the exact same verified email as the RoleSphere account.

If the app still displays an old message: stop all older RoleSphere server processes (Ctrl+C), confirm the terminal is in the new project directory and `npm start` shows port 8001, and reload the browser. The `.env` file is loaded on startup, **not** when a browser tab is refreshed.

**Do not post your .env, Google client secret, MongoDB credentials or callback authorization code.** The ZIP and patch do not include secrets.

For additional setup and security details, see `docs/GOOGLE_LOGIN.md`.
