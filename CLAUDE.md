# Table Tennis Rating Converter

## About

A web app that converts table tennis ratings between different countries' rating systems. The primary use case is helping the Luxembourg table tennis federation estimate equivalent Luxembourg ratings for foreign players, so they can be placed at the correct level for tournaments and leagues.

For example: a player with a German TTR of 1500 enters their rating, and the app shows the estimated equivalent in the Luxembourg rating system.

## Tech Stack

- **Framework:** Next.js with App Router (TypeScript/React)
- **Styling:** Tailwind CSS
- **Hosting:** Vercel (free Hobby tier)
- **Database:** None — conversion data is stored in JSON files or hardcoded formulae

## Rating Conversions

Rating mappings between countries are stored as JSON data files or conversion formulae within the codebase. There is no database. To add or update a country's rating conversion, edit the relevant data file directly.

## Key Features

- Select a source country/rating system
- Enter a rating value
- See the estimated equivalent Luxembourg rating
- Support for multiple countries' rating systems (e.g. Germany TTR, ITTF, etc.)

## Audience

This is a proof of concept for the Luxembourg table tennis federation. The primary user is Jeff himself, with the goal of demonstrating the tool's value to the federation.

## Deployed Application

- **Live URL:** https://ttr-pfw.vercel.app
- **Vercel project:** https://vercel.com/jvangos-projects/ttr-pfw
- **GitHub repo:** https://github.com/JVanGo/TTR-PFW
- **Hosting:** Vercel Hobby tier (free), auto-deploys on every push to `master`

## How to Work with Jeff

Jeff is not a developer. Keep the following in mind at all times:

### Communication

- Explain everything in plain, non-technical language. Avoid jargon like "component", "state", "props", "API", "endpoint", etc. without explaining what they mean in simple terms.
- When you make code changes, explain what you changed and why in everyday language. For example: "I updated the page so it now shows a dropdown menu where you can pick a country" rather than "I added a select component with an onChange handler that updates state".
- Include links to the live site or relevant documentation when helpful, so Jeff can see the results.

### Best Practices

- Follow current best practices for Next.js, React, and web development. Jeff won't know to ask for these, so apply them by default.
- Write clean, well-structured code even though Jeff won't be reading it — this keeps the project maintainable as it grows.
- Keep the app simple and focused. Don't over-engineer or add unnecessary complexity.

### Planning

For bigger changes (new features, redesigns, adding a new rating system), use Plan Mode to think through the approach before writing any code. Explain the plan to Jeff in plain language and confirm he's happy with the direction before implementing.

## Development Guidelines

### Project Setup

Jeff runs Windows and opens Claude Code from a **PowerShell** prompt. Claude Code's Bash tool runs commands in Git Bash (Unix-style paths like `/c/Users/...`), but when suggesting commands for Jeff to run himself in his terminal, use **PowerShell syntax** (e.g. `$env:PATH`, backslash paths, `gh.exe` not `gh`).

**Tool locations (these may not be on PATH in the current shell — use full paths):**
- GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe` (Git Bash: `/c/Program Files/GitHub CLI/gh.exe`)
- Node / npm / npx: `C:\Program Files\nodejs\` (Git Bash: `/c/Program Files/nodejs/`)
- GitHub account: JVanGo (authenticated via HTTPS)

**Install everything automatically.** Jeff should never need to install tools manually. If something isn't installed or isn't on PATH, find and fix it automatically. Only ask Jeff to run a command if it is truly impossible to do so automatically — for example, if it requires a browser login (like `gh auth login` or `vercel login`). In that case, explain what the command does and why you can't do it yourself.

When setting up a new project:

1. Check if Node.js is installed. If not, install it using `winget install OpenJS.NodeJS.LTS`.
2. Check if GitHub CLI is installed. If not, install it using `winget install GitHub.cli`. After install, use the full path `/c/Program Files/GitHub CLI/gh.exe` since the shell PATH won't be updated until restarted.
3. Scaffold the project with `npx create-next-app@latest --yes` which gives you App Router, TypeScript, Tailwind CSS, ESLint, and Turbopack out of the box.
4. **After scaffolding, immediately restore CLAUDE.md** — `create-next-app` generates its own CLAUDE.md that overwrites the project one. Restore from context or git history before proceeding.
5. Install any other dependencies as needed.

### Project Structure

```
app/
  layout.tsx          # Root layout — contains <html>, <body>, metadata, fonts
  page.tsx            # Home page (Server Component — renders the page shell)
  globals.css         # Tailwind imports and global styles
  error.tsx           # Graceful error page
  not-found.tsx       # Custom 404 page
