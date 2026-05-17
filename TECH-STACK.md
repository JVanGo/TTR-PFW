# Tech Stack

The technology stack for this project. Read alongside `CODING-INSTRUCTIONS.md`.

## Stack

| Layer          | Tool                                                | Notes                                                                                                                 |
| -------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Framework      | **Next.js 16** (App Router)                         | Server Components by default; `"use client"` only where needed                                                        |
| Language       | **TypeScript** (strict)                             | No implicit `any`; no `any` casts without justification                                                               |
| Styling        | **Tailwind CSS**                                    | Utility-first; no separate `.css` files except `globals.css`                                                          |
| UI components  | **shadcn/ui**                                       | Components live in repo at `components/ui/`. Treat as source-of-truth primitives — don't edit unless explicitly asked |
| Database       | **Supabase** (Postgres)                             | Schema lives in `supabase/migrations/` as append-only SQL files                                                       |
| Auth           | **Supabase Auth**                                   | Email/password; sessions checked server-side                                                                          |
| Hosting        | **Vercel**                                          | Auto-deploys from `master`; PRs get preview URLs                                                                      |
| Source control | **GitHub**                                          | `master` is production (`github.com/JVanGo/TTR-PFW`)                                                                  |
| Unit tests     | **Vitest** + `@testing-library/react` + `happy-dom` | Co-located `*.test.ts(x)` next to source                                                                              |
| E2E tests      | **Playwright**                                      | Minimal smoke suite (~3 specs); runs on CI only                                                                       |
| Git hooks      | **Husky** + **lint-staged**                         | `pre-commit` formats staged files; `pre-push` runs typecheck + unit tests                                             |

Everything runs on free tiers (Supabase Free + Vercel Hobby). Choices that would tip the project into a paid plan need explicit user approval.

## Why this stack

- **Next.js + Vercel** is the most well-trodden Server-Components + serverless deployment path. Maximum overlap with current Claude knowledge.
- **Supabase** provides Postgres + Auth + RLS in one product. Schema is versioned as SQL in the repo, so it's reviewable and reproducible.
- **shadcn/ui** components are checked into the repo (not hidden in `node_modules`), so they can be inspected and adapted directly.
- **TypeScript strict** catches most "vibe-coded" mistakes at compile time instead of in the browser.

Don't substitute pieces without discussion — they're chosen to fit each other.

## Project commands

- `npm run dev` — local dev server at http://localhost:3000
- `npm run build` — production build. Run before declaring risky changes done.
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run test` — Vitest unit tests, single run
- `npm run test:watch` — Vitest in watch mode
- `npm run test:e2e` — Playwright E2E suite. **CI only by default**; running locally needs `npx playwright install` once.
- `supabase start` / `supabase stop` — local Postgres in Docker
- `supabase migration new <name>` — create a new migration file (does not apply it)
- `supabase db push` — apply pending migrations to the **remote** DB. Destructive — ask first.
- `supabase db reset` — wipe the **local** DB and re-run migrations + seed. **User-only**, capital-letters confirmation.

If a command is missing from `package.json`, add it rather than running the underlying tool inline — keeps invocations consistent.

## Environments

There are exactly **two** environments. Don't invent a third.

| Environment    | Where                                                                                    | Database                                                                     | When to use                                                                                |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Local**      | http://localhost:3000 (Next.js dev) + http://127.0.0.1:54321 (local Supabase via Docker) | Local Postgres started by `supabase start` — disposable, can be reset freely | Day-to-day development. All exploratory work, all migration testing, all breaking changes. |
| **Production** | https://ttr-pfw.vercel.app + the cloud Supabase project                                  | The cloud Supabase project — real user data                                  | What the public (and the FLTT) sees. Only ever updated by merges to `master`.              |

**Vercel preview deploys** (auto-built per PR) hit the **production** Supabase to keep things simple — there's no separate "staging" DB. Implications:

- Schema migrations must be applied to prod **before** the merge to `master` finalises, or the preview / prod app will hit columns that don't exist. The migrations CI workflow handles this — see "Hosting + deployment" below.
- Admin-only writes from a preview deploy land in prod data. Treat preview deploys as **read-only QA surfaces** — don't run import scripts against them.

**Mental model for distinguishing**: if the URL is `localhost`, you're local. If it's `*.vercel.app` or a custom domain, you're touching prod. The Supabase URL in the active env tells you which DB you're talking to (`127.0.0.1` = local, `*.supabase.co` = prod).

## Environment variables

Two scopes, set independently for local and Vercel:

| Prefix          | Scope                                                                        | Examples                                                    |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_*` | Bundled into the browser bundle. **Public.**                                 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Unprefixed      | Server-only. Available in Server Components, Server Actions, Route Handlers. | `SUPABASE_SERVICE_ROLE_KEY`                                 |

Files:

- `.env.local` — local dev values. **Gitignored.** Never commit.
- `.env.example` — committed. Lists every required variable name with a placeholder value.
- Vercel project settings → Environment Variables — production + preview values.

**The Supabase service-role key bypasses RLS.** Never put it behind a `NEXT_PUBLIC_*` prefix and never import it from a Client Component. If you find yourself reaching for it client-side, the operation belongs in a Server Action.

