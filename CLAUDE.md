# TTR-PFW — Table Tennis Rating Converter

## About

A web app for the Luxembourg table tennis federation (FLTT). The primary purpose is helping the federation estimate an equivalent **FLTT PFW** rating for foreign players, so they can be placed at the correct level for Luxembourg tournaments and leagues.

Live at **https://ttr-pfw.vercel.app**. GitHub: **https://github.com/JVanGo/TTR-PFW**.

This new version of the app is being rebuilt on a Next.js 16 + Supabase stack so it can grow beyond a static converter — eventually with admin imports, a player database, and authenticated edits.

## Authoritative project docs

Two files in this repo are the source of truth for _how_ to build, and you should re-read them whenever something seems ambiguous:

- **`TECH-STACK.md`** — what tools the project uses, why, the dev/prod environments, env vars, file structure, testing strategy, CI workflow, free-tier limits.
- **`CODING-INSTRUCTIONS.md`** — the "do this, never that" rules: TypeScript style, Server vs Client components, Supabase + RLS, migrations, error handling, what's safe to do without asking vs what needs approval.

If a rule in this file conflicts with those, **the rule there wins**. This file focuses on Jeff and on the project's purpose, not on the mechanics.

## How to work with Jeff

Jeff is not a developer. He runs Windows and opens Claude Code from PowerShell. He's learning Claude Code as he goes. Keep these in mind at all times:

### Communication

- Explain everything in plain, everyday language. No jargon (component, state, props, API, endpoint, hook, middleware, migration, RLS, etc.) without a short plain-English explanation the first time it appears in a session.
- When describing changes, say **what Jeff sees**, not what the code does: "the page now shows X" rather than "I added a select component".
- Always link the live site with its full URL — **https://ttr-pfw.vercel.app** — when referencing it. Jeff is new to Claude Code and benefits from clickable links.
- Keep responses short. End with one or two sentences on what changed and what's next. No long summaries — Jeff can read the diff.

### Saving and publishing changes

After any meaningful set of working changes, ask: **"Would you like to save this to GitHub?"**

If Jeff says yes — or anything obviously affirmative — handle everything without follow-up questions: write the commit message, stage, commit, push, and confirm it's live. Jeff should never need to type a git command himself. After a push, mention that the live site at https://ttr-pfw.vercel.app will rebuild in a minute or two.

### "Try again now"

When Jeff says **"Try again now"**, restart the previous attempt from scratch without asking for details. He doesn't explain what went wrong — he just wants a retry.

### Planning for bigger changes

For new features, redesigns, or anything touching the database schema, switch to **Plan Mode** first (Shift+Tab twice). Sketch the approach in plain language, get Jeff's nod, then implement. The pre-commit and pre-push hooks will block obviously broken code from landing, but they don't catch design mistakes.

## Project state

- The app is being rebuilt from scratch. The previous version was a static converter at `https://ttr-pfw.vercel.app`. The new scaffold replaces it on the same repo (`github.com/JVanGo/TTR-PFW`) and same Vercel project, so once Supabase env vars are wired up in Vercel, the live URL serves the new build automatically.
- The page at `app/page.tsx` is still the Next.js starter content while the foundation is being verified.

### Calibration history (carry-over from the old version)

The original converter used these formulas (kept for reference until the new version reimplements them):

