# RoleSphere Google Apps Script email provider

This provider sends RoleSphere's transactional notification emails through Google Apps Script `MailApp` over HTTPS. It is intended for the Render Free deployment, where outbound SMTP is restricted.

## What it covers

The shared email transport in `backend/services/emailService.js` is used by the existing password-reset, task assignment, leave status, account status, team welcome, team removal, and permanent account removal email templates.

The separate monthly Excel report sender in `backend/services/monthlyReports.js` remains SMTP-based. Keep `ENABLE_MONTHLY_REPORTS=false` on Render unless that separate report sender is migrated too.

## 1. Create the Apps Script project

1. Sign in to the Google account that should send RoleSphere emails.
2. Visit https://script.google.com/ and create a new standalone project named `RoleSphere Email Gateway`.
3. Open `scripts/google-apps-script/Code.gs` in this repository and copy its complete contents into the Apps Script editor, replacing the starter code.
4. Save the project.

## 2. Set the shared secret in Apps Script

1. In the Apps Script editor, open **Project Settings** (gear icon).
2. Under **Script Properties**, click **Add script property**.
3. Set the property name to `ROLESPHERE_EMAIL_TOKEN`.
4. Set its value to a newly generated random secret. Generate one on your Mac with `openssl rand -hex 32`.
5. Save the property. Do not put the token in source code or send it in a screenshot.

This token must exactly match the Render environment variable `GOOGLE_APPS_SCRIPT_TOKEN`.

## 3. Authorize and deploy the Web App

1. In Apps Script, choose **Deploy → New deployment**.
2. Select the gear icon and choose **Web app**.
3. Set **Execute as** to **Me** (the Google account that will send mail).
4. Set **Who has access** to **Anyone**. The endpoint is public at the HTTP layer, but it rejects requests without the private token.
5. Click **Deploy** and complete Google's authorization prompts for sending email.
6. Copy the Web App URL ending in `/exec`. It should look like `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`.

When you change the Apps Script code later, create a new deployment version or edit the existing deployment to point to the latest version. The URL can remain the same when you edit the deployment.

## 4. Configure Render

In Render → `rolesphere` → **Environment**, add:

- `EMAIL_PROVIDER` = `google_apps_script`
- `GOOGLE_APPS_SCRIPT_URL` = the deployed Web App URL ending in `/exec`
- `GOOGLE_APPS_SCRIPT_TOKEN` = the exact same secret stored in Script Properties
- `ENABLE_MONTHLY_REPORTS` = `false`

Save and deploy the Render service.

Do not add Gmail SMTP settings (`EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_HOST`, or `EMAIL_PORT`) for this provider. Do not expose the Apps Script token to frontend JavaScript or Vercel environment variables.

## 5. Test delivery

Use a real email address you control. Trigger a real RoleSphere email flow, such as a password reset or task assignment, and check:

- Render logs for `Email accepted by Google Apps Script`.
- The recipient inbox and Spam folder.
- Apps Script → **Executions** for the corresponding `doPost` execution.

A successful MailApp call means Apps Script accepted the message for sending; it is not a guarantee that the message reached the recipient's inbox. Google applies per-account daily recipient quotas. The script checks the remaining quota before sending.

## Security notes

- Keep the token private and rotate it if exposed.
- Use the deployed `/exec` URL, not the editor's `/dev` test URL.
- The endpoint only sends to one syntactically valid recipient per request, limits subject/body size, and includes a short-lived duplicate-request cache.
- Apps Script is a small-volume transactional mail bridge, not a high-volume email marketing service.
- The monthly workbook email route has not been migrated to this provider; keep its scheduler disabled.

## Rollback

To revert to SMTP mode, remove or change `EMAIL_PROVIDER` so it is not `google_apps_script`. The existing Nodemailer implementation remains available. SMTP from Render Free may still be blocked by the platform.
