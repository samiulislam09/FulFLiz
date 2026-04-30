@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

`fulfliz` is one of several independent satellite apps under `/Volumes/works/seloraX/apps/` (alongside `add-spy`, `invoice-maker`, `lookalike-audiences`, `marketing-reports`, `remove-bg`). Each sibling has its own git history and package manager — there is no workspace-level `package.json` and no shared tooling. The parent `seloraX/CLAUDE.md` describes the SeloraX backend (`SeloraX-Backend/`) and dashboard (`SeloraX-dashboard/`) — those are separate projects, not dependencies of this app.

The `.env` defines `SELORAX_CLIENT_ID`, `SELORAX_CLIENT_SECRET`, and `APP_URL`, indicating this app is intended to act as an OAuth client against the SeloraX backend. No integration code exists yet — the codebase is still the unmodified `create-next-app` template.

## Critical: read the bundled Next.js docs before writing code

Per `AGENTS.md`, this is **Next.js 16.2.4** with **React 19.2.4** — both newer than typical model training data and with breaking changes from the Next.js 13/14/15-era APIs you may remember. **Always consult `node_modules/next/dist/docs/` before writing or modifying Next.js code**, especially:

- `01-app/01-getting-started/` — current API surface (layouts, pages, route handlers, metadata, fetching/mutating, caching, revalidating)
- `01-app/02-guides/` — feature guides; `instant-navigation.md`, `caching-without-cache-components.md`, and `migrating-to-cache-components.md` describe behavior with no v15 analogue
- `01-app/02-guides/migrating/` — what changed coming from older Next.js
- `01-app/03-api-reference/` — exhaustive reference for current APIs
- The `index.md` agent hints (e.g. *"If fixing slow client-side navigations, Suspense alone is not enough. You must also export `unstable_instant` from the route"*) flag specific footguns — heed them.

Heed deprecation notices in the docs. Do not assume an API exists because it existed in earlier Next.js versions.

## Commands

```bash
yarn dev      # Start dev server (port 3000)
yarn build    # Production build
yarn start    # Start production server (after build)
yarn lint     # Run ESLint (flat config, ESLint 9)
```

Package manager is Yarn (a `yarn.lock` is present; no `packageManager` field is pinned in `package.json`). No test runner is configured.

## Stack specifics

- **App Router only** — code lives in `app/`, no `pages/` directory.
- **TypeScript strict mode** with `moduleResolution: "bundler"`. Path alias `@/*` resolves to the project root, so `import x from "@/app/page"` works.
- **Tailwind CSS v4** uses the new CSS-first configuration. There is **no `tailwind.config.js`**. Theme tokens live in `app/globals.css` via `@import "tailwindcss"` and an `@theme inline { ... }` block (e.g. `--color-background`, `--font-sans`). PostCSS uses the new `@tailwindcss/postcss` plugin.
- **ESLint 9 flat config** (`eslint.config.mjs`) composing `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`. Older `.eslintrc.*` files are not used.
- **Fonts**: `next/font/google` is wired up in `app/layout.tsx`, exposing CSS variables `--font-geist-sans` / `--font-geist-mono` consumed by the `@theme` block in `globals.css`.

## Deployment

The bundled Vercel deployment defaults apply (no `next.config.ts` overrides, no `vercel.json`).
