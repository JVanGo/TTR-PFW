# Coding Instructions

How to write and modify code in this project. Read alongside `TECH-STACK.md`.

## Critical rules

These override default behaviour. Follow them exactly.

- **Never edit a migration file under `supabase/migrations/` that has already been applied.** Supabase tracks applied migrations; edits do nothing in production. Create a new migration file.
- **Never run `supabase db reset` without explicit user approval in capital letters.** It wipes the local DB.
- **Never run `supabase db push` against the remote DB manually.** Migrations apply to prod via the CI workflow on push to `main`. Local development uses `supabase db reset` / `supabase migration up` against the local Docker DB only.
- **Never write directly to the production database.** All writes during development happen against the **local** Supabase (`127.0.0.1:54321`). If a task seems to require touching prod data, stop and ask.
- **Never commit secrets.** `.env.local` is gitignored. If you see an API key in a tracked file, stop and flag it.
- **Always fix root causes**, not symptoms. If a date renders wrong, find why the data is wrong rather than patching the format.
- **If you can't fix something properly, ask.** Don't implement workarounds without flagging them.
- **Don't bypass safety checks** (`--no-verify`, `// eslint-disable-next-line`, `@ts-ignore`, `as any`) to silence a failure. Fix the underlying issue, or ask if it can't be fixed.

## Environment awareness

Before any work, know which DB you're connected to. Check the `NEXT_PUBLIC_SUPABASE_URL` in the active env:

| Value contains | Environment | Safe to break? |
|---|---|---|
| `127.0.0.1` or `localhost` | Local (Docker Supabase) | Yes — disposable, `supabase db reset` rebuilds it |
| `*.supabase.co` | Production cloud Supabase | **No** — real data |

All day-to-day development happens against local Supabase. If `npm run dev` ever connects to a cloud URL, stop and ask — `.env.local` is probably misconfigured.

## TypeScript

- Strict mode is on. Lint errors block merge.
- Prefer `unknown` over `any` and narrow with type guards:

  ```ts
  if (value && typeof value === "object" && "id" in value) { ... }
  ```

  Optional chaining (`obj?.field`) does not narrow `unknown` — it's fine for UI state, not for type discrimination.

- If `any` is genuinely unavoidable, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a one-line reason on the next line.
- Define explicit `interface Props` for components. No `React.FC`, no inline prop types in the signature.
- When you add a value to a union or a registry, update **every** consumer (rendering, validation, DB constraint, types) in the same change. Drift between unions and call sites is the most common bug class in this kind of app.

## Next.js — App Router

- **Server Components by default.** Add `"use client"` only when a component needs `useState`/`useEffect`, browser APIs, or event handlers.
- Fetch data in Server Components or Route Handlers. Don't fetch in Client Components if a Server Component parent can pass the data down as props.
- Use **Server Actions** for form submissions and mutations. Don't build `fetch('/api/...')` round-trips when a Server Action does the job.
- Auth-protected pages: check the session in the Server Component, layout, or middleware. **Redirect to `/login` if absent.** Never rely on Client Component gates as the only protection.
- Use `loading.tsx` and `error.tsx` boundaries instead of ad-hoc `Suspense` / `try-catch` in every route.

## Supabase

- Use a **server client** (cookies-aware) in Server Components, layouts, Server Actions, and Route Handlers.
- Use a **browser client** only in Client Components that need realtime subscriptions or interactive auth flows.
- The **service-role key** may only be used in Server Actions or Route Handlers performing trusted operations (e.g. admin imports). Never in code reachable from a Client Component.
- All database access goes through `@supabase/supabase-js`. Don't add `pg`, Prisma, Drizzle, or raw connection strings.

## Row Level Security (RLS)

**RLS is the real security boundary. UI checks are for UX only — a hidden button is not security.**

- Every table needs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and at least one policy.
- Default deny: with RLS on and no matching policy, the operation fails. That's the safe default — don't disable RLS to "make things work."
- Public-read pattern: `CREATE POLICY "public read" ON foo FOR SELECT USING (true);`
- Authenticated-write is **not enough** for admin features — any signed-up user passes `auth.uid() IS NOT NULL`. Gate admin writes on a role/membership check, e.g. a `user_roles` table joined in the policy.
- Before merging a migration that touches RLS, mentally walk a request through each role (anon, authenticated, admin) and confirm only the intended ones succeed.

## Migrations

- One change per migration file. Descriptive name: `20260513120000_add_players_table.sql`.
- Use `supabase migration new <name>` so the timestamp prefix is correct.
- Every new table includes:
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
  - `CREATE POLICY` statements for every access pattern the table needs.
  - Indexes on foreign keys and any column that will appear in `WHERE` / `ORDER BY` on hot paths.
- Every RPC function includes `GRANT EXECUTE ON FUNCTION ... TO authenticated;` (or `service_role` for admin-only).
- Avoid PL/pgSQL variable names that shadow column names — rename the variable (e.g. `v_player_id` instead of `player_id`).

## Components

- One component per file. PascalCase filename matches the default export.
- Co-locate feature components under `components/<feature>/`. Reusable primitives live in `components/ui/` (shadcn — leave them alone unless asked).
- Compose pages from small components rather than writing 500-line `page.tsx` walls — single responsibility per component.
- Reach for shadcn/ui before adding a new dependency. If shadcn doesn't have it, ask before installing.

## Forms and mutations