components/           # UI components (interactive parts of the app)
lib/                  # Pure utility functions — conversion logic, data
data/                 # JSON files for rating mappings (if not using formulae)
public/               # Static assets (favicon, images)
```

Use the `@/` import alias for clean imports (e.g. `import { convert } from '@/lib/conversions'`).

### Server Components vs Client Components

Everything is a Server Component by default. Only add `'use client'` to components that need interactivity (user input, dropdowns, state changes). Keep these boundaries as small and deep in the tree as possible.

- `app/page.tsx` — Server Component. Renders the page heading and layout.
- `components/rating-converter.tsx` — Client Component (`'use client'`). The interactive form with inputs and conversion logic.

### Conversion Logic

Keep all rating conversion logic in `lib/` as pure functions, separate from React components. This keeps the code clean, testable, and easy to update.

### Code Style

- Use TypeScript strict mode. Avoid `any`.
- Use named exports.
- Group imports: React → Next.js → third-party → local (`@/*`).
- Use the `@/*` import alias for all local imports.
- PascalCase for components, camelCase for functions and variables.
- Prefer early returns for readability.
- Self-documenting code — only add comments to explain "why", not "what".

### Styling

Use Tailwind CSS utility classes for all styling. No CSS Modules or CSS-in-JS needed for a project this size.

### Fonts and Images

- Use `next/font` for typography (self-hosted, zero layout shift).
- Use `next/image` for any images (automatic optimisation and lazy loading).

### Metadata

Export a `metadata` object from `app/layout.tsx` for SEO and social sharing:

```tsx
export const metadata = {
  title: 'Table Tennis Rating Converter',
  description: 'Convert table tennis ratings between different countries\' rating systems',
}
```

### Saving and Publishing Changes

After making changes that are working, ask Jeff: **"Would you like to save this work?"**

If he says yes, commit and push for him automatically — write a clear commit message describing what changed, run `git add`, `git commit`, and `git push`. Don't ask him to run commands himself. Once pushed, let him know his live site will update within a minute or two.

## Helping Jeff Learn Claude Code

Jeff is new to Claude Code. Teach him how to use it effectively as you work together.

### Coaching on Prompts

When Jeff gives a vague or broad prompt, don't just do your best guess — help him learn to be more specific. Gently suggest a better way to phrase it. For example:

- If Jeff says "make it look better", ask what specifically he doesn't like — the colours, the spacing, the layout, the font? Then suggest: "Next time, you could say something like 'make the heading bigger and add more space between the sections'."
- If Jeff says "add ratings for France", ask him to provide the details — what's the French rating system called, what's the range, does he have a conversion formula or example values? Then suggest: "A great way to ask for this would be: 'Add France's rating system. It's called Classement and ranges from 500 to 2500. A Classement of 1500 is roughly equivalent to a Luxembourg rating of X.'"

Frame these suggestions as tips, not corrections. The goal is to help Jeff get better results over time.

### Introducing Useful Features

Introduce Claude Code features naturally when they'd be useful, rather than all at once. For example:

- When Jeff wants to undo something: "You can type `/undo` to reverse the last change I made."
- When Jeff is describing a big feature: "For something this big, let's switch to planning mode — I'll think through the approach first and we can agree on it before I start changing anything. You can activate this yourself by pressing Shift+Tab twice."
- When Jeff wants to see what changed: "You can type `/diff` to see exactly what I changed."
- When something isn't working after a few tries: "Let's start a fresh conversation. Sometimes it helps to describe the problem from scratch. You can do this by typing `/clear`."

### Encouraging Good Habits

- Remind Jeff to describe what he sees on screen when something looks wrong — "Can you tell me what you see? Is there an error message, or does it just not look right?"
- If Jeff seems frustrated, suggest taking a step back and describing what he wants the end result to look like, rather than trying to fix the current state.
- Praise specificity when Jeff gives a good, detailed prompt — reinforce what works.

## Common Pitfalls to Avoid

- **Overusing `'use client'`** — Don't add it to every file. Most pages and layouts should remain Server Components. Only the interactive parts (forms, inputs, dropdowns) need it.
- **Desktop-only design** — Always build mobile-first. Test at small screen sizes, not just desktop. Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) to adapt layouts for larger screens.
- **The prompt loop** — If a fix isn't working after two attempts, stop and try a different approach entirely. Don't keep asking for the same fix — it fills up context and makes things worse.
- **Not committing often enough** — Commit after every working change. One bad edit can undo a lot of progress if there's no save point to go back to.
- **Scaffolding overwrites CLAUDE.md** — `create-next-app` generates its own CLAUDE.md. After scaffolding, always restore the project CLAUDE.md from context or git history before proceeding.
- **PATH issues after winget installs** — winget-installed tools may not be on the current shell's PATH. Use the full binary path (e.g. `/c/Program Files/GitHub CLI/gh.exe`) until the shell is restarted.

## Expanding the App

The current version is a simple converter tool with no database or user accounts. If Jeff wants to add more advanced features in the future, here's how to grow the app.

### When You'd Need a Database

- Storing player profiles or match history
- Letting users save their conversions
- Admin features (e.g. the federation managing conversion tables via a UI instead of editing files)
- Any data that needs to persist between visits or be shared between users

### Recommended: Supabase (Free Tier)

Use [Supabase](https://supabase.com) as the database and auth provider. The free tier includes:

- **PostgreSQL database** (500 MB)
- **Built-in authentication** (email/password, social logins — up to 50,000 monthly active users)
- **Auto-generated REST API** (no need to write backend code)
- **File storage** (1 GB)
- **2 free projects**

This is more than enough for a proof of concept or small production app.

### Setting Up Supabase

1. Sign up at [supabase.com](https://supabase.com) using GitHub.
2. Create a new project and save the database password.
3. Find the **Project URL** and **Anon Key** in the project dashboard (Connect button or Settings > API Keys).
4. Install the client library: `npm install @supabase/supabase-js`.
5. Store the URL and key as environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Add these same variables in the Vercel dashboard under Project Settings > Environment Variables so the live site can access them.

### Supabase Best Practices

- **Always enable Row Level Security (RLS)** on every table. Without it, anyone with the anon key can read and write all data.
- **Never expose the `service_role` key** in client-side code. It bypasses all security. Only use it in server-side code if absolutely necessary.
- **Design the database schema before building UI.** Define what tables and columns you need first, then build the interface on top of that.
- **Use Supabase Auth** rather than building your own login system. It handles passwords, sessions, and security out of the box.

### When You'd Need Auth

- If different users need to see different data (e.g. "my saved conversions")
- If you need an admin area (e.g. federation staff managing rating tables)
- If you want to restrict access to certain features

Supabase Auth handles all of this. Users can sign up with email/password or via Google, GitHub, etc. Use Supabase's RLS policies to control what each user can see and do.

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
