# Glass authentication update

Based on the latest supplied RoleSphere 2(1).zip and the Glass Folder Cards component in Pasted text.txt.

Changed: login.ejs, register.ejs, role-login.ejs, role-register.ejs and register-pending.ejs. Added shared auth and folder partials; auth.css, glass-folder.css, auth.js and auth-art.js; and auth UI tests.

The original artwork recipes, noise generator and glass-folder styling were adapted to the existing EJS stack. Files become sign-in/account links. Decorative add/remove file actions were omitted from authentication. No React/shadcn migration or external stock imagery was needed.

Existing POST /login and /register endpoints are used. Server JSON errors, HTML credential failures, duplicate-account errors and 429 responses are displayed within the form. Normal successful redirects and the administrator approval process are preserved. Native POST forms still work without JavaScript.

Desktop and mobile rendering and interaction checks passed in Chromium; the automated test suite passed 71 tests. Original credentials, private uploads, dependencies and temporary files are excluded from the deliverable. Configure your local .env and run npm ci, npm run build and npm run dev as documented in the README.