- Use Server Actions for form submission. Validate input on the server — never trust the client.
- Return `{ success: true }` or `{ error, fieldErrors }` from Server Actions in a consistent shape.
- For file uploads (CSV, etc.), parse server-side and show a preview with errors highlighted before committing the data to the database.
- Idempotency for imports: re-uploading the same file should not create duplicates. Use a deterministic key (file hash, content-based id) when feasible.

## Imports

Use the configured path alias (`@/...`):

```ts
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
```

No relative walks above the current directory (`../../`).

## Error handling

- Server Components / Server Actions: **throw on unexpected errors** and let the framework's `error.tsx` boundary handle them. Return structured `{ error }` only for *expected* validation/business failures.
- Don't `try/catch` to log-and-swallow. Either handle the error meaningfully (recover, retry, fallback) or let it propagate.
- Log server errors with `console.error("event.name", { context }, err)`. If a structured logger is added later, swap to it everywhere.

## Testing

See `TECH-STACK.md` for the tooling overview. The rules here are about *what* and *when* to test.

### Unit tests (Vitest)

- Co-locate as `*.test.ts(x)` next to the source file.
- **Always test**: pure functions (parsers, formatters, validators), CSV/import logic, business rules, server-action helpers extracted from the action itself.
- **Don't test**: shadcn primitives, layout/wrapper components with no logic, presentational components that just render props.
- Use `@testing-library/react` for components with behaviour. Query by accessible role/text, not by class or test-id (except where there's no semantic alternative).
- Mock at the **module boundary** (the Supabase client, `fetch`), not internal functions.
- Any new pure function (parser, validator, formatter) ships with a unit test in the same change.
- Any bug fix in non-trivial logic ships with a failing-then-passing test as a regression net.

### E2E tests (Playwright)

E2E is deliberately tiny — three smoke specs. Don't expand it without discussion.

- The point is "is the deployed site online and rendering the expected shape" — not feature regression. Feature regression is the unit suite's job.
- Don't add E2E specs for new features by default. Add a unit test instead.
- If you're tempted to write a fourth E2E spec, ask first. There's usually a unit test that gives the same confidence faster.

### Before declaring work done

- Run `npm run typecheck` and `npm run test`. Both green.
- For UI changes: run `npm run dev` and open the page in a browser. Click the happy path and one adjacent page. Type checks don't verify feature correctness.
- For schema changes: `supabase migration up` against local, then `SELECT` against the affected tables to confirm shape and RLS.

## Comments

- Code says **what**; comments say **why**, and only when the *why* isn't obvious from the code.
- No commented-out blocks. No `// TODO: remove once X` for work already done. No references to the current task or PR ("added for the CSV flow", "fixes issue #123") — those belong in the commit message.
- JSDoc on exported helpers and non-trivial types.

## Commits

- One feature or fix per commit. Don't bundle unrelated changes.
- Format: `area: short description`, e.g. `import: parse new TTR column`, `auth: redirect to /login when session missing`.
- One-line title, optional short body explaining *why*.
- Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

## Asking before acting

Default posture: do as much as you can autonomously. User intervention is needed only for things that are unsafe or are product-judgement calls.

### Non-destructive (proceed without asking)

- Reading and searching files (any read-only file operation).
- Git: `add`, `status`, `diff`, `log`. `push` to a feature branch is fine.
- npm: `install`, `run build/test/lint/dev/typecheck`.
- Starting the dev server (`npm run dev`) — run in background for long-lived processes.
- Running unit tests (`npm run test`).
- `supabase start` / `supabase stop` / `supabase migration up` — managing the **local** Docker DB.
- Database **reads** against the local Supabase (`SELECT` queries via the Supabase MCP or any SQL client).
- Database **writes** against the **local** Supabase when testing import logic / seeding.
- Editing markdown files anywhere.
- `supabase migration new` (creates a file; doesn't apply it).

### Destructive (ask first)

- Git **commits** and merges to `main`.
- `git push` to `main`.
- Database writes against **production** Supabase (`*.supabase.co`) by any route.
- Adding a new dependency to `package.json`.
- Running E2E tests locally (downloads Playwright browsers, ~200 MB).
- Changes to `vercel.json`, `next.config.ts`, `.github/workflows/`, or any CI/build configuration.
- Force-pushes, branch deletes, `git reset --hard`.

### User-only

- `supabase db reset` — wipes local DB. User must confirm in capital letters.
- `supabase db push` against the production project — migrations apply via CI only.
- `git push --force` to `main`.
- Any CLI operation against the production Supabase project or Vercel production environment.
- Adding or rotating secrets.

If the user's request is ambiguous about scope ("clean up the imports", "tidy the page"), ask what they want changed before editing.

## Verifying changes

- For **UI work**: start the dev server and open the page in a browser before declaring it done. Click through the happy path *and* one adjacent page to spot regressions. Type checks and lint verify code correctness, not feature correctness — if you can't open the page, say so explicitly rather than claiming success.
- For **schema changes**: after applying the migration locally, run a `SELECT` against the affected tables to confirm shape, constraints, and RLS behaviour match expectations.
- For **logic changes**: a unit test must accompany the change. `npm run test` passes locally before push.
- Git hooks gate the rest — `pre-commit` formats, `pre-push` runs typecheck + unit tests, CI runs the full suite incl. Playwright smoke. If a hook fails, fix the issue; don't bypass.

## Updating these docs

When you discover a new convention worth enforcing, a recurring gotcha, or a rule the user just gave you, propose an edit to this file or `TECH-STACK.md` rather than memorising it in your head. These files are the project's shared memory.
