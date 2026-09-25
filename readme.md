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

Supabase Studio: http://127.0.0.1:54323

## Tests

```bash
npm run db:test           # pgTAP: every action, RLS rule and privilege
npm run test:unit         # Vitest unit tests
npm run test:integration  # needs db:start + functions:serve running
```

## Accounts

There is no signup. Create the first admin with
`npm run create-admin -- --username <u> --name "<Name>" --password <p>`
(for production, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` first). Admins create every
other account from the app.

## Data safety

Never commit the Google Forms CSV export: `*.csv` is gitignored except `fixtures/`.
