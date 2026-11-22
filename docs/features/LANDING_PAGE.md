# RoleSphere — Liquid Sculpture landing page

This update replaces the previous orbiting-card hero with Liquid Sculpture Hero, the design in your second screenshot. It uses the gold sculpture artwork, particle engine, Geist and Instrument Serif fonts, dark/light themes and layout from the supplied component, with RoleSphere text and existing account links.

## Update your existing project

1. Stop your development server with Ctrl+C.
2. Copy these paths from this ZIP into the matching paths of your existing project. Copy both asset folders in full:

   - `frontend/views/index.ejs`
   - `frontend/public/css/landing.css`
   - `frontend/public/js/landing.js`
   - `frontend/public/images/landing/`
   - `frontend/public/fonts/landing/`

3. Keep your current `.env`, database and uploads.
4. Run `npm run dev` from your existing project folder.
5. Open the homepage at the address printed in your terminal, for example `http://localhost:8001/` when your `.env` uses `PORT=8001`.
6. Hard-refresh the page to clear the previous landing-page CSS/JS cache.

No npm installation, database reset or seed is needed for this page update. The new hero depends on the local image and font folders: copying only the EJS, CSS and JS files will not display the sculpture correctly.

## Running the complete ZIP

Extract it, copy your current `.env` into its root and retain the same database connection. Restore your existing uploads if you need them. Run `npm ci`, `npm run build`, then `npm run dev`. Local HTTP development requires `COOKIE_SECURE=false`. Your own `.env` sets the port. The archive excludes local secrets, node_modules, personal uploads and test database files.

## Implementation

- Original supplied component: Liquid Sculpture Hero, by guglielmogiannattasio.it; source attribution retained in the JavaScript and visible design credit.
- Adapted the supplied TypeScript WebGL2 engine to browser JavaScript and its React lifecycle to DOM listeners for the existing Express/EJS application. React, shadcn and a second application server are not required.
- The latest integration prompt contained literal newlines inside two quoted JavaScript strings; the earlier valid supplied source was used for those strings. The engine itself is unchanged.
- Exact supplied desktop and mobile sculpture images are bundled locally in light and dark variants. Original fonts are bundled locally with their embedded copyright/license information.
- Dark theme matches the supplied screenshot; the sun button switches to the original light artwork and theme.
- WebGL2 plus floating-point render targets provide the original particle interaction. Without those capabilities, the sculpture is shown as a static image, as in the original component.
- Reduced-motion preference starts with a static image and no GPU engine. Play animation is an explicit opt-in; Pause shows the static original image. If WebGL is unavailable, the animation button is hidden.
- Combined visibility checks pause the engine while the hero is offscreen or the tab is hidden.
- Responsive HTML headings and account links work without JavaScript. The original portrait sculpture is used below 640px.
- The existing four-role section remains below the hero. Backend authentication, sessions, dashboards and database behavior have not been changed.

## Links

- Get started / Create your account → `/register`.
- Sign in → `/login`.
- Role cards → `/login/Admin`, `/login/HR`, `/login/Manager`, `/login/Employee`.
- Existing approval rules and Admin registration restrictions remain in place.

## Verification

- 73 existing Jest tests passed; JavaScript and EJS compilation passed (136 files).
- Production build passed.
- Browser checks passed for both themes, final light-theme foreground/background colors, local image and font loads, widths 320/390/768/1440/1920 without horizontal overflow, login/register links and all four role form links.
- Reduced-motion and changing preferences, no-JavaScript behavior and unavailable-WebGL static fallback passed. No browser script errors or failed asset requests were observed.
- Desktop, phone and light-theme layouts were inspected visually.
- GPU particle rendering and live cursor response could not be verified in this container: its Chromium runtime does not expose WebGL2. The original particle engine is included; test it locally with a WebGL2-capable browser. This limitation is not a claim that the interactive effect was browser-verified.
