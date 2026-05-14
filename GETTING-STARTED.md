# Getting Started — Jeff's Setup Checklist

One-time setup to get from "Windows 11 with nothing installed" to "ready to build the site with Claude Code". Tick each one off in order.

## 1. Sign up for the three accounts (~10 min)

Do all three sign-ups first — then everything else can use them.

- [ ] **GitHub** — https://github.com/signup. Free. Use a memorable username; it'll be in URLs forever.
- [ ] **Vercel** — https://vercel.com/signup → click **"Continue with GitHub"**. Pick the free Hobby plan.
- [ ] **Supabase** — https://supabase.com/dashboard → click **"Continue with GitHub"**. Free tier is default.

Set up a password manager (Bitwarden, 1Password) if you don't have one. You'll be storing a few project secrets.

## 2. Install Node.js (~3 min)

The runtime that powers everything.

- [ ] Download the **LTS** version from https://nodejs.org/en/download
- [ ] Run the installer. Accept all defaults.
- [ ] Open a fresh **PowerShell** window and run `node --version` — should print something like `v22.x.x`.

## 3. Install Git for Windows (~3 min)

- [ ] Download from https://git-scm.com/download/win
- [ ] Run the installer. Accept all defaults (the defaults are sensible).
- [ ] In PowerShell, run:

  ```powershell
  git --version
  git config --global user.name "Jeff Lastname"
  git config --global user.email "jeff@example.com"
  ```

  Use the same email as your GitHub account.

## 4. Install Docker Desktop (~10 min)

Needed for running Supabase **locally** while you develop. Your local site needs a local database so you can experiment without touching the real one.

- [ ] Download from https://www.docker.com/products/docker-desktop
- [ ] Run the installer. It may ask you to enable WSL 2 — say yes.
- [ ] Restart your computer when prompted.
- [ ] Open Docker Desktop once after install so it finishes setting up.
- [ ] Leave it running in the background whenever you're developing.

## 5. Set up your first Supabase project (~5 min)

- [ ] In the Supabase dashboard, click **"New project"**.
- [ ] Name it (e.g. `lttf-grades`).
- [ ] Pick a **strong DB password** — save it in your password manager. You'll likely never type it again, but you can't recover it.
- [ ] Region: **Frankfurt** (`eu-central-1`) — closest to Luxembourg.
- [ ] Click Create. The project takes ~2 minutes to provision.
- [ ] Once ready, go to **Settings → API**. Keep this tab open — Claude will ask you for the **Project URL** and the **anon public** key when wiring things up.

## 6. Verify everything works (~2 min)

- [ ] Make a folder for your project (e.g. `C:\Users\jeff\Projects\lttf-grades`).
- [ ] In PowerShell, `cd` into that folder.
- [ ] Drop in the `TECH-STACK.md`, `CODING-INSTRUCTIONS.md`, and your `CLAUDE.md` files.
- [ ] Run `claude` to start Claude Code.
- [ ] Ask Claude: *"Read TECH-STACK.md, CODING-INSTRUCTIONS.md, and CLAUDE.md, then scaffold the Next.js project."*

That's it — you're up and running.

---

## Your local site vs the real site

You'll be working in two worlds. Knowing which is which prevents most "oh no" moments.

| | Your local site | The real site (production) |
|---|---|---|
| **URL** | http://localhost:3000 | The `*.vercel.app` URL (and eventually your custom domain) |
| **Database** | Local Postgres running in Docker | The Supabase project in the cloud |
| **Who sees it** | Only you, on your computer | The LTTF and anyone with the link |
| **Safe to break?** | Yes — `supabase db reset` wipes and rebuilds | **No** — real data lives here |
| **How to start it** | `npm run dev` (Claude will do this for you) | Always running. Vercel rebuilds it whenever code is pushed to GitHub. |

**The workflow**: Claude builds and tests features against your local site → when it works, commits and pushes → Vercel rebuilds the real site automatically. You should review changes on your local site (or on the **preview URL** that Vercel posts to the PR) before they land on the real site.

If you ever see Claude about to write data to a URL ending in `.supabase.co`, stop and ask — that's the real database.

## Things you'll be glad to know later

- **Treat `.env.local` as a secret.** It holds your Supabase keys. Never commit it, never paste it into a chat outside Claude Code, never share screenshots of it.
- **Vercel auto-deploys.** Every time Claude pushes a change to GitHub, Vercel rebuilds the real site. Watch the dashboard at https://vercel.com/dashboard.
- **Preview URLs**: every Pull Request gets its own deployed preview link. Open it and click around before merging.
- **Free-tier projects pause after a week of inactivity.** If the site goes quiet over the holidays, you may need to log in and "unpause" Supabase. Setting up a free UptimeRobot ping (https://uptimerobot.com) prevents this.
- **If something breaks**, the first thing Claude needs is the exact error message — copy it from the terminal verbatim rather than describing it.
- **Commit often.** Ask Claude to commit after each working change. If something later goes wrong, you can always roll back to a known-good state.

## Common first-day snags

- **`npm` "not recognised"** in PowerShell → close and reopen the PowerShell window after installing Node.js. PATH changes only apply to new shells.
- **Git asks for credentials repeatedly** → install **Git Credential Manager** (usually bundled with Git for Windows; if not, https://github.com/git-ecosystem/git-credential-manager).
- **Supabase CLI errors with `docker not running`** → open Docker Desktop and wait for the whale icon to stop animating before trying again.
- **Script execution blocked** → if PowerShell complains about scripts being disabled, run (once):

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

  Type `Y` to confirm.