When a new env var is added: update `.env.example` in the same change.

## File structure

| Path                   | Contents                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app/`                 | Routes. `page.tsx` = page, `layout.tsx` = layout, `route.ts` = API route handler, `loading.tsx` / `error.tsx` = boundaries |
| `app/admin/`           | Admin-only routes; layout/proxy enforces auth                                                                              |
| `components/`          | Feature components, grouped by area (e.g. `components/players/`, `components/import/`)                                     |
| `components/ui/`       | shadcn/ui primitives. Don't edit unless asked                                                                              |
| `lib/`                 | Non-React utilities — DB clients, parsers, formatters                                                                      |
| `lib/supabase/`        | Supabase client factories (`server.ts`, `browser.ts`, `proxy.ts`)                                                          |
| `supabase/migrations/` | Timestamp-prefixed SQL migration files (append-only)                                                                       |
| `supabase/seed.sql`    | Local-only seed data, applied after migrations on `supabase db reset`                                                      |
| `public/`              | Static assets                                                                                                              |
| `.env.example`         | Required env var names with placeholder values                                                                             |

Naming conventions:

- Components / pages: `PascalCase` (`PlayerTable.tsx`)
- Utilities / non-React modules: `camelCase` (`csvParser.ts`)
- Migration files: `<timestamp>_<snake_case_name>.sql`

## Migrations workflow

1. `supabase migration new <descriptive_name>` — creates an empty file under `supabase/migrations/`.
2. Write the SQL. Include `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` for any new table.
3. Test locally: `supabase db reset` (with user approval) re-runs migrations from scratch against the local DB.
4. Apply to remote with `supabase db push`, or push to `master` and let GitHub Actions handle it (if configured).

**Migrations are append-only.** Once applied to remote, never edit the file — Supabase has already recorded it as run. To change a schema, write a new migration that alters it.

## Hosting + deployment

- `git push` to a branch → Vercel creates a **preview** deployment, URL on the PR.
- `git push` (or merge) to `master` → Vercel deploys to **production** at https://ttr-pfw.vercel.app.
- DB migrations apply via a **GitHub Actions workflow** (`.github/workflows/migrations.yml`) on every push to `master` — runs `supabase db push` against prod with credentials stored as GitHub secrets. Never run `supabase db push` manually against prod.
- Schema changes and app changes can land in the same PR; migration workflow finishes before the app deploy lands.

## Testing

- **Unit tests (Vitest)** live next to the code under test: `lib/csv/parsePlayers.ts` → `lib/csv/parsePlayers.test.ts`. Component tests use `@testing-library/react` with `happy-dom`. Aim for comprehensive coverage of pure functions, parsers, validators, formatters, and server-action helpers. Don't test shadcn primitives or trivial pass-through components.
- **E2E tests (Playwright)** live in `e2e/` at the repo root. Kept deliberately small — three smoke specs:
  1. Home route returns 200 and renders the expected heading.
  2. A public read-only route loads.
  3. Visiting an admin route while signed-out redirects to `/login`.
- E2E runs **only on CI**, against the Vercel preview URL on PRs and the production URL after deploy. Not in pre-push, not in dev. The point is "site is online and not 500-ing", not feature regression.

## Git hooks (Husky)

Two hooks, installed automatically via `npm install` (Husky's `prepare` script):

- **`pre-commit`** → `lint-staged`. ESLint `--fix` and Prettier on staged files only. Fast (~1–2s). Auto-fixes most issues; blocks the commit if anything's still wrong.
- **`pre-push`** → `npm run typecheck && npm run test`. Blocks the push if types are broken or unit tests fail. ~15s. Does **not** run `build` or E2E — Vercel preview catches build errors; CI catches E2E regressions.

If a hook fails: fix the underlying issue. Never use `--no-verify` to bypass.

## CI (GitHub Actions)

Three workflows under `.github/workflows/`:

- **`ci.yml`** — runs on every PR and push to `master`. Steps: install, typecheck, lint, unit tests. Blocks merge if red.
- **`e2e.yml`** — runs on every PR after the Vercel preview is ready, and on push to `master` after the prod deploy lands. Runs the three Playwright smoke specs against the deployed URL.
- **`migrations.yml`** — runs on push to `master`. Applies pending Supabase migrations via `supabase db push`. Required for the prod app to find the schema it expects.

## Free-tier limits to design around

- **Supabase**: 500 MB Postgres, 5 GB egress/month, 50k MAU. Projects auto-pause after a week of inactivity — visit the URL or set up an uptime ping (e.g. UptimeRobot) if that's a problem.
- **Vercel Hobby**: 100 GB bandwidth/month, ~100k serverless function invocations/day, 10s function timeout.

Avoid patterns that scale badly:

- Per-row queries in a loop inside a Server Component or Route Handler. Collapse to one query or a Postgres function.
- Fan-out queries (`Promise.all` over many tables) in user-facing requests. Use a SQL view or RPC.
- Large unbounded `SELECT *` from a growing table without pagination.

If a feature genuinely needs more than the free tier supports, surface that to the user before implementing — don't quietly upgrade plans.
