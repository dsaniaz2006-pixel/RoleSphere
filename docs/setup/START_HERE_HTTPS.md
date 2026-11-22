# RoleSphere — Start here: HTTPS on macOS

This project is configured to support **HTTPS** while preserving its original database and user accounts. The ZIP does **not** include your private `.env` or TLS key.

1. Back up the old RoleSphere folder and extract this ZIP into a new folder.
2. Copy your existing private `.env` from the old RoleSphere folder into this new root directory.
3. In this folder's VS Code terminal:

```bash
npm ci
brew install mkcert
npm run https:setup
npm run doctor:https
npm run doctor:google
npm run build
npm run dev:https
```

4. Open the **HTTPS** link shown by the server, usually `https://localhost:8001` if your `.env` already had `PORT=8001`.
5. In Google Cloud → Auth Platform → Clients → RoleSphere OAuth client, **add the exact HTTPS Google callback printed by `https:setup`** and click Save. Example: `https://localhost:8001/api/auth/google/callback`.
6. Restart RoleSphere and test **My profile → Security → Connect Google**.

**Important:** The setup script generates and trusts your local certificate on your Mac, preserves existing private credentials, and creates a `.env` backup. It does **not** provide public hosting HTTPS. For deployment, see [docs/HTTPS_SETUP_AND_DEPLOY.md](HTTPS_SETUP_AND_DEPLOY.md).

[HTTPS implementation and test results](../testing/HTTPS_IMPLEMENTATION_TEST_REPORT.md)
