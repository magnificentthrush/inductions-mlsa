# MLSA Induction System

Realtime web app for Microsoft Club GIKI inductions: queue manager board, panelist screen with
per-candidate chat and evaluations, projector display, admin results and a public results page.
Design: `docs/superpowers/specs/2026-09-25-induction-system-design.md`.

## Local development

Requirements: Node 24+, Docker (your user must be in the `docker` group).

```bash
npm install
npm run db:start        # first run downloads the Supabase images
npm run db:reset        # applies supabase/migrations
npm run seed:dev        # accounts admin, queue, panelist1-4 (password: induction-dev) + 60 fake candidates
npm run functions:serve # in a second terminal: serves the admin-users edge function
```

`npm run db:start` skips Studio and other services the app doesn't use, to save disk space.

## Web app

```bash
npm run web:env   # writes .env.local from the running local stack
npm run dev       # http://localhost:5173
```

Sign in as `queue` (queue manager) or `admin` with password `induction-dev`. The projector link is on the
admin page (`/admin` → Projector link); open it on the projector machine. It needs no login. Anyone with
the link can see the projector screen, so share it only with whoever runs the projector.

`npm run build` writes the static site to `dist/`. `npm run typecheck` checks the TypeScript.

## Tests

```bash
npm run db:test           # pgTAP: every action, RLS rule and privilege
npm run test:unit         # Vitest unit and component tests (web tests run in jsdom)
npm run test:integration  # needs db:start + functions:serve running
```

## Accounts

There is no signup. Create the first admin with
`npm run create-admin -- --username <u> --name "<Name>" --password <p>`
(for production, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` first). Admins create every
other account from the app.

## Data safety

Never commit the Google Forms CSV export: `*.csv` is gitignored except `fixtures/`.