- A1–C3 classes: `TTR = (PFW + 587.68) / 0.596`
- D1–D3 classes: `TTR = round((PFW + 355.17) / 0.596)` — anchored so RIVOTTI Luca (PFW 62.03) = TTR 700.
- Germany / Austria / Netherlands use the same scale. Belgium / France / ITTF are hand-estimated.
- Source data lives outside the repo at `C:\Users\fltt\Documents\` and `C:\Users\fltt\Downloads\` (TTR explanation docs, the FLTT IR-22 spec, the Verbandsrangliste PDFs).

## Tech stack at a glance

For the full version with rationale, see `TECH-STACK.md`. The short list:

- **Next.js 16** App Router (Server Components by default).
- **TypeScript** strict.
- **Tailwind CSS v4** + **shadcn/ui** primitives.
- **Supabase** (Postgres + Auth + Row Level Security). Local DB via Docker; prod DB at supabase.com.
- **Vercel** Hobby tier for hosting. Auto-deploys on push to `master`.
- **Vitest** for unit tests, **Playwright** for three smoke E2E specs.
- **Husky** pre-commit (lint-staged) and pre-push (typecheck + unit tests).

### Heads-up: Next.js 16 is different from your training data

Next.js 16 shipped some breaking changes. Most relevant:

- **`middleware.ts` is now `proxy.ts`.** Same purpose, new file name and function name. There's a `proxy.ts` at the repo root, plus a Supabase helper at `lib/supabase/proxy.ts`.
- `next lint` is gone — the `lint` script in `package.json` calls `eslint` directly.

When in doubt, read `node_modules/next/dist/docs/` for the version installed in this repo before relying on memory of older Next.js versions. See `AGENTS.md` — that's why it's there.

## Project structure

```
app/                    # Routes. Server Components by default. Add "use client" only where needed.
  layout.tsx            # Root layout, metadata, fonts
  page.tsx              # Home page
  globals.css           # Tailwind imports
components/             # Feature components grouped by area
  ui/                   # shadcn/ui primitives — don't edit unless explicitly asked
lib/                    # Non-React utilities (parsers, conversions, formatters)
  supabase/             # Client factories: server.ts, browser.ts, proxy.ts (the auth helper)
supabase/
  migrations/           # SQL schema migrations, timestamp-prefixed, append-only
  seed.sql              # Local-only seed data
e2e/                    # Three Playwright smoke specs
proxy.ts                # Next.js 16 proxy entry point (was middleware.ts in older versions)
.env.example            # The env var names the app needs — copy to .env.local locally
TTR/                    # Local-only federation data exports (gitignored)
```

Use the `@/...` import alias for all local imports.

## Environments

There are exactly two — don't invent a third. See `TECH-STACK.md` for the full table.

- **Local**: `npm run dev` at http://localhost:3000, talking to a local Postgres started with `supabase start` (needs Docker Desktop running).
- **Production**: https://ttr-pfw.vercel.app, talking to the cloud Supabase project. Only ever updated by merges to `master`.

Vercel preview deploys (auto-built per PR) hit production Supabase — treat them as read-only QA surfaces.

**Mental check**: if the URL is `localhost`, you're local. If it's `*.vercel.app` or the custom domain, you're touching prod.

## Helping Jeff learn Claude Code

Introduce features naturally, when they'd be useful — not all at once.

- When Jeff wants to undo: _"You can type `/undo` to reverse the last change I made."_
- When Jeff wants to see what changed: _"You can type `/diff` to see exactly what I changed."_
- When something isn't working after a couple of tries: _"Let's start a fresh conversation — type `/clear`."_
- When Jeff is describing a big feature: _"For something this big, let's switch to planning mode — you can do this yourself by pressing Shift+Tab twice."_
- When Jeff gives a vague prompt, gently coach a better version: _"Next time, you could say something like '...'"_. Praise specificity when he nails it.

## Common pitfalls to avoid

- **Overusing `"use client"`.** Default is Server Component. Add `"use client"` only for components that need state, effects, browser APIs, or event handlers.
- **Desktop-only design.** Always build mobile-first; test small-screen first, then widen with `sm:` / `md:` / `lg:` prefixes.
- **The prompt loop.** If a fix isn't landing after two attempts, stop and try a different approach — don't keep asking for the same fix.
- **Forgetting RLS.** Every new Supabase table needs `ENABLE ROW LEVEL SECURITY` and at least one policy. See `CODING-INSTRUCTIONS.md`.
- **Touching production directly.** Day-to-day work hits the **local** Supabase. If something would write to `*.supabase.co`, stop and ask.

@AGENTS.md
