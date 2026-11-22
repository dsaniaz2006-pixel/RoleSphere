# RoleSphere appearance update

This update uses `RoleSphere_Dotted_Dashboards(2).zip` as its base. It keeps the Express/EJS application and mounts React components where animation or upload state requires them.

## Start

Keep your existing `.env` and personal `uploads/` folder. This update adds dependencies, so run these commands once in the updated project folder:

```bash
npm ci
npm run build
npm run dev
```

Use the HTTP address printed by the server. A hard refresh clears old styles. After this setup, ordinary source edits only need the development server; you do not need to reinstall packages for every file change.

For production use `npm run build`, then `npm start`. The Docker and Render builds already run the bundle build. The archive includes compiled CSS/JS as well as component sources.

## Your eight requests

| Request | Result |
| --- | --- |
| ASMR background for Admin | An interactive shard/dust canvas behind Admin's main content, with magnetic pull, a perpendicular vortex and proximity glow. The original demonstration's caption and cursor replacement are omitted so dashboard controls remain usable. |
| Dark and white themes throughout | One shared preference across the landing page, glass authentication pages, all role dashboards, reports, workspace, password pages and older standalone pages. Stored locally, with system preference as the initial default and cross-tab updates. |
| R. logo on every page | A charcoal mark with a warm dot, shared wordmark and SVG favicon. The image supplied shows a lowercase mark; this update uses the requested uppercase `R.` treatment consistently. |
| Upload empty states | Fanned document/image icons, a Choose file action, drag/drop, selected file name/size, Change and Remove controls. All existing file inputs keep their IDs, field names and upload handlers. |
| Larger RoleSphere name | Larger wordmarks in the hero, auth navigation, dashboard sidebar and the shared masthead on standalone pages. |
| Interactive hover buttons | Expanding dot/fill, sliding label and arriving arrow on dashboard action buttons. Keyboard focus gets the same treatment. Original DOM buttons, form actions and handlers stay attached; icon-only and sidebar navigation controls retain their layout. |
| Canvas “Welcome, Name” after login | Wensity's particle-ring-to-letterform source renders the actual signed-in name. A welcome token changes on successful login; per-tab storage prevents replay on refresh. |
| Dashboard reveal after welcome | The reference's blur, vertical movement and stagger treatment reveals sidebar, header and content after the welcome. Skip/Escape enters immediately. |

HR has no existing file input in this project. Its task/attachment review features remain intact; the shared upload component is ready for any future HR upload form. No new upload permissions or routes were invented.

Existing upload points:

- Admin announcement attachment.
- Manager task submission.
- Employee complaint attachment, profile photo and task submission.

The server still enforces file type/size rules: documents up to 10 MB, profile images up to 2 MB, and complaints limited to JPEG/PDF. UI hints and drag/drop limits match these rules. A selected file is labeled “Ready to submit”; selection alone does not upload it.

## Behavior and accessibility

- Appearance button: bottom-right on every rendered full page; the landing navigation also controls the same preference.
- Admin background pause/play: next to the theme button. Canvas pauses when the tab is hidden and does not animate with reduced motion. Particle density is reduced on phones, DPR is capped and the loop is limited to roughly 30 FPS.
- HR, Manager and Employee retain their dotted backgrounds, with a brighter dot fill in dark appearance.
- Welcome duration: about 3.1 seconds. Skip button, Escape, reduced-motion bypass, focus restoration and a safety timeout prevent the intro from trapping the dashboard. Main regions are inert only while the welcome is present.
- If a canvas context is unavailable, the welcome shows readable text. If React's effect layer fails, the dashboard remains reachable.
- SVG marks/icons are decorative where text already names the control. File inputs remain native and keyboard reachable. No backend permission boundaries were relaxed.

## Source references and adaptation

All five linked component pages and the five supplied recordings were reviewed, together with `image(7).png` and `image(8).png`.

- ASMR Background — ashish rajwani: https://21st.dev/@ashishrajwaniai01/components/asmr-background
  - Published particle algorithm and recording reviewed. Adapted to dashboard bounds, both themes, mobile budgets, visibility/pause controls and reduced motion.
