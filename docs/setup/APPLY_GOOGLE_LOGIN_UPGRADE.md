# Apply the Google login upgrade to your existing RoleSphere folder

**Recommended: use the patch ZIP** so your existing custom image/font assets, uploads, `.env`, database, and dependencies are preserved.

1. **Back up** your original RoleSphere folder.
2. Extract `RoleSphere_Google_Login_Patch.zip`; it contains `RoleSphere/` with only new and changed source files.
3. Copy the patch's `RoleSphere/` contents **into** your existing project's `RoleSphere/` folder and choose **Merge/Replace** for matching files. **Do not delete** your original project before copying. Do **not** overwrite your existing private `.env`.
4. Open Terminal in the actual updated project directory, run:

```bash
npm ci
npm run build
npm run typecheck
npm start
```

5. Copy the three `GOOGLE_*` variables from `.env.example` into your existing private `.env`; set their values using your Google Cloud project's own OAuth web client. See `docs/GOOGLE_LOGIN.md`.
6. Choose your role at `http://localhost:8000/login`, sign in with your existing password, open **My profile → Security** or **Login methods & security**, then connect Google once. On subsequent logins, choose **Continue with Google**.

The alternate *Updated Source* ZIP contains the entire source tree without dependencies, environment secrets, or font binaries; using the patch instead is the easiest way to preserve your original project's visuals.
