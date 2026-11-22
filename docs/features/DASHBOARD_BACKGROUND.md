# Dashboard dot background

The supplied DotPattern is mounted as a React island inside the existing Express/EJS application. HR, Manager and Employee dashboards use it; Admin keeps its existing background. Dashboard tabs share the same background. The landing page and authentication pages are unchanged.

## Run the updated project

Keep your existing `.env` and personal `uploads/` directory. In the extracted project folder run:

```bash
npm ci
npm run build
npm run dev
```

Use the HTTP address printed by your server. Sign in normally as HR, Manager or Employee. A hard refresh may be necessary if an older CSS file is cached. The archive includes the compiled JS/CSS, and `npm run dev` watches both component and Tailwind sources.

## Existing structure and added paths

| Purpose | Path from project root |
| --- | --- |
| Existing server-rendered pages | `frontend/views/` |
| Existing Tailwind source | `frontend/src/tailwind.css` |
| Built Tailwind stylesheet | `frontend/public/css/app.css` |
| Reusable React components (new) | `frontend/src/components/ui/` |
| Requested component | `frontend/src/components/ui/dot-pattern.tsx` |
| Requested standalone demo | `components/ui/demo.tsx` |
| Class-name helper | `frontend/src/lib/utils.ts` |
| Dashboard React entry point | `frontend/src/dashboard/background.tsx` |
| Compiled browser bundle | `frontend/public/js/dashboard-background.js` |
| Background layout and fade | `frontend/public/css/dashboard-background.css` |

Originally this app had Tailwind 3, but no React components, TypeScript configuration or shadcn aliases. These are now configured. `@/` resolves to the project root in both TypeScript and esbuild; `components.json` maps shadcn's UI alias to `@/components/ui`. Creating this directory keeps copied components and generated imports consistent. It is a convention, not an Express requirement.

The supplied component was preserved with stricter SVG prop types in place of `any`. `useId` provides the SVG pattern ID. The unused duplicate circle ID was removed. The demo is included for reuse; the live dashboards render only the dots, without the demo title or its 500px container.

## Props, behavior and assets

- Dashboard values: spacing `width=24`, `height=24`; `cx=1`, `cy=1`, `cr=1`.
- The component has no application state, data requests or context providers. Its only hook is React's `useId`.
- Dependencies: React, React DOM, clsx and tailwind-merge (v2 for Tailwind 3). Build/type tooling: esbuild, TypeScript and React type definitions.
- No photos or icon assets are needed for a dotted SVG background.
- Slate dots use 50% fill on phones and 70% from 768px upward. The radial mask scales with the viewport.
- The SVG is decorative, hidden from accessibility APIs, cannot receive focus, and ignores pointer events. White cards remain opaque and interactive.
- The background stays fixed while content scrolls. It does not animate or require motion preferences.
- Only the three selected templates load the bundle and scoped stylesheet. Admin does not create a mount point or load either asset.

## Setup reference for another copy

This ZIP is already set up; do not initialize a new application inside it. To reproduce its integration in an older EJS project, copy the new source/configuration files and three updated templates, then install:

```bash
npm install react react-dom clsx tailwind-merge@^2.6.0
npm install -D typescript @types/react @types/react-dom esbuild tailwindcss@^3.4.17
```

Also copy the `build:ui`, `typecheck`, `build` and `dev` scripts from this `package.json`, and the Tailwind content paths. Preserve the project's existing Tailwind 3 configuration.

The equivalent shadcn initialization command in a supported React project is `npx shadcn@latest init`; select TypeScript and point UI components to `@/components/ui`, utils to `@/lib/utils` and styles to the project's Tailwind source. RoleSphere uses the manual setup because it is an Express/EJS app with an esbuild React island, rather than a standard CLI-detected React framework. No shadcn CLI invocation is needed to run this component.

Official references:
- https://ui.shadcn.com/docs/components-json
- https://v3.shadcn.com/docs/installation/manual

## Verification

- All 73 existing tests passed against temporary MongoDB.
- TypeScript type checking passed.
- Production React/Tailwind build and JS/EJS compilation passed.
- Rendered templates checked in Chromium at 390px and 1440px: correct pattern IDs and dot props, responsive opacity/mask, noninteractive layer, scroll positioning, no document overflow, and no Admin mount.
- Visual checks used fixture data and stubbed external dashboard APIs/CDNs; they do not verify live email, database contents or third-party chart services.

## Apply to an existing folder

Use the complete updated project, or copy these changed files and directories:

- `frontend/src/components/ui/`, `frontend/src/lib/`, `components.json`, `tsconfig.json`
- `frontend/src/dashboard/`
- `frontend/public/js/dashboard-background.js`
- `frontend/public/css/dashboard-background.css` and `frontend/public/css/app.css`
- `frontend/views/hrDashboard.ejs`, `frontend/views/managerDashboard.ejs`, `frontend/views/employee-dashboard.ejs`
- `scripts/build-ui.js`, `tailwind.config.js`, `package.json`, `package-lock.json`

Then run the startup commands above. The archive excludes dependencies, credentials, personal uploads and temporary database files.