- Empty State — Serafim: https://21st.dev/@serafimcloud/components/empty-state
  - Public usage, MIT attribution and recording reviewed. Recreated its icon-fan card treatment with working upload state and native file inputs rather than demo-only actions.
- Interactive Hover Button — Dillion Verma / Magic UI: https://21st.dev/@dillionverma/components/interactive-hover-button
  - https://magicui.design/docs/components/interactive-hover-button
  - MIT-attributed design, docs and recording reviewed. Adapted to existing EJS buttons without replacing their handlers.
- Canvas Text — Wensity: https://21st.dev/@wensity/components/canvas-text
  - Source: https://raw.githubusercontent.com/ksparth12/wensity-shadcn-registry/main/canvas-text.json
  - The actual React source is included in `components/ui/canvas-text.tsx`. Changes add a visible no-context fallback and fit long text to available width. MIT source attribution retained.
- Reveal Text — Ajith k v: https://21st.dev/@ajith66310/components/reveal-text
  - Public demo, MIT attribution and recording reviewed. Framer Motion word reveal is used in the welcome; a matching CSS blur/stagger treatment reveals EJS dashboard regions.

The public pages exposed usage demos for Empty State, Interactive Hover Button and Reveal Text rather than full implementation files through the available retrieval route. Those integrations are adaptations of the demonstrated behavior, not claims that the exact hidden source was copied. Canvas Text is sourced directly from the linked registry.

## Files and dependencies

- `frontend/src/components/ui/`: ASMR, Canvas Text, Empty State, Interactive Hover Button and Reveal Text React/TypeScript sources.
- `frontend/src/premium.tsx`: upload state, welcome orchestration, theme controls and enhancement of existing buttons.
- `frontend/public/js/theme-init.js`: early theme initialization before styles paint.
- `frontend/public/css/premium.css`: shared tokens, light/dark surfaces, wordmarks, interaction styling and responsive adjustments.
- `frontend/views/partials/`: shared theme assets, brand, appearance controls and upload input markup.
- `frontend/public/images/brand-mark.svg`: shared favicon.
- Updated full EJS templates include the same appearance assets. `components.json`, TypeScript aliases and the Tailwind content paths from the previous update remain in use.
- Added packages: `lucide-react`, `framer-motion`. `scripts/build-ui.js` now emits both dashboard-background and premium-ui bundles.
- Successful login stores a new non-secret welcome UUID in the existing server session; `app.js` exposes the current name/token to templates. This avoids losing the intro when login's fetch follows its redirect before the browser navigates.

## Verification and limits

**Final result: 96 tests passed; TypeScript and production build passed; 146 JavaScript/EJS files passed syntax/compilation checks.**

Automated verification covers:

- Existing authentication, role isolation, task, leave, transfer and upload rules against temporary MongoDB.
- New successful-login token lifecycle.
- Theme persistence/cross-tab updates and unavailable local storage.
- Correct role-specific background mounts, shared branding and safe name escaping.
- Existing upload field names, selection/removal, unsupported drops and profile size limit.
- Native button identity and event handling.
- Welcome skip/inert release, token replay behavior and reduced-motion bypass.
- ASMR particle coordinates, pause behavior and palette redraw with a mocked canvas.
- TypeScript, production bundles, CSS parsing and EJS/JavaScript compilation.

A full browser preview was unavailable for this run. Automated DOM tests and mocked-canvas checks do not verify actual GPU/canvas appearance, exact animation timing, hover feel, contrast at every layout or performance on your phone/Mac. These visual/device checks remain to be confirmed in your browser. Live email and deployment were not exercised.

## Updating an existing copy

Because the shared assets reach many pages, use this complete updated project rather than copying only a single template. Preserve your own `.env`, database and personal uploads. If merging manually, copy the new components, shared partials, premium entry point and built assets, plus every modified EJS template, package files, build script, `app.js` and `backend/routes/authRoutes.js`.
