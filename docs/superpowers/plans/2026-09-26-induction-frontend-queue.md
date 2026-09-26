# Induction System — Plan 2 of 3: Frontend Foundation, Queue Manager and Projector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React app's foundation (login, role routing, clock sync, live snapshots, CSV reading) and the two screens induction day depends on most: the queue manager's `/queue` board and the projector's `/display`, both running against the Plan 1 backend.

**Architecture:** A static React + TypeScript app built with Vite. Every screen reads through one typed API object (`src/lib/api.ts`) that wraps the Plan 1 database functions. Each screen loads a snapshot and reloads it when its realtime topic subscribes or delivers an event (`useLiveSnapshot`), so there is no global state library. Components get their Supabase-backed pieces from providers, so tests pass fakes: an `Api` and an `AuthBackend`.

**Tech Stack:** React 19.3, React Router 8.4, Vite 8.3 with `@vitejs/plugin-react` 6 and `@tailwindcss/vite` 4.3, Tailwind CSS 4.3, TypeScript 7.0, PapaParse 5.7, `@supabase/supabase-js` 2.117, Vitest 5 with jsdom 30 and Testing Library (React 16, user-event 14, jest-dom 7).

**Spec:** `docs/superpowers/specs/2026-09-25-induction-system-design.md` (§3 architecture, §4 roles, §7 CSV, §8 realtime, §9 `/login`, `/queue`, `/display`, §11 errors, §12 testing). The Plan 1 backend is merged (`supabase/migrations/*`); this plan calls its functions and never changes them.

**Roadmap:**
1. Backend (done, PR #1).
2. **Frontend foundation, Queue Manager, Projector** (this plan).
3. Panelist screen, full Admin, Results, public `/selected` page, Playwright E2E, and the Cloudflare/Supabase deployment guide.

## Global Constraints

- Frontend stack (spec §3): React + TypeScript + Vite, React Router, Tailwind CSS, `@supabase/supabase-js`, PapaParse. "There is no global state library. Each screen loads a snapshot and reloads it when a realtime event arrives."
- Hosting must stay $0: a static build for Cloudflare Pages (deployed in Plan 3). The browser only ever has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the service-role key never reaches the frontend.
- Candidates never log in. The projector has no login: the secret `display_key` in its URL is the protection.
- Logins: people type a username; `usernameToEmail()` from `supabase/functions/_shared/accounts.ts` turns it into `<username>@users.induction.local`.
- After login (spec §9): queue manager → `/queue`, panelist → `/panel`, admin → `/admin`. Routes are guarded by role, and an admin can open every screen.
- Timer (spec §8): every screen computes `elapsed = (clientNow + clockOffset) − started_at` locally once a second. `clockOffset` comes from `server_now()` as `offset = server time + RTT/2 − client time` and is re-synced every 5 minutes. The timer turns amber after `target_interview_minutes`.
- Resilience (spec §8): when a channel (re)subscribes, the screen reloads its full snapshot. Staff screens show a "Reconnecting…" banner while disconnected. The projector reloads every 30 seconds, keeps showing the last state with its timer running while disconnected, and shows a small status dot. It never shows an error page (§11).
- Errors (spec §11): an action's short database message is shown as a toast and the board reloads. Action buttons are disabled while their request runs, so a double click does nothing.
- CSV (spec §7): parse in the browser; check the 51 header cells after trimming and collapsing whitespace; on a mismatch stop and show which columns differ; timestamps are `M/D/YYYY H:MM:SS` in Asia/Karachi (+05:00, no daylight saving); send every row in one `import_candidates` call; show `{added, updated, flagged}`.
- `*.csv` is gitignored except `fixtures/`. The real Google Forms export in the repo root is never committed, read or printed beyond its header row. `fixtures/form-export-fake.csv` (committed with this plan) copies the real header row exactly, and every row in it is fake.
- **Decided deviation from spec §8:** the projector treats each `display:<key>` broadcast as a signal and re-reads `display_snapshot(key)` instead of rendering the payload. Public channels accept messages from any client that knows the key, so rendering payloads would let anyone with the link put fake names on the projector (Plan 1 final review, finding 4).
- **Decided (spec silent):** "Back to pool" puts the candidate at the **top** of the pool, since they were already next in line. "Line up for ▾" adds them to the end of that panel's lane. Undo check-in and deleting a panel ask for confirmation first; every other action is one click.
- **Decided (roadmap):** `/panel` and the full `/admin` are Plan 3. This plan ships a "coming in the next update" page for `/panel` and an `/admin` page with the projector link (copy/open) and a link to `/queue`.
- Local development: `npm run web:env` writes `.env.local` from the running stack; `npm run dev` serves on http://localhost:5173. The dev logins are `admin`, `queue` and `panelist1`–`panelist4`, all with password `induction-dev`, from `npm run seed:dev`.
- Tests: Vitest. Component tests start with the `// @vitest-environment jsdom` docblock; everything else runs in Node. The fixture CSV is imported with Vite's `?raw` suffix, so no Node types are needed. `tests/unit/web/helpers.tsx` provides `fakeApi()`, `fakeAuth()` and `renderApp()`.
- The disk on the development machine is nearly full: add no dependencies beyond those listed in Task 1, and pull no Docker images.

## Review Focus

The inputs and failure modes the spec implies that are most likely to hurt someone on induction day. Each one is pinned by a test in the task that owns the code:

1. **The venue Wi-Fi drops for a few seconds.** The board shows "Reconnecting…", keeps its last state, and reloads the full snapshot when the channel subscribes again, so no missed event is lost. The projector keeps its tiles and running timers and shows an amber dot. Pinned in Task 4 (`useLiveSnapshot`: reloads on resubscribe, keeps data when a reload fails) and Tasks 8 and 9 (banner, status dot, no error text).
2. **A double click, or two quick clicks on different buttons.** Each action runs once, and the button is disabled until it finishes. A conflict ("Panel 2 is busy") shows the database's message and reloads the board. Pinned in Task 4 (`ActionButton`) and Task 8 (toast on failure).
3. **An account disabled while its tab is open.** The next read or action that returns "Not allowed" re-checks the account, signs it out, and the login page says why. Pinned in Task 5 (`AuthProvider` re-check) and Task 8 (the queue board end to end).
4. **A CSV that is not exactly the Fall 2026 form.** This covers an edited or renamed header, a missing column, a byte-order mark, LF line endings, a row with the wrong number of cells, a multi-line answer with commas and quotes, and an unreadable timestamp. The import stops (or warns, for timestamps) before anything is sent. Pinned in Task 2 and Task 7.
5. **Names in Urdu script, with apostrophes and dashes, and reg numbers typed with spaces or lower case.** Names pass through byte for byte, render correctly next to their number (`<bdi>`), and search finds them. Pinned in Task 2 (parser), Task 3 (round trip through the real database) and Task 6 (search).

---

### Task 1: Toolchain, environment and app skeleton

**Files:**
- Modify: `package.json` (dependencies and scripts), `vitest.config.ts`, `.gitignore`
- Create: `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `scripts/write-web-env.ts`, `tests/setup.ts`, `src/index.css`, `src/main.tsx`, `src/lib/env.ts`, `src/lib/supabase.ts`, `src/lib/types.ts`
- Test: `tests/unit/web/env.test.ts`

**Interfaces:**
- Consumes: `localEnv()` from `scripts/lib/local-env.ts` (Plan 1): `{ url, anonKey, serviceKey }`.
- Produces:
  - `readEnv(source: Record<string, unknown>): { supabaseUrl: string; supabaseAnonKey: string }`
  - `supabase` (a `SupabaseClient`) from `src/lib/supabase.ts`
  - Every shared type in `src/lib/types.ts`: `Role`, `CandidateStatus`, `Profile`, `LaneEntry`, `CurrentInterview`, `LastEnded`, `BoardPanel`, `BoardSnapshot`, `DisplayPerson`, `DisplayPanel`, `DisplaySnapshot`, `CandidateSummary`, `AnswerSection`, `Answer`, `ImportRow`, `ImportFlag`, `ImportResult`
  - npm scripts `dev`, `build`, `preview`, `typecheck` and `web:env`

- [ ] **Step 1: Install the frontend dependencies**

```bash
npm install react@^19.3.0 react-dom@^19.3.0 react-router@^8.4.0 papaparse@^5.7.0
npm install -D vite@^8.3.1 @vitejs/plugin-react@^6.1.1 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 \
  typescript@^7.0.2 @types/react@^19.3.0 @types/react-dom@^19.3.0 @types/papaparse@^5.5.2 \
  @testing-library/react@^16.3.3 @testing-library/user-event@^14.6.7 @testing-library/jest-dom@^7.0.1 jsdom@^30.1.1
```

Expected: both commands end with `found 0 vulnerabilities`.

- [ ] **Step 2: Add the scripts**

Add these entries to `"scripts"` in `package.json`, keeping the existing ones:

```json
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json",
    "web:env": "node scripts/write-web-env.ts",
```

- [ ] **Step 3: Write the TypeScript, Vite and Vitest configuration**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "@testing-library/jest-dom/vitest"]
  },
  "include": ["src", "tests/setup.ts", "tests/unit/web", "vite.config.ts", "vitest.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // One small app for ~25 staff screens and a projector: ~170 KB gzipped, mostly React and supabase-js.
    chunkSizeWarningLimit: 800,
  },
});
```

Replace `vitest.config.ts` (component tests need the React plugin and `.tsx` files; the existing timeouts and serial files stay for the integration tests):

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
```

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
```

Append to `.gitignore`:

```
dist/
```

- [ ] **Step 4: Write the failing test for `readEnv`**

`tests/unit/web/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readEnv } from '../../../src/lib/env.ts';

describe('readEnv', () => {
  it('returns the trimmed Supabase settings', () => {
    expect(readEnv({ VITE_SUPABASE_URL: ' http://127.0.0.1:54321 ', VITE_SUPABASE_ANON_KEY: 'anon' }))
      .toEqual({ supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'anon' });
  });

  it('names every missing setting and how to fix it', () => {
    expect(() => readEnv({})).toThrow(
      'Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. For local development run: npm run web:env',
    );
    expect(() => readEnv({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: '   ' }))
      .toThrow('Missing VITE_SUPABASE_ANON_KEY.');
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npx vitest run tests/unit/web/env.test.ts`
Expected: FAIL. Vitest cannot resolve `../../../src/lib/env.ts` because the file doesn't exist yet.

- [ ] **Step 6: Write the environment, client, types and page skeleton**

`src/lib/env.ts`:

```ts
export interface WebEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Reads the Supabase settings Vite injects from .env.local (development) or the host (production). */
export function readEnv(source: Record<string, unknown>): WebEnv {
  const read = (name: string) => (typeof source[name] === 'string' ? source[name].trim() : '');
  const supabaseUrl = read('VITE_SUPABASE_URL');
  const supabaseAnonKey = read('VITE_SUPABASE_ANON_KEY');
  const missing = [
    supabaseUrl ? null : 'VITE_SUPABASE_URL',
    supabaseAnonKey ? null : 'VITE_SUPABASE_ANON_KEY',
  ].filter((name) => name !== null);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(' and ')}. For local development run: npm run web:env`);
  }
  return { supabaseUrl, supabaseAnonKey };
}
```

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { readEnv } from './env.ts';

const env = readEnv(import.meta.env);

/** The one browser client. Staff sessions persist in localStorage; the projector never signs in. */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
```

`src/lib/types.ts`. These shapes are what the Plan 1 functions return; Task 3's integration test checks them against the real database.

```ts
// Shapes of what the database functions return (see supabase/migrations). Kept by hand: every
// screen reads through src/lib/api.ts, and tests/integration/web-api.test.ts checks these shapes
// against the real functions.

export type Role = 'admin' | 'queue_manager' | 'panelist';
export type CandidateStatus = 'registered' | 'waiting' | 'interviewing' | 'interviewed';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  current_panel_id: string | null;
}

/** One person in the waiting pool or in a panel's lane (board_snapshot → lane_json). */
export interface LaneEntry {
  candidate_id: string;
  number: number;
  name: string;
  reg_number: string;
  position: number;
  skip_count: number;
  checked_in_at: string | null;
}

export interface CurrentInterview {
  interview_id: string;
  candidate_id: string;
  number: number;
  name: string;
  reg_number: string;
  started_at: string;
}

export interface LastEnded {
  interview_id: string;
  candidate_id: string;
  number: number;
  name: string;
  ended_at: string;
}

export interface BoardPanel {
  id: string;
  name: string;
  is_default: boolean;
  current: CurrentInterview | null;
  /** The interview "Reopen" applies to; null while the panel is busy or has had no interview. */
  last_ended: LastEnded | null;
  lane: LaneEntry[];
  panelists: { id: string; display_name: string }[];
}

export interface BoardSnapshot {
  induction: { id: string; name: string; target_interview_minutes: number; results_published: boolean };
  server_time: string;
  counts: Record<CandidateStatus, number>;
  panels: BoardPanel[];
  pool: LaneEntry[];
}

export interface DisplayPerson {
  number: number;
  name: string;
}

export interface DisplayPanel {
  id: string;
  name: string;
  current: (DisplayPerson & { started_at: string }) | null;
  /** Up to 3 people lined up for this panel. */
  lined_up: DisplayPerson[];
}

export interface DisplaySnapshot {
  induction_name: string;
  target_interview_minutes: number;
  server_time: string;
  panels: DisplayPanel[];
  /** The first 8 people in the waiting pool. */
  waiting: DisplayPerson[];
}

export interface CandidateSummary {
  id: string;
  number: number;
  full_name: string;
  reg_number: string;
  status: CandidateStatus;
}

export type AnswerSection = 'general' | 'dev' | 'logikal' | 'lnd' | 'marketing';

export interface Answer {
  q: string;
  a: string;
}

/** One form response, as import_candidates(p_rows) expects it. */
export interface ImportRow {
  /** ISO 8601 with offset, or null when the timestamp couldn't be read (the server then uses now()). */
  submitted_at: string | null;
  reg_number: string;
  full_name: string;
  email: string;
  account_email: string;
  phone: string;
  department: string;
  batch: string;
  /** Team preferences 1–4 in rank order; '' when a rank was left blank. */
  preferences: string[];
  answers: Record<AnswerSection, Answer[]>;
}

export interface ImportFlag {
  reg_number: string;
  name: string;
  reason: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  flagged: ImportFlag[];
}
```

`index.html` (the inline icon avoids a `/favicon.ico` 404 in the console):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%276%27 fill=%27%230067b8%27/%3E%3Ctext x=%2716%27 y=%2722%27 font-size=%2716%27 font-family=%27Segoe UI,sans-serif%27 font-weight=%27700%27 text-anchor=%27middle%27 fill=%27white%27%3EM%3C/text%3E%3C/svg%3E" />
    <title>MLSA Induction</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import "tailwindcss";

@theme {
  --font-sans: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Noto Sans", "Noto Nastaliq Urdu", sans-serif;
  --color-brand-50: oklch(0.97 0.02 250);
  --color-brand-100: oklch(0.93 0.04 250);
  --color-brand-600: oklch(0.52 0.16 252);
  --color-brand-700: oklch(0.45 0.15 252);
}

@layer base {
  body {
    @apply bg-slate-50 text-slate-900 antialiased;
  }
  button:not(:disabled) {
    cursor: pointer;
  }
}
```

`src/main.tsx` (a placeholder until Task 5 adds the router):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Replaced in Task 5 by the router and providers.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p className="p-6 text-lg">MLSA Induction</p>
  </StrictMode>,
);
```

`.env.example`:

```bash
# Copy to .env.local, or run `npm run web:env` while the local Supabase stack is running.
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY from `npx supabase status`>
```

`scripts/write-web-env.ts`:

```ts
// Writes .env.local for the Vite dev server from the running local Supabase stack.
import { writeFileSync } from 'node:fs';
import { localEnv } from './lib/local-env.ts';

const env = localEnv();
writeFileSync('.env.local', `VITE_SUPABASE_URL=${env.url}\nVITE_SUPABASE_ANON_KEY=${env.anonKey}\n`);
console.log(`Wrote .env.local for ${env.url}`);
```

- [ ] **Step 7: Run the tests, typecheck, build and write the local env file**

Run: `npm run test:unit && npm run typecheck && npm run build && npm run web:env`
Expected:
- Vitest: `Test Files  3 passed (3)` and `Tests  17 passed (17)` (15 existing, plus 2).
- `tsc` prints nothing.
- The build ends with `✓ built in …`.
- `Wrote .env.local for http://127.0.0.1:54321`.

(`.env.local` is gitignored by the existing `.env.*` rule.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts .gitignore index.html .env.example \
  scripts/write-web-env.ts tests/setup.ts tests/unit/web/env.test.ts src/index.css src/main.tsx src/lib/env.ts \
  src/lib/supabase.ts src/lib/types.ts
git commit -m "chore(web): Vite, React, Tailwind and Vitest setup with typed backend shapes"
```

---

### Task 2: Reading the Google Forms CSV in the browser

**Files:**
- Create: `src/csv/formLayout.ts`, `src/csv/parseFormExport.ts`
- Test: `tests/unit/web/parseFormExport.test.ts`
- Uses (already committed with this plan): `fixtures/form-export-fake.csv`

**Interfaces:**
- Consumes: `ImportRow`, `AnswerSection` from `src/lib/types.ts` (Task 1).
- Produces:
  - `FORM_LAYOUT: FormLayout`, and the types `FormLayout`, `FormColumn`, `ColumnTarget`, `CandidateField`
  - `parseFormExport(text: string, layout?: FormLayout): ParseResult`, where `ParseResult = { ok: true; rows: ImportRow[]; warnings: string[] } | { ok: false; error: string; mismatches: HeaderMismatch[] }`
  - `HeaderMismatch = { column: number /* 1-based */; expected: string; found: string }`
  - `parseSheetsTimestamp(text: string, utcOffset: string): string | null`
  - `normalizeHeader(text: string): string`

About the fixture: its header row is copied byte for byte from the real Fall 2026 export (CRLF records, with line breaks inside some quoted header cells). Its five rows are fake:

| Row | Candidate | Reg number | Why it's there |
|---|---|---|---|
| 1 | Ali Raza | `2099101` | Fills every general and Dev question |
| 2 | عائشہ خان | `' 2099 102 '` | Multi-line answer with a comma and quotes; Urdu answer in column 51 |
| 3 | Zara O'Brien-Khan | `2099103` | Marketing answers only |
| 4 | Ali Raza again | `2099101` | Later timestamp and a new phone number (duplicate submission) |
| 5 | No Reg Person | (empty) | Missing registration number |

The `2099…` reg numbers stay clear of the dev seed's `2025101–2025160`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/web/parseFormExport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/form-export-fake.csv?raw';
import { FORM_LAYOUT } from '../../../src/csv/formLayout.ts';
import { parseFormExport, parseSheetsTimestamp } from '../../../src/csv/parseFormExport.ts';

/** The fake export with one header cell renamed. */
function renameHeader(from: string, to: string): string {
  return fixture.replace(`,${from},`, `,${to},`);
}

function ok(text: string) {
  const result = parseFormExport(text);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe('parseSheetsTimestamp', () => {
  it('reads Google Sheets timestamps as Asia/Karachi time', () => {
    expect(parseSheetsTimestamp('9/25/2026 20:47:58', '+05:00')).toBe('2026-09-25T20:47:58+05:00');
    expect(parseSheetsTimestamp('12/1/2026 7:05:09', '+05:00')).toBe('2026-12-01T07:05:09+05:00');
    expect(parseSheetsTimestamp(' 9/25/2026 8:05 ', '+05:00')).toBe('2026-09-25T08:05:00+05:00');
  });

  it('rejects anything that is not a real date and time', () => {
    for (const bad of ['', 'yesterday', '2/30/2026 10:00:00', '9/25/2026 24:00:00', '9/25/2026 10:60:00', '2026-09-25 10:00']) {
      expect(parseSheetsTimestamp(bad, '+05:00'), bad).toBeNull();
    }
  });
});

describe('parseFormExport', () => {
  it('maps every column of the fake export', () => {
    const { rows, warnings } = ok(fixture);
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(5);
    const [ali, aisha, zara, aliAgain, noReg] = rows;

    expect(ali).toMatchObject({
      submitted_at: '2026-09-20T10:15:02+05:00',
      account_email: 'ali.account@example.test',
      full_name: 'Ali Raza',
      email: 'ali.raza@example.test',
      reg_number: '2099101',
      phone: '03001234501',
      department: 'Computer Science',
      batch: 'B35',
      preferences: ['Dev Team', 'Marketing', 'L&D', 'LogiKal'],
    });
    expect(ali.answers.general).toHaveLength(16);
    expect(ali.answers.general[0]).toEqual({ q: 'What motivated you to join Microsoft Club?', a: 'Ali answer 1' });
    expect(ali.answers.general[15]).toEqual({
      q: 'What makes you different from other applicants — why should we choose you? Mention very briefly in 2-3 lines',
      a: 'I finish what I start.',
    });
    expect(ali.answers.dev.map((x) => x.a)).toEqual(['Ali dev 1', 'Ali dev 2', 'Ali dev 3', 'Ali dev 4', 'Ali dev 5', 'Ali dev 6', 'Ali dev 7']);
    expect([ali.answers.logikal.length, ali.answers.lnd.length, ali.answers.marketing.length]).toEqual([6, 4, 6]);
    expect(ali.answers.logikal[1].q).toBe('Which parts of LogiKal interest you most? Select up to 2');

    // Byte-for-byte names, multi-line answers with commas and quotes, and messy reg numbers.
    expect(aisha.full_name).toBe('عائشہ خان');
    expect(aisha.reg_number).toBe('2099 102');
    expect(aisha.answers.general[0].a).toBe('First line\nSecond line, with a comma and "quotes"');
    expect(aisha.answers.general[15].a).toBe('میں ٹیم کے ساتھ کام کرنا پسند کرتی ہوں۔');
    expect(aisha.preferences).toEqual(['LogiKal', 'L&D', '', '']);
    expect(zara.full_name).toBe("Zara O'Brien-Khan");
    expect(zara.submitted_at).toBe('2026-09-21T09:05:10+05:00');
    expect(zara.answers.dev.every((x) => x.a === '')).toBe(true);

    // Duplicates and missing reg numbers are passed through; the database flags them.
    expect(aliAgain.reg_number).toBe('2099101');
    expect(aliAgain.phone).toBe('03001234599');
    expect(noReg.reg_number).toBe('');
  });

  it('accepts a byte-order mark and LF line endings', () => {
    expect(ok('﻿' + fixture).rows).toHaveLength(5);
    const lf = fixture.replaceAll('\r\n', '\n');
    expect(ok(lf).rows[1].answers.general[0].a).toBe('First line\nSecond line, with a comma and "quotes"');
  });

  it('stops and names the columns when the header does not match', () => {
    const result = parseFormExport(renameHeader('Registration Number', 'Reg No'));
    expect(result).toEqual({
      ok: false,
      error: "The columns don't match the Fall 2026 induction form. Nothing was imported.",
      mismatches: [{ column: 5, expected: 'Registration Number', found: 'Reg No' }],
    });
  });

  it('reports a missing last column', () => {
    const lines = fixture.split('\r\n').filter(Boolean);
    const header = lines[0].slice(0, lines[0].lastIndexOf(','));
    const result = parseFormExport([header].join('\r\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.mismatches).toEqual([
      { column: 51, expected: FORM_LAYOUT.columns[50].header, found: '(missing)' },
    ]);
  });

  it('refuses empty files, files without responses and rows with the wrong number of columns', () => {
    expect(parseFormExport('')).toEqual({ ok: false, error: 'The file is empty.', mismatches: [] });
    const header = fixture.slice(0, fixture.indexOf('\r\n9/20/2026'));
    expect(parseFormExport(header)).toEqual({ ok: false, error: 'The file has no responses.', mismatches: [] });
    expect(parseFormExport(header + '\r\n9/20/2026 10:15:02,a@example.test,Short Row')).toEqual({
      ok: false,
      error: 'Row 2 has 3 columns; expected 51. Nothing was imported.',
      mismatches: [],
    });
  });

  it('keeps rows with unreadable timestamps and warns about them', () => {
    const result = ok(fixture.replace('9/21/2026 9:05:10', 'yesterday'));
    expect(result.rows[2].submitted_at).toBeNull();
    expect(result.warnings).toEqual([
      `Row 4 (Zara O'Brien-Khan): the timestamp "yesterday" can't be read, so this person is numbered as if they submitted just now.`,
    ]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/web/parseFormExport.test.ts`
Expected: FAIL. Vitest cannot resolve `../../../src/csv/formLayout.ts`.

- [ ] **Step 3: Write the form layout**

`src/csv/formLayout.ts` holds one entry per column, in export order. Its headers are the real export's header cells after whitespace normalization, and its targets follow the spec §7 table:
- 0–7: fields
- 8–22 and 50: general answers
- 23–29: dev
- 30–35: logikal
- 36–39: lnd
- 40–45: marketing
- 46–49: preferences 1–4

```ts
// The Fall 2026 Google Form export, column by column (0-based, as in the CSV). Next year's form is
// a change to this file only. Headers are compared after collapsing whitespace (normalizeHeader),
// so the trailing spaces and line breaks Google leaves in header cells don't matter.
import type { AnswerSection } from '../lib/types.ts';

export type CandidateField =
  | 'submitted_at'
  | 'account_email'
  | 'full_name'
  | 'email'
  | 'reg_number'
  | 'phone'
  | 'department'
  | 'batch';

export type ColumnTarget =
  | { kind: 'field'; field: CandidateField }
  | { kind: 'answer'; section: AnswerSection }
  | { kind: 'preference'; rank: 1 | 2 | 3 | 4 };

export interface FormColumn {
  header: string;
  target: ColumnTarget;
}

export interface FormLayout {
  name: string;
  /** UTC offset of the form's timestamps. Asia/Karachi has no daylight saving time. */
  utcOffset: string;
  columns: FormColumn[];
}

const field = (name: CandidateField): ColumnTarget => ({ kind: 'field', field: name });
const answer = (section: AnswerSection): ColumnTarget => ({ kind: 'answer', section });
const preference = (rank: 1 | 2 | 3 | 4): ColumnTarget => ({ kind: 'preference', rank });

export const FORM_LAYOUT: FormLayout = {
  name: 'Fall 2026 induction form',
  utcOffset: '+05:00',
  columns: [
    /*  0 */ { header: 'Timestamp', target: field('submitted_at') },
    /*  1 */ { header: 'Email Address', target: field('account_email') },
    /*  2 */ { header: 'Full Name', target: field('full_name') },
    /*  3 */ { header: 'Email Address', target: field('email') },
    /*  4 */ { header: 'Registration Number', target: field('reg_number') },
    /*  5 */ { header: 'Phone Number (Whatsapp)', target: field('phone') },
    /*  6 */ { header: 'Department', target: field('department') },
    /*  7 */ { header: 'Batch', target: field('batch') },
    /*  8 */ { header: 'What motivated you to join Microsoft Club?', target: answer('general') },
    /*  9 */ { header: 'What do you hope to gain or contribute during your time with us?', target: answer('general') },
    /* 10 */ { header: "Tell us about something that you're proud of, and what your role was?", target: answer('general') },
    /* 11 */ { header: "Tell us about a time where something didn't go as planned and what you learned?", target: answer('general') },
    /* 12 */ { header: 'Describe a time you took full ownership of something. What did you do?', target: answer('general') },
    /* 13 */ { header: 'How do you see your next 3-4 years at GIKI? Any ambitions?', target: answer('general') },
    /* 14 */ { header: 'Why do you specifically want to join MLSA instead of another team or society?', target: answer('general') },
    /* 15 */ { header: 'On average, how many hours per week can you realistically commit to MLSA activities, projects, and events?', target: answer('general') },
    /* 16 */ { header: 'On a scale of 1 to 5, how would you rate your marketing skills?', target: answer('general') },
    /* 17 */ { header: 'Do you have any prior marketing experience (e.g., handling an Instagram page for a club, team, or organization)?', target: answer('general') },
    /* 18 */ { header: 'On a scale of 1 to 5, how would you rate your teamwork and collaboration skills?', target: answer('general') },
    /* 19 */ { header: 'On a scale of 1 to 5, how would you rate your logical thinking skills?', target: answer('general') },
    /* 20 */ { header: 'Tell us about a time you taught, organized, or helped others learn something — even if it was informal.', target: answer('general') },
    /* 21 */ { header: 'Have you participated in any activities involving public speaking, hosting, debates, or similar communication activity? If yes, briefly describe your experience.', target: answer('general') },
    /* 22 */ { header: 'Do you have any coding experience? If yes, please mention the languages, frameworks, or projects you have worked on.', target: answer('general') },
    /* 23 */ { header: 'Have you worked on any personal projects? (Yes/No → If yes, describe briefly)', target: answer('dev') },
    /* 24 */ { header: 'Which programming languages or frameworks do you know?', target: answer('dev') },
    /* 25 */ { header: 'Tell us something you explored recently in tech.', target: answer('dev') },
    /* 26 */ { header: 'Which technical domain are you most interested in, and what skills or technologies do you currently have experience with in that domain?', target: answer('dev') },
    /* 27 */ { header: 'Rate your familiarity with Git/GitHub (1–5)', target: answer('dev') },
    /* 28 */ { header: 'Rate your familiarity with LLMs and Coding Agents like (Claude Code, Curosr, Github-Copilot etc)', target: answer('dev') },
    /* 29 */ { header: 'Gihub link (Optional)', target: answer('dev') },
    /* 30 */ { header: 'Have you had experience with public speaking, hosting, debates, or similar activities? If yes, briefly tell us what you did.', target: answer('logikal') },
    /* 31 */ { header: 'Which parts of LogiKal interest you most? Select up to 2', target: answer('logikal') },
    /* 32 */ { header: 'Have you worked with video or audio editing before? If yes, mention the tools you use.', target: answer('logikal') },
    /* 33 */ { header: 'You may share a link to your work if you have one.', target: answer('logikal') },
    /* 34 */ { header: 'Do you have access to a good camera or mic setup? (Yes/No)', target: answer('logikal') },
    /* 35 */ { header: 'Imagine you get the chance to have a conversation with a GIKI student who has built something interesting. Beyond what they built, what would you be curious to know about their journey?', target: answer('logikal') },
    /* 36 */ { header: 'What excites you most about the Learning & Development (L&D) team?', target: answer('lnd') },
    /* 37 */ { header: 'Tell us about a time you taught, organized, or helped others learn something — even if it was informal.', target: answer('lnd') },
    /* 38 */ { header: 'Which of these areas interests you the most? (Select up to 2)', target: answer('lnd') },
    /* 39 */ { header: "What skill or topic would you most like our L&D team to cover in a workshop/bootcamp? Briefly describe what you'd like to learn, why it would be useful to you, and what you'd ideally want to be able to do by the end of the session.", target: answer('lnd') },
    /* 40 */ { header: 'Which design tools are you comfortable with?', target: answer('marketing') },
    /* 41 */ { header: 'Do you sketch/draw or engage in other art forms? (Yes/No → If yes, describe)', target: answer('marketing') },
    /* 42 */ { header: 'On a scale of 1 to 5, how would you rate your ability to create visually compelling marketing designs that balance brand consistency, effective typography and audience engagement?', target: answer('marketing') },
    /* 43 */ { header: 'On a scale of 1 to 5, how would you rate your ability to conceptualize and edit engaging reels that combine creative ideas, effective storytelling, visual appeal, and audience retention?', target: answer('marketing') },
    /* 44 */ { header: 'What excites you most about joining the Marketing Team?', target: answer('marketing') },
    /* 45 */ { header: 'Share a poster, reel, or any other creative work you’ve made.', target: answer('marketing') },
    /* 46 */ { header: 'Which team is your first preference?', target: preference(1) },
    /* 47 */ { header: 'Which is your second preference?', target: preference(2) },
    /* 48 */ { header: 'Which is your third preference?', target: preference(3) },
    /* 49 */ { header: 'Which is your fourth preference?', target: preference(4) },
    /* 50 */ { header: 'What makes you different from other applicants — why should we choose you? Mention very briefly in 2-3 lines', target: answer('general') },
  ],
};
```

- [ ] **Step 4: Write the parser**

`src/csv/parseFormExport.ts`:

```ts
import Papa from 'papaparse';
import type { ImportRow } from '../lib/types.ts';
import { FORM_LAYOUT, type FormLayout } from './formLayout.ts';

export interface HeaderMismatch {
  /** 1-based, as a spreadsheet user counts columns. */
  column: number;
  expected: string;
  found: string;
}

export type ParseResult =
  | { ok: true; rows: ImportRow[]; warnings: string[] }
  | { ok: false; error: string; mismatches: HeaderMismatch[] };

export function normalizeHeader(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Google Sheets' "M/D/YYYY H:MM:SS" in the form's time zone → ISO 8601, or null if unreadable. */
export function parseSheetsTimestamp(text: string, utcOffset: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const [month, day, year, hour, minute, second] = [1, 2, 3, 4, 5, 6].map((i) => Number(match[i] ?? '0'));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${utcOffset}`;
}

/**
 * Reads a Google Forms CSV export in the browser. Stops (imports nothing) when the header row doesn't
 * match the layout or a row has the wrong number of columns. Every row is returned, including
 * duplicates and rows without a reg number: import_candidates de-duplicates and flags those.
 */
export function parseFormExport(text: string, layout: FormLayout = FORM_LAYOUT): ParseResult {
  const fail = (error: string, mismatches: HeaderMismatch[] = []): ParseResult => ({ ok: false, error, mismatches });
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const [header, ...records] = parsed.data;
  if (!header) return fail('The file is empty.');

  const expected = layout.columns.map((column) => normalizeHeader(column.header));
  const found = header.map(normalizeHeader);
  const mismatches: HeaderMismatch[] = [];
  for (let i = 0; i < Math.max(expected.length, found.length); i++) {
    if (expected[i] !== found[i]) {
      mismatches.push({ column: i + 1, expected: expected[i] ?? '(no column)', found: found[i] ?? '(missing)' });
    }
  }
  if (mismatches.length > 0) {
    return fail(`The columns don't match the ${layout.name}. Nothing was imported.`, mismatches);
  }
  if (records.length === 0) return fail('The file has no responses.');

  const rows: ImportRow[] = [];
  const warnings: string[] = [];
  for (const [index, cells] of records.entries()) {
    const rowNumber = index + 2; // the header is row 1
    if (cells.length !== layout.columns.length) {
      return fail(`Row ${rowNumber} has ${cells.length} columns; expected ${layout.columns.length}. Nothing was imported.`);
    }
    const { row, rawTimestamp } = mapRow(cells, layout);
    if (row.submitted_at === null) {
      warnings.push(
        `Row ${rowNumber} (${row.full_name || 'no name'}): the timestamp "${rawTimestamp}" can't be read, ` +
          'so this person is numbered as if they submitted just now.',
      );
    }
    rows.push(row);
  }
  return { ok: true, rows, warnings };
}

function mapRow(cells: string[], layout: FormLayout): { row: ImportRow; rawTimestamp: string } {
  const row: ImportRow = {
    submitted_at: null,
    reg_number: '',
    full_name: '',
    email: '',
    account_email: '',
    phone: '',
    department: '',
    batch: '',
    preferences: ['', '', '', ''],
    answers: { general: [], dev: [], logikal: [], lnd: [], marketing: [] },
  };
  let rawTimestamp = '';
  layout.columns.forEach((column, i) => {
    const value = (cells[i] ?? '').trim();
    const target = column.target;
    if (target.kind === 'answer') {
      row.answers[target.section].push({ q: normalizeHeader(column.header), a: value });
    } else if (target.kind === 'preference') {
      row.preferences[target.rank - 1] = value;
    } else if (target.field === 'submitted_at') {
      rawTimestamp = value;
      row.submitted_at = parseSheetsTimestamp(value, layout.utcOffset);
    } else {
      row[target.field] = value;
    }
  });
  return { row, rawTimestamp };
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/web/parseFormExport.test.ts && npm run typecheck`
Expected: `Tests  8 passed (8)`, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/csv tests/unit/web/parseFormExport.test.ts
git commit -m "feat(web): read the Google Forms CSV export against the Fall 2026 layout"
```

---

### Task 3: The typed API layer and realtime subscriber

**Files:**
- Create: `src/lib/notAllowed.ts`, `src/lib/realtime.ts`, `src/lib/api.ts`
- Test: `tests/unit/web/api.test.ts`, `tests/integration/web-api.test.ts`

**Interfaces:**
- Consumes:
  - Plan 1 functions:
    - `board_snapshot()`, `display_snapshot(p_key)`, `server_now()`, `get_display_key()`
    - `check_in(p_candidate_id)`, `undo_check_in(p_candidate_id)`, `move_candidate(p_candidate_id, p_panel_id, p_position)`, `skip_candidate(p_candidate_id)`
    - `send_in(p_candidate_id, p_panel_id) → uuid`, `undo_send_in(p_interview_id)`, `end_interview(p_interview_id)`, `reopen_interview(p_interview_id)`
    - `add_panel() → uuid`, `delete_panel(p_panel_id)`, `import_candidates(p_rows) → jsonb`
  - The `candidates` table (read through row-level security).
  - Realtime topics `board` (private) and `display:<key>` (public).
  - `parseFormExport` (Task 2) and the fixture, both used only by the integration test.
- Produces:
  - `createApi(client: SupabaseClient): Api`. Every method is listed in the `Api` interface below, and each object's methods are stable, so they are safe as React dependencies.
  - `class ApiError extends Error`
  - `errorMessage(e: unknown): string`
  - `friendlyMessage(error, status?): string`
  - The constants `NETWORK_ERROR` and `NOT_ALLOWED`
  - `notAllowed.emit()` and `notAllowed.subscribe(listener) → unsubscribe`
  - `type ChannelStatus = 'subscribed' | 'error' | 'closed'`
  - `type Subscribe = (handlers: { onEvent(): void; onStatus(s: ChannelStatus): void }) => () => void`
  - `broadcastSubscriber(client, topic, isPrivate): Subscribe`

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/web/api.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, friendlyMessage, NETWORK_ERROR, NOT_ALLOWED } from '../../../src/lib/api.ts';
import { notAllowed } from '../../../src/lib/notAllowed.ts';

function clientReturning(response: { data?: unknown; error?: { message: string; code?: string } | null; status?: number }) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null, status: 200, ...response });
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}

describe('friendlyMessage', () => {
  it('passes the database message through', () => {
    expect(friendlyMessage({ message: 'Panel 2 is busy', code: 'P0001' }, 400)).toBe('Panel 2 is busy');
  });
  it('maps permission errors and network failures', () => {
    expect(friendlyMessage({ message: 'Not allowed', code: '42501' }, 403)).toBe(NOT_ALLOWED);
    expect(friendlyMessage({ message: 'permission denied for table candidates', code: '42501' }, 401)).toBe(NOT_ALLOWED);
    expect(friendlyMessage({ message: 'TypeError: Failed to fetch', code: '' }, 0)).toBe(NETWORK_ERROR);
    expect(friendlyMessage({ message: '' }, 500)).toBe('Something went wrong');
  });
});

describe('createApi', () => {
  it('calls each database function with its argument names', async () => {
    const { rpc, client } = clientReturning({ data: 'interview-1' });
    const api = createApi(client);
    await expect(api.sendIn('c1', 'p1')).resolves.toBe('interview-1');
    await api.moveCandidate('c1', null, null);
    await api.importCandidates([]);
    expect(rpc.mock.calls).toEqual([
      ['send_in', { p_candidate_id: 'c1', p_panel_id: 'p1' }],
      ['move_candidate', { p_candidate_id: 'c1', p_panel_id: null, p_position: null }],
      ['import_candidates', { p_rows: [] }],
    ]);
  });

  it('rejects with the server message', async () => {
    const api = createApi(clientReturning({ error: { message: 'Candidate #4 is not waiting', code: 'P0001' }, status: 400 }).client);
    await expect(api.checkIn('c4')).rejects.toEqual(new ApiError('Candidate #4 is not waiting'));
  });

  it('announces "Not allowed" so a disabled account gets signed out', async () => {
    const listener = vi.fn();
    const stop = notAllowed.subscribe(listener);
    const api = createApi(clientReturning({ error: { message: 'Not allowed', code: '42501' }, status: 403 }).client);
    await expect(api.boardSnapshot()).rejects.toThrow(NOT_ALLOWED);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('turns a thrown fetch into the network message', async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const api = createApi({ rpc } as unknown as SupabaseClient);
    await expect(api.serverNow()).rejects.toThrow(NETWORK_ERROR);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/web/api.test.ts`
Expected: FAIL. Vitest cannot resolve `../../../src/lib/api.ts`.

- [ ] **Step 3: Write the "Not allowed" signal, the realtime subscriber and the API**

`src/lib/notAllowed.ts`:

```ts
// The server answers "Not allowed" when the account was disabled (or lost its role) while a tab was
// open. The API layer emits this; the auth layer listens, re-checks the account and signs it out.
type Listener = () => void;

const listeners = new Set<Listener>();

export const notAllowed = {
  emit(): void {
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
```

`src/lib/realtime.ts`:

```ts
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type ChannelStatus = 'subscribed' | 'error' | 'closed';

/**
 * Starts listening to one realtime topic and returns a function that stops. Screens treat every
 * event as "reload your snapshot" and every (re)subscription as "reload, you may have missed events".
 */
export type Subscribe = (handlers: { onEvent: () => void; onStatus: (status: ChannelStatus) => void }) => () => void;

export function broadcastSubscriber(client: SupabaseClient, topic: string, isPrivate: boolean): Subscribe {
  return ({ onEvent, onStatus }) => {
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    // Deferred, so React StrictMode's mount → unmount → mount never creates a channel it abandons.
    void (async () => {
      if (isPrivate) {
        try {
          await client.realtime.setAuth(); // private channels need the signed-in user's token
        } catch {
          // The join below then fails and reports CHANNEL_ERROR, which the screen shows.
        }
      }
      await Promise.resolve();
      if (stopped) return;
      channel = client
        .channel(topic, { config: { private: isPrivate } })
        .on('broadcast', { event: '*' }, () => {
          if (!stopped) onEvent();
        })
        .subscribe((status) => {
          if (stopped) return;
          if (status === 'SUBSCRIBED') onStatus('subscribed');
          else if (status === 'CLOSED') onStatus('closed');
          else onStatus('error');
        });
    })();
    return () => {
      stopped = true;
      if (channel) void client.removeChannel(channel);
    };
  };
}
```

`src/lib/api.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { notAllowed } from './notAllowed.ts';
import { broadcastSubscriber, type Subscribe } from './realtime.ts';
import type { BoardSnapshot, CandidateSummary, DisplaySnapshot, ImportResult, ImportRow } from './types.ts';

export const NETWORK_ERROR = "Can't reach the server. Check the connection and try again.";
export const NOT_ALLOWED = 'Not allowed';

/** An action or read failed; `message` is safe to show (usually the database's own short message). */
export class ApiError extends Error {}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong';
}

/** Turns a PostgREST/Postgres error into the message a person should see. */
export function friendlyMessage(error: { message?: string; code?: string }, status?: number): string {
  if (error.code === '42501') return NOT_ALLOWED; // require_role() and RLS both use this code
  if (status === 0 || /failed to fetch|fetch failed|networkerror/i.test(error.message ?? '')) return NETWORK_ERROR;
  return error.message?.trim() || 'Something went wrong';
}

/** Every call the screens make. One object per client; its methods are stable for React deps. */
export interface Api {
  boardSnapshot(): Promise<BoardSnapshot>;
  /** null for a wrong or regenerated projector key. */
  displaySnapshot(key: string): Promise<DisplaySnapshot | null>;
  serverNow(): Promise<string>;
  listCandidates(inductionId: string): Promise<CandidateSummary[]>;
  getDisplayKey(): Promise<string>;
  checkIn(candidateId: string): Promise<void>;
  undoCheckIn(candidateId: string): Promise<void>;
  /** panelId null = the waiting pool; position null = end of the lane. */
  moveCandidate(candidateId: string, panelId: string | null, position: number | null): Promise<void>;
  skipCandidate(candidateId: string): Promise<void>;
  /** Returns the new interview's id. */
  sendIn(candidateId: string, panelId: string): Promise<string>;
  undoSendIn(interviewId: string): Promise<void>;
  endInterview(interviewId: string): Promise<void>;
  reopenInterview(interviewId: string): Promise<void>;
  /** Returns the new panel's id. */
  addPanel(): Promise<string>;
  deletePanel(panelId: string): Promise<void>;
  importCandidates(rows: ImportRow[]): Promise<ImportResult>;
  subscribeBoard(): Subscribe;
  subscribeDisplay(key: string): Subscribe;
}

export function createApi(client: SupabaseClient): Api {
  function fail(error: { message?: string; code?: string }, status?: number): ApiError {
    const message = friendlyMessage(error, status);
    if (message === NOT_ALLOWED) notAllowed.emit();
    return new ApiError(message);
  }

  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    let response;
    try {
      response = await client.rpc(fn, args);
    } catch {
      throw new ApiError(NETWORK_ERROR);
    }
    if (response.error) throw fail(response.error, response.status);
    return response.data as T;
  }

  return {
    boardSnapshot: () => rpc<BoardSnapshot>('board_snapshot'),
    displaySnapshot: (key) => rpc<DisplaySnapshot | null>('display_snapshot', { p_key: key }),
    serverNow: () => rpc<string>('server_now'),
    async listCandidates(inductionId) {
      let response;
      try {
        response = await client
          .from('candidates')
          .select('id, number, full_name, reg_number, status')
          .eq('induction_id', inductionId)
          .order('number');
      } catch {
        throw new ApiError(NETWORK_ERROR);
      }
      if (response.error) throw fail(response.error, response.status);
      return response.data as CandidateSummary[];
    },
    getDisplayKey: () => rpc<string>('get_display_key'),
    checkIn: (candidateId) => rpc<void>('check_in', { p_candidate_id: candidateId }),
    undoCheckIn: (candidateId) => rpc<void>('undo_check_in', { p_candidate_id: candidateId }),
    moveCandidate: (candidateId, panelId, position) =>
      rpc<void>('move_candidate', { p_candidate_id: candidateId, p_panel_id: panelId, p_position: position }),
    skipCandidate: (candidateId) => rpc<void>('skip_candidate', { p_candidate_id: candidateId }),
    sendIn: (candidateId, panelId) => rpc<string>('send_in', { p_candidate_id: candidateId, p_panel_id: panelId }),
    undoSendIn: (interviewId) => rpc<void>('undo_send_in', { p_interview_id: interviewId }),
    endInterview: (interviewId) => rpc<void>('end_interview', { p_interview_id: interviewId }),
    reopenInterview: (interviewId) => rpc<void>('reopen_interview', { p_interview_id: interviewId }),
    addPanel: () => rpc<string>('add_panel'),
    deletePanel: (panelId) => rpc<void>('delete_panel', { p_panel_id: panelId }),
    importCandidates: (rows) => rpc<ImportResult>('import_candidates', { p_rows: rows }),
    subscribeBoard: () => broadcastSubscriber(client, 'board', true),
    subscribeDisplay: (key) => broadcastSubscriber(client, `display:${key}`, false),
  };
}
```

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `npx vitest run tests/unit/web/api.test.ts && npm run typecheck`
Expected: `Tests  6 passed (6)`, and `tsc` prints nothing.

- [ ] **Step 5: Write the integration test against the local stack**

This test signs in as a real queue manager, panelist and anonymous projector. It imports the fake export through the browser parser, runs one candidate through check-in, line-up, send-in and end, and checks every shape in `src/lib/types.ts` against what the functions really return. It adds and then deletes its own panel, so Panel 1 and Panel 2 stay free.

`tests/integration/web-api.test.ts`:

```ts
// The browser's API layer (src/lib/api.ts) and CSV parser against the real local stack: argument
// names, returned shapes, error messages and realtime delivery to the web subscriber.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fixture from '../../fixtures/form-export-fake.csv?raw';
import { parseFormExport } from '../../src/csv/parseFormExport.ts';
import { ApiError, createApi, NOT_ALLOWED, type Api } from '../../src/lib/api.ts';
import { notAllowed } from '../../src/lib/notAllowed.ts';
import type { ChannelStatus, Subscribe } from '../../src/lib/realtime.ts';
import { env, makeAccount, service, signIn, uniqueName, waitFor } from './support.ts';

const sortedKeys = (value: object | null | undefined) => Object.keys(value ?? {}).sort();

/** Subscribes, waits until joined, then repeats `poke` until an event arrives (realtime may be warming up). */
async function expectEvent(subscribe: Subscribe, poke: () => Promise<unknown>): Promise<void> {
  const statuses: ChannelStatus[] = [];
  let events = 0;
  const stop = subscribe({ onEvent: () => events++, onStatus: (status) => statuses.push(status) });
  try {
    await waitFor(() => statuses.includes('subscribed'), 15_000);
    const deadline = Date.now() + 20_000;
    while (events === 0) {
      if (Date.now() > deadline) throw new Error(`No realtime event (statuses: ${statuses.join(', ')})`);
      await poke();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    stop();
  }
}

describe('web API layer', () => {
  const accountIds: string[] = [];
  let qm: Api;
  let panelist: Api;
  let projector: Api;
  let inductionId: string;
  let displayKey: string;
  let panelId: string | undefined;
  let interviewId: string | undefined;

  beforeAll(async () => {
    const names = { qm: uniqueName('web_qm'), panelist: uniqueName('web_pan') };
    accountIds.push(await makeAccount(names.qm, 'queue_manager'), await makeAccount(names.panelist, 'panelist'));
    qm = createApi(await signIn(names.qm));
    panelist = createApi(await signIn(names.panelist));
    projector = createApi(createClient(env.url, env.anonKey, { auth: { persistSession: false } }));
    inductionId = (await qm.boardSnapshot()).induction.id;
    const induction = await service.from('inductions').select('display_key').eq('is_active', true).single();
    if (induction.error) throw induction.error;
    displayKey = induction.data.display_key;
  });

  afterAll(async () => {
    if (interviewId) await qm.endInterview(interviewId).catch(() => undefined);
    if (panelId) await qm.deletePanel(panelId).catch(() => undefined);
    for (const id of accountIds) await service.auth.admin.deleteUser(id);
  });

  it('imports the fake form export through the browser parser', async () => {
    const parsed = parseFormExport(fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    const result = await qm.importCandidates(parsed.rows);

    expect(sortedKeys(result)).toEqual(['added', 'flagged', 'updated']);
    expect(result.flagged).toContainEqual({ reg_number: '', name: 'No Reg Person', reason: 'Missing registration number; row skipped' });
    expect(result.flagged).toContainEqual({
      reg_number: '2099101', name: 'Ali Raza', reason: 'Duplicate submission (2 responses); kept the latest',
    });

    const candidates = await qm.listCandidates(inductionId);
    const byReg = (reg: string) => candidates.find((c) => c.reg_number === reg);
    expect(sortedKeys(byReg('2099102'))).toEqual(['full_name', 'id', 'number', 'reg_number', 'status']);
    expect(byReg('2099102')?.full_name).toBe('عائشہ خان'); // ' 2099 102 ' was normalised by the server
    expect(byReg('2099103')?.full_name).toBe("Zara O'Brien-Khan");

    const ali = await service.from('candidates').select('phone, submitted_at, answers').eq('reg_number', '2099101').single();
    if (ali.error) throw ali.error;
    expect(ali.data.phone).toBe('03001234599'); // data from the latest response
    expect(Date.parse(ali.data.submitted_at)).toBe(Date.parse('2026-09-20T10:15:02+05:00')); // time of the earliest
    expect(ali.data.answers.general[0].q).toBe('What motivated you to join Microsoft Club?');
  });

  it('runs a candidate through the queue and returns the shapes the screens use', async () => {
    panelId = await qm.addPanel();
    const reg = `WEB${Date.now()}`;
    await qm.importCandidates([{
      submitted_at: new Date().toISOString(), reg_number: reg, full_name: 'Web Api Tester', email: '', account_email: '',
      phone: '', department: '', batch: '', preferences: ['', '', '', ''],
      answers: { general: [], dev: [], logikal: [], lnd: [], marketing: [] },
    }]);
    const candidate = (await qm.listCandidates(inductionId)).find((c) => c.reg_number === reg);
    if (!candidate) throw new Error('imported candidate not found');
    expect(candidate.status).toBe('registered');

    await qm.checkIn(candidate.id);
    let board = await qm.boardSnapshot();
    expect(sortedKeys(board)).toEqual(['counts', 'induction', 'panels', 'pool', 'server_time']);
    expect(sortedKeys(board.induction)).toEqual(['id', 'name', 'results_published', 'target_interview_minutes']);
    expect(sortedKeys(board.counts)).toEqual(['interviewed', 'interviewing', 'registered', 'waiting']);
    const pooled = board.pool.find((e) => e.candidate_id === candidate.id);
    expect(sortedKeys(pooled)).toEqual(['candidate_id', 'checked_in_at', 'name', 'number', 'position', 'reg_number', 'skip_count']);

    await qm.moveCandidate(candidate.id, panelId, null);
    board = await qm.boardSnapshot();
    const panel = board.panels.find((p) => p.id === panelId);
    expect(sortedKeys(panel)).toEqual(['current', 'id', 'is_default', 'lane', 'last_ended', 'name', 'panelists']);
    expect(panel?.lane.map((e) => e.candidate_id)).toEqual([candidate.id]);

    interviewId = await qm.sendIn(candidate.id, panelId);
    board = await qm.boardSnapshot();
    const busy = board.panels.find((p) => p.id === panelId);
    expect(sortedKeys(busy?.current)).toEqual(['candidate_id', 'interview_id', 'name', 'number', 'reg_number', 'started_at']);
    expect(busy?.current?.interview_id).toBe(interviewId);

    const display = await projector.displaySnapshot(displayKey);
    expect(sortedKeys(display)).toEqual(['induction_name', 'panels', 'server_time', 'target_interview_minutes', 'waiting']);
    const tile = display?.panels.find((p) => p.id === panelId);
    expect(sortedKeys(tile)).toEqual(['current', 'id', 'lined_up', 'name']);
    expect(tile?.current).toMatchObject({ number: candidate.number, name: 'Web Api Tester' });
    expect(await projector.displaySnapshot('not-the-key')).toBeNull();

    await qm.endInterview(interviewId);
    board = await qm.boardSnapshot();
    const ended = board.panels.find((p) => p.id === panelId);
    expect(ended?.current).toBeNull();
    expect(sortedKeys(ended?.last_ended)).toEqual(['candidate_id', 'ended_at', 'interview_id', 'name', 'number']);
    interviewId = undefined;

    await expect(qm.sendIn(candidate.id, panelId)).rejects.toEqual(new ApiError(`Candidate #${candidate.number} is not waiting`));
    await qm.deletePanel(panelId);
    panelId = undefined;
  });

  it('turns permission errors into "Not allowed" and announces them', async () => {
    let heard = 0;
    const stop = notAllowed.subscribe(() => heard++);
    await expect(panelist.addPanel()).rejects.toEqual(new ApiError(NOT_ALLOWED));
    stop();
    expect(heard).toBe(1);
    expect(Date.parse(await projector.serverNow())).not.toBeNaN();
  });

  it('delivers board and projector events to the web subscriber', async () => {
    const poke = () => qm.importCandidates([]); // a no-op import still broadcasts
    await expectEvent(qm.subscribeBoard(), poke);
    await expectEvent(projector.subscribeDisplay(displayKey), poke);
  });
});
```

- [ ] **Step 6: Run it**

Run: `npx vitest run tests/integration/web-api.test.ts`. The local stack must be running; start it with `npm run db:start` if `docker ps` doesn't list `supabase_db_yawar-work`.
Expected: `Tests  4 passed (4)`. If the "delivers board and projector events" test times out right after a `db reset`, the realtime service is still warming up. Wait 30 s and run it again; the helper already retries its trigger for 20 s.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notAllowed.ts src/lib/realtime.ts src/lib/api.ts tests/unit/web/api.test.ts tests/integration/web-api.test.ts
git commit -m "feat(web): typed API over the backend functions, with realtime subscriptions"
```

---

### Task 4: Clock sync, live snapshots and the shared screen pieces

**Files:**
- Create:
  - `src/lib/clock.ts`, `src/lib/useLiveSnapshot.ts`, `src/lib/ClockProvider.tsx`, `src/lib/ApiProvider.tsx`
  - `src/components/Timer.tsx`, `src/components/Toasts.tsx`, `src/components/ActionProvider.tsx`, `src/components/ActionButton.tsx`, `src/components/ConnectionBanner.tsx`, `src/components/FullPageMessage.tsx`
- Test: `tests/unit/web/clock.test.ts`, `tests/unit/web/useLiveSnapshot.test.tsx`, `tests/unit/web/timer.test.tsx`, `tests/unit/web/actionButton.test.tsx`

**Interfaces:**
- Consumes: `Api`, `ApiError` and `errorMessage` (Task 3); `Subscribe` and `ChannelStatus` (Task 3).
- Produces:
  - From `clock.ts`: `parseServerTime(iso): number`, `clockOffsetMs(sentAtMs, serverIso, receivedAtMs): number`, `elapsedMs(startedAtIso, clientNowMs, offsetMs): number`, `formatElapsed(ms): string`, `isOverTarget(ms, targetMinutes): boolean`
  - From `useLiveSnapshot.ts`:
    - `useLiveSnapshot<T>(load: () => Promise<T>, subscribe: Subscribe, pollMs?: number): { data: T | undefined; error: string | null; status: LiveStatus; reload(): void }`
    - `type LiveStatus = 'connecting' | 'live' | 'reconnecting'`
    - `load` and `subscribe` must be stable references.
  - `<ClockProvider serverNow tickMs? resyncMs?>` and `useClock(): { nowMs; offsetMs }`
  - `<ApiProvider api>` and `useApi(): Api`
  - `<Timer startedAt targetMinutes className? colorClassName? overClassName?>`, which renders `data-over-target="true"` at the target
  - `<ToastProvider>` and `useToast().show(message, tone?: 'error' | 'success' | 'info')`
  - `<ActionProvider onSettled?>`, `useRunAction(): RunAction` and `type RunAction = <T>(action: () => Promise<T>) => Promise<T | undefined>`
  - `<ActionButton action confirm? variant? size? disabled? label? className?>` and `buttonClasses(variant?, size?): string`
  - `<ConnectionBanner status>` and `<FullPageMessage title>`

- [ ] **Step 1: Write the failing tests**

`tests/unit/web/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clockOffsetMs, elapsedMs, formatElapsed, isOverTarget, parseServerTime } from '../../../src/lib/clock.ts';

describe('clock math', () => {
  it('parses Postgres timestamps with microseconds', () => {
    expect(parseServerTime('2026-09-26T10:00:00.123456+00:00')).toBe(Date.UTC(2026, 8, 26, 10, 0, 0, 123));
    expect(parseServerTime('2026-09-26T15:00:00+05:00')).toBe(Date.UTC(2026, 8, 26, 10, 0, 0));
  });

  it('measures the offset to the server clock, allowing for half the round trip', () => {
    // Sent at client 1000 ms, answered 200 ms later; the server said 5000 ms.
    expect(clockOffsetMs(1000, '1970-01-01T00:00:05.000Z', 1200)).toBe(5000 + 100 - 1200);
  });

  it('computes elapsed time on the server clock and never goes negative', () => {
    const started = '2026-09-26T10:00:00Z';
    const clientNow = Date.UTC(2026, 8, 26, 10, 14, 0);
    expect(elapsedMs(started, clientNow, 30_000)).toBe(14 * 60_000 + 30_000);
    expect(elapsedMs(started, clientNow, -20 * 60_000)).toBe(0);
  });

  it('formats minutes and seconds, adding hours only when needed', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(59_999)).toBe('00:59');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('turns amber exactly at the target length', () => {
    expect(isOverTarget(15 * 60_000 - 1, 15)).toBe(false);
    expect(isOverTarget(15 * 60_000, 15)).toBe(true);
  });
});
```

`tests/unit/web/useLiveSnapshot.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelStatus, Subscribe } from '../../../src/lib/realtime.ts';
import { useLiveSnapshot } from '../../../src/lib/useLiveSnapshot.ts';

function fakeChannel() {
  let handlers: Parameters<Subscribe>[0] | undefined;
  const stop = vi.fn();
  const subscribe: Subscribe = (h) => {
    handlers = h;
    return stop;
  };
  return {
    subscribe,
    stop,
    event: () => act(() => handlers!.onEvent()),
    status: (status: ChannelStatus) => act(() => handlers!.onStatus(status)),
  };
}

/** load() calls that stay pending until the test settles them. */
function manualLoads() {
  const pending: Array<{ resolve: (value: number) => void; reject: (error: Error) => void }> = [];
  const load = vi.fn(() => new Promise<number>((resolve, reject) => pending.push({ resolve, reject })));
  const settle = async (i: number, outcome: number | Error) => {
    await act(async () => {
      if (outcome instanceof Error) pending[i].reject(outcome);
      else pending[i].resolve(outcome);
    });
  };
  return { load, pending, settle };
}

describe('useLiveSnapshot', () => {
  it('loads on mount, then reloads when the channel subscribes', async () => {
    const channel = fakeChannel();
    let n = 0;
    const load = vi.fn(async () => ++n);
    const { result } = renderHook(() => useLiveSnapshot(load, channel.subscribe));
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(result.current.status).toBe('connecting');

    channel.status('subscribed');
    expect(result.current.status).toBe('live');
    await waitFor(() => expect(result.current.data).toBe(2));
  });

  it('never runs two loads at once; events during a load cause exactly one more', async () => {
    const channel = fakeChannel();
    const { load, settle } = manualLoads();
    const { result } = renderHook(() => useLiveSnapshot(load, channel.subscribe));
    expect(load).toHaveBeenCalledTimes(1);

    channel.event();
    channel.event();
    channel.event();
    expect(load).toHaveBeenCalledTimes(1);

    await settle(0, 1);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await settle(1, 2);
    expect(result.current.data).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good snapshot when a reload fails, and clears the error on the next success', async () => {
    const channel = fakeChannel();
    const { load, settle } = manualLoads();
    const { result } = renderHook(() => useLiveSnapshot(load, channel.subscribe));
    await settle(0, 1);

    channel.event();
    await settle(1, new Error('Network down'));
    expect(result.current.data).toBe(1);
    expect(result.current.error).toBe('Network down');

    channel.event();
    await settle(2, 3);
    expect(result.current.data).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it('reports reconnecting until the channel subscribes again', () => {
    const channel = fakeChannel();
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useLiveSnapshot(load, channel.subscribe));
    channel.status('subscribed');
    channel.status('error');
    expect(result.current.status).toBe('reconnecting');
    channel.status('closed');
    expect(result.current.status).toBe('reconnecting');
    channel.status('subscribed');
    expect(result.current.status).toBe('live');
  });

  it('polls when asked to', async () => {
    const channel = fakeChannel();
    const load = vi.fn(async () => 1);
    renderHook(() => useLiveSnapshot(load, channel.subscribe, 20));
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('stops listening on unmount and ignores later events', async () => {
    const channel = fakeChannel();
    const load = vi.fn(async () => 1);
    const { unmount } = renderHook(() => useLiveSnapshot(load, channel.subscribe));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    unmount();
    expect(channel.stop).toHaveBeenCalledTimes(1);
  });
});
```

`tests/unit/web/timer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timer } from '../../../src/components/Timer.tsx';
import { ClockProvider } from '../../../src/lib/ClockProvider.tsx';

describe('Timer', () => {
  afterEach(() => vi.useRealTimers());

  it('counts on the server clock and turns amber at the target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const serverNow = vi.fn(async () => '2026-09-26T10:00:30.000000+00:00'); // server is 30 s ahead
    render(
      <ClockProvider serverNow={serverNow}>
        <Timer startedAt="2026-09-26T09:45:10+00:00" targetMinutes={15} />
      </ClockProvider>,
    );
    expect(screen.getByText('14:50')).not.toHaveAttribute('data-over-target');

    await act(async () => {}); // the clock sync resolves
    expect(screen.getByText('15:20')).toHaveAttribute('data-over-target', 'true');
    expect(screen.getByText('15:20')).toHaveClass('text-amber-600');

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('15:21')).toBeInTheDocument();
  });

  it('keeps running on the local clock when the server cannot be reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    render(
      <ClockProvider serverNow={() => Promise.reject(new Error('offline'))}>
        <Timer startedAt="2026-09-26T09:59:00Z" targetMinutes={15} />
      </ClockProvider>,
    );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('01:02')).toBeInTheDocument();
  });
});
```

`tests/unit/web/actionButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from '../../../src/components/ActionButton.tsx';
import { ActionProvider } from '../../../src/components/ActionProvider.tsx';
import { ToastProvider } from '../../../src/components/Toasts.tsx';
import { ApiError } from '../../../src/lib/api.ts';

function renderButton(action: () => Promise<unknown>, onSettled = vi.fn(), confirm?: string) {
  render(
    <ToastProvider>
      <ActionProvider onSettled={onSettled}>
        <ActionButton action={action} confirm={confirm}>Send in</ActionButton>
      </ActionProvider>
    </ToastProvider>,
  );
  return { button: screen.getByRole('button', { name: 'Send in' }), onSettled };
}

describe('ActionButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs once on a double click and stays disabled until the action finishes', async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { button, onSettled } = renderButton(action);

    fireEvent.click(button);
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());

    finish();
    await waitFor(() => expect(button).toBeEnabled());
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message when the action fails, then reloads", async () => {
    const { button, onSettled } = renderButton(() => Promise.reject(new ApiError('Panel 2 is busy')));
    await userEvent.click(button);
    expect(await screen.findByText('Panel 2 is busy')).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('asks first when a confirmation is set, and does nothing if cancelled', async () => {
    const action = vi.fn(async () => {});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { button } = renderButton(action, vi.fn(), 'Delete Panel 3?');
    await userEvent.click(button);
    expect(window.confirm).toHaveBeenCalledWith('Delete Panel 3?');
    expect(action).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/web/clock.test.ts tests/unit/web/useLiveSnapshot.test.tsx tests/unit/web/timer.test.tsx tests/unit/web/actionButton.test.tsx`
Expected: FAIL. None of the four modules under test can be resolved yet.

- [ ] **Step 3: Write the clock math and the live-snapshot hook**

`src/lib/clock.ts`:

```ts
// Timer math. Screens tick locally once a second; the only network traffic is server_now(),
// used to measure how far this device's clock is from the server's.

/** Postgres sends microseconds; not every browser parses more than milliseconds. */
export function parseServerTime(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

/** offset = server time + half the round trip − client time when the answer arrived. */
export function clockOffsetMs(sentAtMs: number, serverIso: string, receivedAtMs: number): number {
  return parseServerTime(serverIso) + (receivedAtMs - sentAtMs) / 2 - receivedAtMs;
}

/** Time since `startedAtIso` on the server's clock; never negative. */
export function elapsedMs(startedAtIso: string, clientNowMs: number, offsetMs: number): number {
  return Math.max(0, clientNowMs + offsetMs - parseServerTime(startedAtIso));
}

/** 65 000 ms → "01:05"; past an hour → "1:02:05". */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

/** The timer turns amber once the interview reaches the target length. */
export function isOverTarget(ms: number, targetMinutes: number): boolean {
  return ms >= targetMinutes * 60_000;
}
```

`src/lib/useLiveSnapshot.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api.ts';
import type { Subscribe } from './realtime.ts';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

export interface LiveSnapshot<T> {
  /** undefined until the first successful load; then always the latest good snapshot. */
  data: T | undefined;
  /** The last load's error, cleared by the next successful load. */
  error: string | null;
  status: LiveStatus;
  reload: () => void;
}

/**
 * Loads a snapshot and reloads it when the realtime channel (re)subscribes, when it delivers an
 * event, and every `pollMs` if given. Loads never overlap: events that arrive during a load cause
 * exactly one more load afterwards. `load` and `subscribe` must be stable (useCallback/useMemo).
 */
export function useLiveSnapshot<T>(load: () => Promise<T>, subscribe: Subscribe, pollMs?: number): LiveSnapshot<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // `generation` changes whenever the subscription restarts, so late answers for an old one are dropped.
  const loop = useRef({ generation: 0, running: false, again: false });

  const reload = useCallback(() => {
    const state = loop.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    void (async () => {
      try {
        do {
          state.again = false;
          const generation = state.generation;
          try {
            const next = await load();
            if (generation === state.generation) {
              setData(next);
              setError(null);
            }
          } catch (e) {
            if (generation === state.generation) setError(errorMessage(e));
          }
        } while (state.again);
      } finally {
        state.running = false;
      }
    })();
  }, [load]);

  useEffect(() => {
    const state = loop.current;
    const generation = ++state.generation;
    setStatus('connecting');
    reload();
    const stop = subscribe({
      onEvent: reload,
      onStatus: (channelStatus) => {
        if (generation !== state.generation) return;
        if (channelStatus === 'subscribed') {
          setStatus('live');
          reload(); // anything broadcast while we were (re)connecting was missed
        } else {
          setStatus('reconnecting');
        }
      },
    });
    const timer = pollMs ? setInterval(reload, pollMs) : undefined;
    return () => {
      state.generation++;
      stop();
      if (timer) clearInterval(timer);
    };
  }, [subscribe, pollMs, reload]);

  return { data, error, status, reload };
}
```

- [ ] **Step 4: Write the providers and shared components**

`src/lib/ApiProvider.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { Api } from './api.ts';

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi() must be used inside <ApiProvider>');
  return api;
}
```

`src/lib/ClockProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clockOffsetMs } from './clock.ts';

interface ClockValue {
  /** This device's clock, updated once a second. */
  nowMs: number;
  /** Add to nowMs to get server time. */
  offsetMs: number;
}

const ClockContext = createContext<ClockValue>({ nowMs: Date.now(), offsetMs: 0 });

interface ClockProviderProps {
  /** Must be stable (e.g. api.serverNow). */
  serverNow: () => Promise<string>;
  children: ReactNode;
  tickMs?: number;
  resyncMs?: number;
}

/** One ticking clock for every timer, synced with server_now() on mount and every 5 minutes. */
export function ClockProvider({ serverNow, children, tickMs = 1000, resyncMs = 5 * 60_000 }: ClockProviderProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const sentAt = Date.now();
      try {
        const server = await serverNow();
        if (active) {
          const receivedAt = Date.now();
          setOffsetMs(clockOffsetMs(sentAt, server, receivedAt));
          setNowMs(receivedAt);
        }
      } catch {
        // Keep the previous offset; timers keep running on this device's clock.
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), resyncMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [serverNow, resyncMs]);

  return <ClockContext.Provider value={{ nowMs, offsetMs }}>{children}</ClockContext.Provider>;
}

export function useClock(): ClockValue {
  return useContext(ClockContext);
}
```

`src/components/Timer.tsx`:

```tsx
import { useClock } from '../lib/ClockProvider.tsx';
import { elapsedMs, formatElapsed, isOverTarget } from '../lib/clock.ts';

interface TimerProps {
  startedAt: string;
  targetMinutes: number;
  /** Size and weight classes. Colours go in colorClassName / overClassName so they never conflict. */
  className?: string;
  colorClassName?: string;
  overClassName?: string;
}

/** Live interview timer on the server's clock; turns amber at the target length. */
export function Timer({ startedAt, targetMinutes, className = '', colorClassName = '', overClassName = 'text-amber-600' }: TimerProps) {
  const { nowMs, offsetMs } = useClock();
  const ms = elapsedMs(startedAt, nowMs, offsetMs);
  const over = isOverTarget(ms, targetMinutes);
  const text = formatElapsed(ms);
  return (
    <span
      className={`tabular-nums ${over ? overClassName : colorClassName} ${className}`}
      data-over-target={over ? 'true' : undefined}
      aria-label={over ? `${text}, over the ${targetMinutes} minute target` : text}
    >
      {text}
    </span>
  );
}
```

`src/components/Toasts.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  show: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

const TONE_CLASSES: Record<Tone, string> = {
  error: 'bg-red-700 text-white',
  success: 'bg-emerald-700 text-white',
  info: 'bg-slate-800 text-white',
};

/** Short messages in the corner. Errors stay 8 s, others 4 s; click to dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, tone: Tone = 'error') => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`rounded-lg px-4 py-3 text-left text-sm font-medium shadow-lg ${TONE_CLASSES[toast.tone]}`}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
```

`src/components/ActionProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { errorMessage } from '../lib/api.ts';
import { useToast } from './Toasts.tsx';

/** Runs an action; resolves to its result, or undefined if it failed (the failure is already shown). */
export type RunAction = <T>(action: () => Promise<T>) => Promise<T | undefined>;

const RunContext = createContext<RunAction>(async (action) => {
  try {
    return await action();
  } catch {
    return undefined;
  }
});

/**
 * Every button on a screen runs its action through here: a failure shows the server's message as a
 * toast, and either way `onSettled` runs (screens pass their snapshot reload).
 */
export function ActionProvider({ onSettled, children }: { onSettled?: () => void; children: ReactNode }) {
  const toast = useToast();
  const run = useCallback<RunAction>(
    async (action) => {
      try {
        return await action();
      } catch (e) {
        toast.show(errorMessage(e), 'error');
        return undefined;
      } finally {
        onSettled?.();
      }
    },
    [toast, onSettled],
  );
  return <RunContext.Provider value={run}>{children}</RunContext.Provider>;
}

export function useRunAction(): RunAction {
  return useContext(RunContext);
}
```

`src/components/ActionButton.tsx`:

```tsx
import { useRef, useState, type ReactNode } from 'react';
import { useRunAction } from './ActionProvider.tsx';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClasses(variant: ButtonVariant = 'secondary', size: 'sm' | 'md' = 'sm'): string {
  const sizing = size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-10 px-4 text-sm';
  return `inline-flex shrink-0 items-center justify-center gap-1 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]}`;
}

interface ActionButtonProps {
  action: () => Promise<unknown>;
  children: ReactNode;
  /** Asks first. For actions that are awkward to undo. */
  confirm?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Accessible name, for buttons whose text is an arrow. Also the tooltip. */
  label?: string;
  className?: string;
}

/** Runs one server action and is disabled while it runs, so a double click does nothing. */
export function ActionButton({ action, children, confirm, variant, size, disabled, label, className = '' }: ActionButtonProps) {
  const run = useRunAction();
  const busy = useRef(false); // a ref, not state: two clicks in the same tick must still run once
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (busy.current) return;
    if (confirm && !window.confirm(confirm)) return;
    busy.current = true;
    setPending(true);
    try {
      await run(action);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
    >
      {children}
    </button>
  );
}
```

`src/components/ConnectionBanner.tsx`:

```tsx
import type { LiveStatus } from '../lib/useLiveSnapshot.ts';

export function ConnectionBanner({ status }: { status: LiveStatus }) {
  if (status !== 'reconnecting') return null;
  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
      Reconnecting… The board will catch up as soon as the connection is back.
    </div>
  );
}
```

`src/components/FullPageMessage.tsx`:

```tsx
import type { ReactNode } from 'react';

export function FullPageMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {children && <div className="text-sm text-slate-600">{children}</div>}
    </main>
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm run test:unit && npm run typecheck`
Expected: `Tests  47 passed (47)`, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clock.ts src/lib/useLiveSnapshot.ts src/lib/ClockProvider.tsx src/lib/ApiProvider.tsx src/components \
  tests/unit/web/clock.test.ts tests/unit/web/useLiveSnapshot.test.tsx tests/unit/web/timer.test.tsx tests/unit/web/actionButton.test.tsx
git commit -m "feat(web): server-synced timers, live snapshots, toasts and single-run action buttons"
```

---

### Task 5: Login, role routing and the staff layout

**Files:**
- Create:
  - `src/auth/authBackend.ts`, `src/auth/AuthProvider.tsx`
  - `src/app/homePath.ts`, `src/app/LoginPage.tsx`, `src/app/StaffLayout.tsx`, `src/app/RequireRole.tsx`, `src/app/placeholders.tsx`, `src/app/AppProviders.tsx`, `src/app/routes.tsx`
- Modify: `src/main.tsx` (replaces the Task 1 placeholder)
- Test: `tests/unit/web/fixtures.ts`, `tests/unit/web/helpers.tsx`, `tests/unit/web/auth.test.tsx`, `tests/unit/web/routing.test.tsx`

**Interfaces:**
- Consumes:
  - `usernameToEmail` (Plan 1)
  - `Api`, `NETWORK_ERROR` and `notAllowed` (Task 3)
  - `ToastProvider`, `ClockProvider`, `ApiProvider`, `buttonClasses` and `FullPageMessage` (Task 4)
- Produces:
  - From `authBackend.ts`: `interface AuthBackend { currentUserId(); onUserChange(listener) → stop; signIn(username, password) → message | null; signOut(); loadProfile(userId) → Profile | null }`, `supabaseAuthBackend(client)` and `loginErrorMessage(error)`
  - From `AuthProvider.tsx`:
    - `<AuthProvider backend>` and `useAuth(): { state: AuthState; signIn; signOut }`
    - `type AuthState = { status: 'loading' } | { status: 'signed_out'; notice: string | null } | { status: 'signed_in'; profile: Profile }`
    - `DISABLED_NOTICE`
  - From `homePath.ts`: `homePath(role)`, `safeNext(next)` and `ROLE_LABELS`
  - `<AppProviders api auth>`
  - `routes: RouteObject[]`: `/login`, `/display`, and `/` containing the index route, `queue`, `panel` and `admin`, plus a catch-all `*`
  - `ComingSoon`, `AdminHome`, `HomeRedirect` and `NotFound`
  - Test helpers:
    - `fakeTopic()`, `fakeApi(overrides?): FakeApi` (with `.topics.board` and `.topics.display`)
    - `fakeAuth({ signedInAs?, accounts? }): { backend, profiles }`
    - `renderApp(path, { api?, auth? }): { router, api, … }`
    - Fixture builders `lane`, `interview`, `boardPanel`, `board`, `display` and `profile`

- [ ] **Step 1: Write the test fixtures and helpers**

`tests/unit/web/fixtures.ts`:

```ts
// Test data shaped like the database functions' output (see src/lib/types.ts).
import type { BoardPanel, BoardSnapshot, CurrentInterview, DisplaySnapshot, LaneEntry, Profile, Role } from '../../../src/lib/types.ts';

const reg = (number: number) => `2025${String(number).padStart(3, '0')}`;

export function lane(...people: Array<[number, string]>): LaneEntry[] {
  return people.map(([number, name], i) => ({
    candidate_id: `c${number}`,
    number,
    name,
    reg_number: reg(number),
    position: i + 1,
    skip_count: 0,
    checked_in_at: '2026-09-26T09:00:00Z',
  }));
}

export function interview(number: number, name: string, startedAt = '2026-09-26T09:50:00Z'): CurrentInterview {
  return { interview_id: `i${number}`, candidate_id: `c${number}`, number, name, reg_number: reg(number), started_at: startedAt };
}

export function boardPanel(id: string, name: string, overrides: Partial<BoardPanel> = {}): BoardPanel {
  return { id, name, is_default: false, current: null, last_ended: null, lane: [], panelists: [], ...overrides };
}

/** Panel 1 busy with #7, Panel 2 free with #12 lined up, three people in the pool. */
export function board(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    induction: { id: 'ind-1', name: 'Fall 2026', target_interview_minutes: 15, results_published: false },
    server_time: '2026-09-26T10:00:00Z',
    counts: { registered: 40, waiting: 4, interviewing: 1, interviewed: 16 },
    panels: [
      boardPanel('p1', 'Panel 1', { is_default: true, current: interview(7, 'Sara Ahmed'), panelists: [{ id: 'u1', display_name: 'Hamza' }, { id: 'u2', display_name: 'Mariam' }] }),
      boardPanel('p2', 'Panel 2', { is_default: true, lane: lane([12, 'Ali Raza']) }),
    ],
    pool: lane([20, 'Bilal Khan'], [21, 'عائشہ خان'], [22, "Zara O'Brien-Khan"]),
    ...overrides,
  };
}

/** The projector's view of the same moment. */
export function display(overrides: Partial<DisplaySnapshot> = {}): DisplaySnapshot {
  return {
    induction_name: 'Fall 2026',
    target_interview_minutes: 15,
    server_time: '2026-09-26T10:00:00Z',
    panels: [
      { id: 'p1', name: 'Panel 1', current: { number: 7, name: 'Sara Ahmed', started_at: '2026-09-26T09:50:00Z' }, lined_up: [] },
      { id: 'p2', name: 'Panel 2', current: null, lined_up: [{ number: 12, name: 'Ali Raza' }] },
    ],
    waiting: [
      { number: 20, name: 'Bilal Khan' },
      { number: 21, name: 'عائشہ خان' },
      { number: 22, name: "Zara O'Brien-Khan" },
    ],
    ...overrides,
  };
}

export function profile(role: Role, overrides: Partial<Profile> = {}): Profile {
  const username = role === 'queue_manager' ? 'queue' : role;
  return { id: `u-${username}`, username, display_name: `Test ${username}`, role, is_active: true, current_panel_id: null, ...overrides };
}
```

`tests/unit/web/helpers.tsx`:

```tsx
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders } from '../../../src/app/AppProviders.tsx';
import { routes } from '../../../src/app/routes.tsx';
import type { AuthBackend } from '../../../src/auth/authBackend.ts';
import type { Api } from '../../../src/lib/api.ts';
import type { ChannelStatus, Subscribe } from '../../../src/lib/realtime.ts';
import type { Profile } from '../../../src/lib/types.ts';
import { board, display } from './fixtures.ts';

/** A realtime topic the test drives by hand. */
export function fakeTopic() {
  const listeners = new Set<Parameters<Subscribe>[0]>();
  const subscribe: Subscribe = (handlers) => {
    listeners.add(handlers);
    return () => listeners.delete(handlers);
  };
  return {
    subscribe,
    event: () => listeners.forEach((l) => l.onEvent()),
    status: (status: ChannelStatus) => listeners.forEach((l) => l.onStatus(status)),
    get listening() {
      return listeners.size;
    },
  };
}

export type FakeApi = Api & { topics: { board: ReturnType<typeof fakeTopic>; display: ReturnType<typeof fakeTopic> } };

/** Every Api method as a vi.fn with a sensible default; override any of them. */
export function fakeApi(overrides: Partial<Api> = {}): FakeApi {
  const topics = { board: fakeTopic(), display: fakeTopic() };
  const api: Api = {
    boardSnapshot: vi.fn(async () => board()),
    displaySnapshot: vi.fn(async () => display()),
    serverNow: vi.fn(async () => new Date().toISOString()),
    listCandidates: vi.fn(async () => []),
    getDisplayKey: vi.fn(async () => 'test-key'),
    checkIn: vi.fn(async () => {}),
    undoCheckIn: vi.fn(async () => {}),
    moveCandidate: vi.fn(async () => {}),
    skipCandidate: vi.fn(async () => {}),
    sendIn: vi.fn(async () => 'i-new'),
    undoSendIn: vi.fn(async () => {}),
    endInterview: vi.fn(async () => {}),
    reopenInterview: vi.fn(async () => {}),
    addPanel: vi.fn(async () => 'p-new'),
    deletePanel: vi.fn(async () => {}),
    importCandidates: vi.fn(async () => ({ added: 0, updated: 0, flagged: [] })),
    subscribeBoard: vi.fn(() => topics.board.subscribe),
    subscribeDisplay: vi.fn(() => topics.display.subscribe),
    ...overrides,
  };
  return Object.assign(api, { topics });
}

/** An in-memory Supabase Auth: `accounts` can sign in; `signedInAs` starts with a session. */
export function fakeAuth(options: { signedInAs?: Profile; accounts?: Record<string, { password: string; profile: Profile }> } = {}) {
  let userId: string | null = options.signedInAs?.id ?? null;
  const profiles = new Map<string, Profile>();
  if (options.signedInAs) profiles.set(options.signedInAs.id, options.signedInAs);
  for (const account of Object.values(options.accounts ?? {})) profiles.set(account.profile.id, account.profile);
  const listeners = new Set<(id: string | null) => void>();
  const backend: AuthBackend = {
    currentUserId: async () => userId,
    onUserChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signIn: async (username, password) => {
      const account = options.accounts?.[username];
      if (!account || account.password !== password) return 'Wrong username or password.';
      userId = account.profile.id;
      listeners.forEach((l) => l(userId));
      return null;
    },
    signOut: vi.fn(async () => {
      userId = null;
      listeners.forEach((l) => l(null));
    }),
    loadProfile: async (id) => profiles.get(id) ?? null,
  };
  return { backend, profiles };
}

/** Renders the real routes at `path` with fake Supabase pieces. */
export function renderApp(path: string, { api = fakeApi(), auth = fakeAuth().backend }: { api?: Api; auth?: AuthBackend } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <AppProviders api={api} auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, api };
}
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/web/auth.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthProvider, DISABLED_NOTICE, useAuth } from '../../../src/auth/AuthProvider.tsx';
import { loginErrorMessage } from '../../../src/auth/authBackend.ts';
import { NETWORK_ERROR } from '../../../src/lib/api.ts';
import { notAllowed } from '../../../src/lib/notAllowed.ts';
import { profile } from './fixtures.ts';
import { fakeAuth } from './helpers.tsx';

function Status() {
  const { state } = useAuth();
  const text =
    state.status === 'signed_in' ? `in:${state.profile.username}` : state.status === 'signed_out' ? `out:${state.notice ?? ''}` : 'loading';
  return <p data-testid="auth">{text}</p>;
}

function renderAuth(backend: ReturnType<typeof fakeAuth>['backend']) {
  render(
    <AuthProvider backend={backend}>
      <Status />
    </AuthProvider>,
  );
  return () => screen.getByTestId('auth').textContent;
}

describe('AuthProvider', () => {
  it('is signed out without a session', async () => {
    const status = renderAuth(fakeAuth().backend);
    expect(await screen.findByText('out:')).toBeInTheDocument();
    expect(status()).toBe('out:');
  });

  it('restores a session with its profile', async () => {
    renderAuth(fakeAuth({ signedInAs: profile('queue_manager') }).backend);
    expect(await screen.findByText('in:queue')).toBeInTheDocument();
  });

  it('signs out a disabled account and says why', async () => {
    const { backend } = fakeAuth({ signedInAs: profile('panelist', { is_active: false }) });
    renderAuth(backend);
    expect(await screen.findByText(`out:${DISABLED_NOTICE}`)).toBeInTheDocument();
    expect(backend.signOut).toHaveBeenCalled();
  });

  it('re-checks the account when the server says "Not allowed"', async () => {
    const { backend, profiles } = fakeAuth({ signedInAs: profile('queue_manager') });
    renderAuth(backend);
    await screen.findByText('in:queue');

    profiles.delete('u-queue'); // disabled accounts can no longer read their profile
    await act(async () => notAllowed.emit());
    expect(await screen.findByText(`out:${DISABLED_NOTICE}`)).toBeInTheDocument();
  });
});

describe('loginErrorMessage', () => {
  it('explains the common sign-in failures', () => {
    expect(loginErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Wrong username or password.');
    expect(loginErrorMessage({ code: 'user_banned', message: 'User is banned' })).toBe('This account is disabled. Ask an admin.');
    expect(loginErrorMessage({ message: 'TypeError: Failed to fetch', status: 0 })).toBe(NETWORK_ERROR);
  });
});
```

`tests/unit/web/routing.test.tsx`:

```tsx
// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { profile } from './fixtures.ts';
import { fakeAuth, renderApp } from './helpers.tsx';

const accounts = {
  queue: { password: 'right-password', profile: profile('queue_manager') },
  panelist: { password: 'right-password', profile: profile('panelist') },
};

async function signIn(username: string, password = 'right-password') {
  await userEvent.type(await screen.findByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('sign in and routing', () => {
  it('sends a signed-out visitor to the login page and back after signing in', async () => {
    const { router } = renderApp('/queue', { auth: fakeAuth({ accounts }).backend });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Fqueue');

    await signIn('queue');
    await waitFor(() => expect(router.state.location.pathname).toBe('/queue'));
  });

  it('shows why a sign-in failed', async () => {
    renderApp('/login', { auth: fakeAuth({ accounts }).backend });
    await signIn('queue', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  });

  it("sends each role to its own screen and ignores off-site ?next= targets", async () => {
    const { router } = renderApp('/login?next=//evil.example', { auth: fakeAuth({ accounts }).backend });
    await signIn('panelist');
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'));
  });

  it("keeps a role out of another role's screen", async () => {
    renderApp('/queue', { auth: fakeAuth({ signedInAs: profile('panelist') }).backend });
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('lets an admin open every screen and sign out', async () => {
    const { router } = renderApp('/', { auth: fakeAuth({ signedInAs: profile('admin') }).backend });
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    const nav = screen.getByRole('navigation', { name: 'Screens' });
    expect(nav).toHaveTextContent('QueuePanelAdmin');
    expect(await screen.findByText('http://localhost:3000/display?key=test-key')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run tests/unit/web/auth.test.tsx tests/unit/web/routing.test.tsx`
Expected: FAIL. `../../../src/auth/AuthProvider.tsx` and `../../../src/app/AppProviders.tsx` cannot be resolved yet.

- [ ] **Step 4: Write the auth layer**

`src/auth/authBackend.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../../supabase/functions/_shared/accounts.ts';
import { NETWORK_ERROR } from '../lib/api.ts';
import type { Profile } from '../lib/types.ts';

/** What the auth layer needs from Supabase Auth; tests pass a fake. */
export interface AuthBackend {
  currentUserId(): Promise<string | null>;
  /** Called with the new user id (or null) after sign-in, sign-out and token refreshes. */
  onUserChange(listener: (userId: string | null) => void): () => void;
  /** Resolves to a message to show, or null on success. */
  signIn(username: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  /** null when the profile is missing or not readable (a disabled account can't read profiles). */
  loadProfile(userId: string): Promise<Profile | null>;
}

export function loginErrorMessage(error: { message?: string; code?: string; status?: number }): string {
  const message = error.message ?? '';
  if (error.code === 'user_banned' || /banned/i.test(message)) return 'This account is disabled. Ask an admin.';
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'Wrong username or password.';
  if (error.status === 0 || /failed to fetch|fetch failed|networkerror/i.test(message)) return NETWORK_ERROR;
  return message || 'Could not sign in.';
}

export function supabaseAuthBackend(client: SupabaseClient): AuthBackend {
  return {
    async currentUserId() {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },
    onUserChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase calls made inside this callback can deadlock the auth client, so defer.
        setTimeout(() => listener(session?.user.id ?? null), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(username, password) {
      try {
        const { error } = await client.auth.signInWithPassword({ email: usernameToEmail(username), password });
        return error ? loginErrorMessage(error) : null;
      } catch {
        return NETWORK_ERROR;
      }
    },
    async signOut() {
      // 'local' clears this browser's session without a network call, so it works offline and for banned users.
      await client.auth.signOut({ scope: 'local' });
    },
    async loadProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('id, username, display_name, role, is_active, current_panel_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Profile | null) ?? null;
    },
  };
}
```

`src/auth/AuthProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NETWORK_ERROR } from '../lib/api.ts';
import { notAllowed } from '../lib/notAllowed.ts';
import type { Profile } from '../lib/types.ts';
import type { AuthBackend } from './authBackend.ts';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; notice: string | null }
  | { status: 'signed_in'; profile: Profile };

interface AuthContextValue {
  state: AuthState;
  /** Resolves to a message to show, or null once signed in. */
  signIn(username: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

export const DISABLED_NOTICE = 'This account is disabled or has no role. Ask an admin.';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ backend, children }: { backend: AuthBackend; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const latest = useRef(0); // only the newest resolution may change the state

  const resolve = useCallback(
    async (userId: string | null) => {
      const mine = ++latest.current;
      if (!userId) {
        setState((current) => (current.status === 'signed_out' ? current : { status: 'signed_out', notice: null }));
        return;
      }
      let profile: Profile | null;
      try {
        profile = await backend.loadProfile(userId);
      } catch {
        if (mine === latest.current) {
          setState((current) => (current.status === 'loading' ? { status: 'signed_out', notice: NETWORK_ERROR } : current));
        }
        return;
      }
      if (mine !== latest.current) return;
      if (!profile || !profile.is_active) {
        setState({ status: 'signed_out', notice: DISABLED_NOTICE });
        void backend.signOut();
        return;
      }
      setState({ status: 'signed_in', profile });
    },
    [backend],
  );

  useEffect(() => {
    backend.currentUserId().then(resolve, () => setState({ status: 'signed_out', notice: NETWORK_ERROR }));
    const stopAuth = backend.onUserChange((userId) => void resolve(userId));
    // "Not allowed" from any action or read: the account may have just been disabled. Check again.
    const stopNotAllowed = notAllowed.subscribe(() => void backend.currentUserId().then(resolve));
    return () => {
      stopAuth();
      stopNotAllowed();
    };
  }, [backend, resolve]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const error = await backend.signIn(username, password);
      if (!error) await resolve(await backend.currentUserId());
      return error;
    },
    [backend, resolve],
  );

  const signOut = useCallback(async () => {
    latest.current++;
    setState({ status: 'signed_out', notice: null });
    await backend.signOut();
  }, [backend]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>');
  return value;
}
```

- [ ] **Step 5: Write the pages, layout and routes**

`src/app/homePath.ts`:

```ts
import type { Role } from '../lib/types.ts';

export function homePath(role: Role): string {
  if (role === 'queue_manager') return '/queue';
  if (role === 'panelist') return '/panel';
  return '/admin';
}

/** A ?next= target, only if it is a path on this site (never "//other.site" or the login page). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/login')) return null;
  return next;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  queue_manager: 'Queue manager',
  panelist: 'Panelist',
};
```

`src/app/LoginPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { buttonClasses } from '../components/ActionButton.tsx';
import { homePath, safeNext } from './homePath.ts';

export function LoginPage() {
  const { state, signIn } = useAuth();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · MLSA Induction';
  }, []);

  if (state.status === 'signed_in') {
    return <Navigate to={safeNext(params.get('next')) ?? homePath(state.profile.role)} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const message = await signIn(username, password);
    setPending(false);
    if (message) setError(message);
  }

  const message = error ?? (state.status === 'signed_out' ? state.notice : null);
  const inputClasses = 'mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={onSubmit} aria-labelledby="login-title" className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="text-sm font-semibold text-brand-600">Microsoft Club GIKI</p>
          <h1 id="login-title" className="text-xl font-semibold">Induction sign in</h1>
        </div>
        {message && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {message}
          </p>
        )}
        <label className="block text-sm font-medium">
          Username
          <input
            className={inputClasses}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input className={inputClasses} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={pending || state.status === 'loading'} className={`${buttonClasses('primary', 'md')} w-full`}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
```

`src/app/StaffLayout.tsx`:

```tsx
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { buttonClasses } from '../components/ActionButton.tsx';
import { FullPageMessage } from '../components/FullPageMessage.tsx';
import type { Role } from '../lib/types.ts';
import { ROLE_LABELS } from './homePath.ts';

const NAV: Array<{ to: string; label: string; roles: Role[] }> = [
  { to: '/queue', label: 'Queue', roles: ['queue_manager', 'admin'] },
  { to: '/panel', label: 'Panel', roles: ['panelist', 'admin'] },
  { to: '/admin', label: 'Admin', roles: ['admin'] },
];

/** Every signed-in screen: requires a login, shows who is signed in, and links the screens this role can open. */
export function StaffLayout() {
  const { state, signOut } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <FullPageMessage title="Loading…" />;
  if (state.status === 'signed_out') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  const { profile } = state;
  const links = NAV.filter((link) => link.roles.includes(profile.role));
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-slate-200 bg-white px-4">
        <span className="font-semibold">MLSA Induction</span>
        {links.length > 1 && (
          <nav aria-label="Screens" className="flex gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-slate-600 sm:inline">
            {profile.display_name} · {ROLE_LABELS[profile.role]}
          </span>
          <button type="button" onClick={() => void signOut()} className={buttonClasses('ghost')}>
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
```

`src/app/RequireRole.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { FullPageMessage } from '../components/FullPageMessage.tsx';
import type { Role } from '../lib/types.ts';
import { homePath } from './homePath.ts';

/** Inside StaffLayout (which handles loading and signed-out): shows the page only to these roles. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== 'signed_in') return null;
  if (!roles.includes(state.profile.role)) {
    return (
      <FullPageMessage title="You don't have access to this page">
        <Link className="font-medium text-brand-600 underline" to={homePath(state.profile.role)}>
          Go to your screen
        </Link>
      </FullPageMessage>
    );
  }
  return <>{children}</>;
}
```

`src/app/placeholders.tsx`:

```tsx
// Screens that arrive in Plan 3 (/panel and the full /admin). The admin page already offers the
// projector link, which the queue manager needs on induction day.
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { buttonClasses } from '../components/ActionButton.tsx';
import { FullPageMessage } from '../components/FullPageMessage.tsx';
import { useToast } from '../components/Toasts.tsx';
import { errorMessage } from '../lib/api.ts';
import { useApi } from '../lib/ApiProvider.tsx';
import { homePath } from './homePath.ts';

export function HomeRedirect() {
  const { state } = useAuth();
  return state.status === 'signed_in' ? <Navigate to={homePath(state.profile.role)} replace /> : null;
}

export function ComingSoon({ title }: { title: string }) {
  return <FullPageMessage title={title}>This screen arrives in the next update.</FullPageMessage>;
}

export function AdminHome() {
  const api = useApi();
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getDisplayKey().then(
      (key) => active && setLink(`${window.location.origin}/display?key=${encodeURIComponent(key)}`),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [api]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Projector link copied', 'success');
    } catch {
      toast.show('Copy failed. Select the link and copy it by hand.', 'error');
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Admin</h1>
      <p className="text-slate-600">
        Accounts, settings and results arrive in the next update. Meanwhile, run the day from the{' '}
        <Link className="font-medium text-brand-600 underline" to="/queue">
          queue board
        </Link>
        .
      </p>
      <section aria-labelledby="projector-title" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="projector-title" className="font-semibold">Projector link</h2>
        {link ? (
          <>
            <p className="rounded-md bg-slate-100 px-3 py-2 font-mono text-sm break-all">{link}</p>
            <div className="flex gap-2">
              <button type="button" className={buttonClasses('primary')} onClick={() => void copy(link)}>
                Copy link
              </button>
              <a className={buttonClasses('secondary')} href={link} target="_blank" rel="noreferrer">
                Open projector
              </a>
            </div>
          </>
        ) : error ? (
          <p role="alert" className="text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
        <p className="text-sm text-slate-600">Anyone with this link sees the projector screen. Share it only with whoever runs the projector.</p>
      </section>
    </main>
  );
}

export function NotFound() {
  return (
    <FullPageMessage title="Page not found">
      <Link className="font-medium text-brand-600 underline" to="/">
        Go home
      </Link>
    </FullPageMessage>
  );
}
```

`src/app/AppProviders.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import type { AuthBackend } from '../auth/authBackend.ts';
import { ToastProvider } from '../components/Toasts.tsx';
import type { Api } from '../lib/api.ts';
import { ApiProvider } from '../lib/ApiProvider.tsx';
import { ClockProvider } from '../lib/ClockProvider.tsx';

/** Everything a screen can rely on. main.tsx passes the real Supabase-backed pieces; tests pass fakes. */
export function AppProviders({ api, auth, children }: { api: Api; auth: AuthBackend; children: ReactNode }) {
  return (
    <ApiProvider api={api}>
      <AuthProvider backend={auth}>
        <ToastProvider>
          <ClockProvider serverNow={api.serverNow}>{children}</ClockProvider>
        </ToastProvider>
      </AuthProvider>
    </ApiProvider>
  );
}
```

`src/app/routes.tsx` (`/queue` and `/display` are placeholders until Tasks 8 and 9):

```tsx
import type { RouteObject } from 'react-router';
import { LoginPage } from './LoginPage.tsx';
import { AdminHome, ComingSoon, HomeRedirect, NotFound } from './placeholders.tsx';
import { RequireRole } from './RequireRole.tsx';
import { StaffLayout } from './StaffLayout.tsx';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/display', element: <ComingSoon title="Projector" /> },
  {
    path: '/',
    element: <StaffLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'queue', element: <RequireRole roles={['queue_manager', 'admin']}><ComingSoon title="Queue board" /></RequireRole> },
      { path: 'panel', element: <RequireRole roles={['panelist', 'admin']}><ComingSoon title="Panelist screen" /></RequireRole> },
      { path: 'admin', element: <RequireRole roles={['admin']}><AdminHome /></RequireRole> },
    ],
  },
  { path: '*', element: <NotFound /> },
];
```

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppProviders } from './app/AppProviders.tsx';
import { routes } from './app/routes.tsx';
import { supabaseAuthBackend } from './auth/authBackend.ts';
import './index.css';
import { createApi } from './lib/api.ts';
import { supabase } from './lib/supabase.ts';

const api = createApi(supabase);
const auth = supabaseAuthBackend(supabase);
const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders api={api} auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npm run test:unit && npm run typecheck && npm run build`
Expected:
- `Tests  57 passed (57)`
- `tsc` prints nothing.
- The build ends with `✓ built in …`.

- [ ] **Step 7: Commit**

```bash
git add src/auth src/app src/main.tsx tests/unit/web/fixtures.ts tests/unit/web/helpers.tsx tests/unit/web/auth.test.tsx tests/unit/web/routing.test.tsx
git commit -m "feat(web): username login, role routing, staff layout and the admin projector link"
```

---

### Task 6: Queue decisions and the panel card

**Files:**
- Create: `src/queue/queueView.ts`, `src/queue/bits.tsx`, `src/queue/PanelCard.tsx`
- Test: `tests/unit/web/queueView.test.ts`, `tests/unit/web/panelCard.test.tsx`

**Interfaces:**
- Consumes:
  - `BoardSnapshot`, `BoardPanel`, `LaneEntry`, `CandidateSummary` and `Role` (Task 1)
  - `useApi` and `ActionButton` (Task 4); `Timer` (Task 4)
- Produces:
  - `poolHint(board): { candidateId; panelId; panelName } | null`
  - `freePanels(board): BoardPanel[]`
  - `canDeletePanel(panel, role): boolean`
  - `describeLocation(board, candidate): string`
  - `searchCandidates(list, query, limit = 20): CandidateSummary[]`
  - `<CandidateName number name className?>`, `<SkipBadge count>` and `<MoveButtons entry laneId laneLength>`
  - `<PanelCard panel targetMinutes role>`, whose buttons are named `Send #N in to Panel X`, `Move #N up|down|to the top`, `Skip #N`, `Move #N back to the pool`, `End interview`, `Undo send-in`, `Reopen the interview with #N` and `Delete panel`

- [ ] **Step 1: Write the failing tests**

`tests/unit/web/queueView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CandidateSummary } from '../../../src/lib/types.ts';
import { canDeletePanel, describeLocation, freePanels, poolHint, searchCandidates } from '../../../src/queue/queueView.ts';
import { board, boardPanel, interview, lane } from './fixtures.ts';

const candidate = (number: number, full_name: string, status: CandidateSummary['status'], reg_number = `2025${number}`): CandidateSummary => ({
  id: `c${number}`,
  number,
  full_name,
  reg_number,
  status,
});

describe('poolHint', () => {
  it('pairs the first person in the pool with the first free panel that has nobody lined up', () => {
    const b = board({
      panels: [
        boardPanel('p1', 'Panel 1', { current: interview(7, 'Sara') }),
        boardPanel('p2', 'Panel 2', { lane: lane([12, 'Ali']) }),
        boardPanel('p3', 'Panel 3'),
      ],
    });
    expect(poolHint(b)).toEqual({ candidateId: 'c20', panelId: 'p3', panelName: 'Panel 3' });
  });

  it('has no hint when every free panel has someone lined up, or the pool is empty', () => {
    expect(poolHint(board())).toBeNull();
    expect(poolHint(board({ panels: [boardPanel('p3', 'Panel 3')], pool: [] }))).toBeNull();
  });
});

describe('freePanels and canDeletePanel', () => {
  it('lists panels without an interview in progress', () => {
    expect(freePanels(board()).map((p) => p.id)).toEqual(['p2']);
  });

  it('lets admins remove any panel and the queue manager only extra ones', () => {
    const defaultPanel = boardPanel('p1', 'Panel 1', { is_default: true });
    const extraPanel = boardPanel('p3', 'Panel 3');
    expect(canDeletePanel(defaultPanel, 'admin')).toBe(true);
    expect(canDeletePanel(defaultPanel, 'queue_manager')).toBe(false);
    expect(canDeletePanel(extraPanel, 'queue_manager')).toBe(true);
    expect(canDeletePanel(extraPanel, 'panelist')).toBe(false);
  });
});

describe('describeLocation', () => {
  it('says where each candidate is on the board', () => {
    const b = board();
    expect(describeLocation(b, candidate(5, 'Not Here', 'registered'))).toBe('Not checked in');
    expect(describeLocation(b, candidate(21, 'عائشہ خان', 'waiting'))).toBe('Waiting · pool #2');
    expect(describeLocation(b, candidate(12, 'Ali Raza', 'waiting'))).toBe('Waiting · lined up for Panel 2 (#1)');
    expect(describeLocation(b, candidate(7, 'Sara Ahmed', 'interviewing'))).toBe('Interviewing in Panel 1');
    expect(describeLocation(b, candidate(3, 'Done', 'interviewed'))).toBe('Interviewed');
  });
});

describe('searchCandidates', () => {
  const list = [
    candidate(1, 'Ali Raza', 'registered', '2025112'),
    candidate(12, 'Bilal Khan', 'waiting', '2025200'),
    candidate(40, 'عائشہ خان', 'registered', '2025102'),
    candidate(41, "Zara O'Brien-Khan", 'interviewed', 'U2025041'),
  ];

  it('matches an exact number first, then reg numbers containing it', () => {
    expect(searchCandidates(list, '12').map((c) => c.number)).toEqual([12, 1]);
    expect(searchCandidates(list, '#40').map((c) => c.number)).toEqual([40]);
  });

  it('matches names in any case and script, and reg numbers typed with spaces or lowercase', () => {
    expect(searchCandidates(list, 'KHAN').map((c) => c.number)).toEqual([12, 41]);
    expect(searchCandidates(list, 'عائشہ').map((c) => c.number)).toEqual([40]);
    expect(searchCandidates(list, "o'brien").map((c) => c.number)).toEqual([41]);
    expect(searchCandidates(list, ' 2025 102 ').map((c) => c.number)).toEqual([40]);
    expect(searchCandidates(list, 'u2025041').map((c) => c.number)).toEqual([41]);
  });

  it('returns nothing for a blank query and caps the list', () => {
    expect(searchCandidates(list, '   ')).toEqual([]);
    expect(searchCandidates(list, 'a', 2)).toHaveLength(2);
  });
});
```

`tests/unit/web/panelCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionProvider } from '../../../src/components/ActionProvider.tsx';
import { ToastProvider } from '../../../src/components/Toasts.tsx';
import { ApiProvider } from '../../../src/lib/ApiProvider.tsx';
import { ClockProvider } from '../../../src/lib/ClockProvider.tsx';
import type { BoardPanel, Role } from '../../../src/lib/types.ts';
import { PanelCard } from '../../../src/queue/PanelCard.tsx';
import { boardPanel, interview, lane } from './fixtures.ts';
import { fakeApi } from './helpers.tsx';

function renderCard(panel: BoardPanel, role: Role = 'queue_manager') {
  const api = fakeApi();
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <ClockProvider serverNow={api.serverNow}>
          <ActionProvider>
            <PanelCard panel={panel} targetMinutes={15} role={role} />
          </ActionProvider>
        </ClockProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { api, card: screen.getByRole('region', { name: panel.name }) };
}

describe('PanelCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers Send in for the first person lined up while the panel is free', async () => {
    const { api, card } = renderCard(boardPanel('p2', 'Panel 2', { lane: lane([12, 'Ali Raza'], [13, 'Hina']) }));
    expect(within(card).getByText('Free')).toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: /^Send #\d+ in/ })).toHaveLength(1);

    await userEvent.click(within(card).getByRole('button', { name: 'Send #12 in to Panel 2' }));
    expect(api.sendIn).toHaveBeenCalledWith('c12', 'p2');
  });

  it('shows the interview in progress with end and undo, and no Send in', async () => {
    const { api, card } = renderCard(
      boardPanel('p1', 'Panel 1', {
        current: interview(7, 'Sara Ahmed'),
        lane: lane([12, 'Ali Raza']),
        panelists: [{ id: 'u1', display_name: 'Hamza' }],
      }),
    );
    expect(within(card).getByText('Busy')).toBeInTheDocument();
    expect(within(card).getByText('Sara Ahmed')).toBeInTheDocument();
    expect(within(card).getByText('Present: Hamza')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /^Send #/ })).toBeNull();

    await userEvent.click(within(card).getByRole('button', { name: 'End interview' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Undo send-in' }));
    expect(api.endInterview).toHaveBeenCalledWith('i7');
    expect(api.undoSendIn).toHaveBeenCalledWith('i7');
  });

  it('offers Reopen for the last interview while the panel is free', async () => {
    const { api, card } = renderCard(
      boardPanel('p1', 'Panel 1', {
        last_ended: { interview_id: 'i6', candidate_id: 'c6', number: 6, name: 'Omar', ended_at: '2026-09-26T09:40:00Z' },
      }),
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Reopen the interview with #6' }));
    expect(api.reopenInterview).toHaveBeenCalledWith('i6');
  });

  it('moves people within the lane, skips them, and sends them back to the top of the pool', async () => {
    const { api, card } = renderCard(boardPanel('p2', 'Panel 2', { lane: lane([12, 'Ali Raza'], [13, 'Hina']) }));
    expect(within(card).getByRole('button', { name: 'Move #12 up' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Move #13 down' })).toBeDisabled();

    await userEvent.click(within(card).getByRole('button', { name: 'Move #13 up' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Move #13 to the top' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Skip #12' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Move #12 back to the pool' }));
    expect(vi.mocked(api.moveCandidate).mock.calls).toEqual([
      ['c13', 'p2', 1],
      ['c13', 'p2', 1],
      ['c12', null, 1],
    ]);
    expect(api.skipCandidate).toHaveBeenCalledWith('c12');
  });

  it('lets the queue manager remove only extra panels, after confirming', async () => {
    renderCard(boardPanel('p1', 'Panel 1', { is_default: true }));
    expect(screen.queryByRole('button', { name: 'Delete panel' })).toBeNull();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { api, card } = renderCard(boardPanel('p3', 'Panel 3'));
    await userEvent.click(within(card).getByRole('button', { name: 'Delete panel' }));
    expect(window.confirm).toHaveBeenCalledWith('Delete Panel 3? Anyone lined up for it moves to the end of the pool.');
    expect(api.deletePanel).toHaveBeenCalledWith('p3');
  });

  it('lets an admin remove a default panel', () => {
    const { card } = renderCard(boardPanel('p1', 'Panel 1', { is_default: true }), 'admin');
    expect(within(card).getByRole('button', { name: 'Delete panel' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/web/queueView.test.ts tests/unit/web/panelCard.test.tsx`
Expected: FAIL. `../../../src/queue/queueView.ts` and `../../../src/queue/PanelCard.tsx` cannot be resolved yet.

- [ ] **Step 3: Write the queue decisions**

`src/queue/queueView.ts`:

```ts
// Pure decisions behind the queue board, kept out of the components so they are easy to test.
import type { BoardPanel, BoardSnapshot, CandidateSummary, Role } from '../lib/types.ts';

export interface PoolHint {
  candidateId: string;
  panelId: string;
  panelName: string;
}

/** A free panel with nobody lined up, paired with the first person in the pool (panels in board order). */
export function poolHint(board: BoardSnapshot): PoolHint | null {
  const first = board.pool[0];
  const panel = board.panels.find((p) => p.current === null && p.lane.length === 0);
  return first && panel ? { candidateId: first.candidate_id, panelId: panel.id, panelName: panel.name } : null;
}

export function freePanels(board: BoardSnapshot): BoardPanel[] {
  return board.panels.filter((panel) => panel.current === null);
}

/** Admins may remove any panel; the queue manager only the extra (non-default) ones. */
export function canDeletePanel(panel: BoardPanel, role: Role): boolean {
  return role === 'admin' || (role === 'queue_manager' && !panel.is_default);
}

/** Where a candidate is right now, for search results. */
export function describeLocation(board: BoardSnapshot, candidate: CandidateSummary): string {
  switch (candidate.status) {
    case 'registered':
      return 'Not checked in';
    case 'waiting': {
      const inPool = board.pool.find((e) => e.candidate_id === candidate.id);
      if (inPool) return `Waiting · pool #${inPool.position}`;
      for (const panel of board.panels) {
        const inLane = panel.lane.find((e) => e.candidate_id === candidate.id);
        if (inLane) return `Waiting · lined up for ${panel.name} (#${inLane.position})`;
      }
      return 'Waiting';
    }
    case 'interviewing': {
      const panel = board.panels.find((p) => p.current?.candidate_id === candidate.id);
      return panel ? `Interviewing in ${panel.name}` : 'Interviewing';
    }
    case 'interviewed':
      return 'Interviewed';
  }
}

/**
 * Finds candidates by number ("12" or "#12"), name (any case, any script) or reg number (spaces
 * and case ignored). An exact number match comes first, then everyone else by number.
 */
export function searchCandidates(list: CandidateSummary[], query: string, limit = 20): CandidateSummary[] {
  const q = query.trim();
  if (!q) return [];
  const exactNumber = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
  const reg = q.replace(/\s+/g, '').toUpperCase();
  const name = q.toLocaleLowerCase();
  return list
    .filter((c) => c.number === exactNumber || c.reg_number.includes(reg) || c.full_name.toLocaleLowerCase().includes(name))
    .sort((a, b) => Number(b.number === exactNumber) - Number(a.number === exactNumber) || a.number - b.number)
    .slice(0, limit);
}
```

- [ ] **Step 4: Write the shared bits and the panel card**

`src/queue/bits.tsx`:

```tsx
import { ActionButton } from '../components/ActionButton.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { LaneEntry } from '../lib/types.ts';

/** "#12 Ali Raza". <bdi> keeps an Urdu name from reordering the number around it. */
export function CandidateName({ number, name, className = '' }: { number: number; name: string; className?: string }) {
  return (
    <span className={`min-w-0 truncate ${className}`}>
      <span className="tabular-nums">#{number}</span> <bdi>{name}</bdi>
    </span>
  );
}

export function SkipBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800" title="Times skipped">
      skipped {count}×
    </span>
  );
}

/** ↑ ↓ ⤒ for one person in a lane (laneId null = the waiting pool). */
export function MoveButtons({ entry, laneId, laneLength }: { entry: LaneEntry; laneId: string | null; laneLength: number }) {
  const api = useApi();
  const who = `#${entry.number}`;
  const moveTo = (position: number) => () => api.moveCandidate(entry.candidate_id, laneId, position);
  return (
    <>
      <ActionButton className="w-8" label={`Move ${who} up`} disabled={entry.position === 1} action={moveTo(entry.position - 1)}>
        <span className="text-base leading-none">↑</span>
      </ActionButton>
      <ActionButton className="w-8" label={`Move ${who} down`} disabled={entry.position === laneLength} action={moveTo(entry.position + 1)}>
        <span className="text-base leading-none">↓</span>
      </ActionButton>
      <ActionButton className="w-8" label={`Move ${who} to the top`} disabled={entry.position === 1} action={moveTo(1)}>
        <span className="text-base leading-none">⤒</span>
      </ActionButton>
    </>
  );
}
```

`src/queue/PanelCard.tsx`:

```tsx
import { ActionButton } from '../components/ActionButton.tsx';
import { Timer } from '../components/Timer.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { BoardPanel, Role } from '../lib/types.ts';
import { CandidateName, MoveButtons, SkipBadge } from './bits.tsx';
import { canDeletePanel } from './queueView.ts';

interface PanelCardProps {
  panel: BoardPanel;
  targetMinutes: number;
  role: Role;
}

export function PanelCard({ panel, targetMinutes, role }: PanelCardProps) {
  const api = useApi();
  const { current, last_ended: lastEnded } = panel;

  return (
    <section aria-label={panel.name} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold">{panel.name}</h2>
        {current ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">Busy</span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Free</span>
        )}
        {canDeletePanel(panel, role) && (
          <ActionButton
            variant="ghost"
            className="ml-auto"
            confirm={`Delete ${panel.name}? Anyone lined up for it moves to the end of the pool.`}
            action={() => api.deletePanel(panel.id)}
          >
            Delete panel
          </ActionButton>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {current ? (
          <div className="rounded-lg bg-sky-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-sky-700 uppercase">Now interviewing</p>
            <p className="mt-1 flex items-baseline justify-between gap-3">
              <CandidateName number={current.number} name={current.name} className="text-lg font-semibold" />
              <Timer startedAt={current.started_at} targetMinutes={targetMinutes} className="text-lg font-semibold" />
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton variant="primary" action={() => api.endInterview(current.interview_id)}>End interview</ActionButton>
              <ActionButton action={() => api.undoSendIn(current.interview_id)}>Undo send-in</ActionButton>
            </div>
          </div>
        ) : lastEnded ? (
          <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
            Last: <CandidateName number={lastEnded.number} name={lastEnded.name} /> —
            <ActionButton variant="ghost" label={`Reopen the interview with #${lastEnded.number}`} action={() => api.reopenInterview(lastEnded.interview_id)}>
              Reopen
            </ActionButton>
          </p>
        ) : null}

        <p className="text-sm text-slate-600">
          {panel.panelists.length > 0 ? `Present: ${panel.panelists.map((p) => p.display_name).join(', ')}` : 'No panelists present'}
        </p>

        {panel.lane.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody lined up.</p>
        ) : (
          <ol aria-label={`Lined up for ${panel.name}`} className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {panel.lane.map((entry) => (
              <li key={entry.candidate_id} className="space-y-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-sm text-slate-500 tabular-nums">{entry.position}.</span>
                  <CandidateName number={entry.number} name={entry.name} className="flex-1 font-medium" />
                  <SkipBadge count={entry.skip_count} />
                </div>
                <div className="flex flex-wrap gap-1 pl-7">
                  {entry.position === 1 && !current && (
                    <ActionButton variant="primary" label={`Send #${entry.number} in to ${panel.name}`} action={() => api.sendIn(entry.candidate_id, panel.id)}>
                      Send in
                    </ActionButton>
                  )}
                  <MoveButtons entry={entry} laneId={panel.id} laneLength={panel.lane.length} />
                  <ActionButton label={`Skip #${entry.number}`} action={() => api.skipCandidate(entry.candidate_id)}>Skip</ActionButton>
                  <ActionButton label={`Move #${entry.number} back to the pool`} action={() => api.moveCandidate(entry.candidate_id, null, 1)}>
                    Back to pool
                  </ActionButton>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm run test:unit && npm run typecheck`
Expected: `Tests  71 passed (71)`, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/queue tests/unit/web/queueView.test.ts tests/unit/web/panelCard.test.tsx
git commit -m "feat(web): panel cards with send-in, end, undo, reopen and lane controls"
```

---

### Task 7: The CSV import dialog

**Files:**
- Create: `src/queue/ImportDialog.tsx`
- Test: `tests/unit/web/importDialog.test.tsx`

**Interfaces:**
- Consumes: `parseFormExport` and `HeaderMismatch` (Task 2); `api.importCandidates` (Task 3); `useRunAction` and `buttonClasses` (Task 4).
- Produces:
  - `<ImportDialog onClose>`
  - Its accessible names: the file input "CSV file"; the buttons `Import N responses`, `Choose another file`, `Done` and `Close`; the dialog "Import candidates from CSV"

- [ ] **Step 1: Write the failing test**

`tests/unit/web/importDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/form-export-fake.csv?raw';
import { ActionProvider } from '../../../src/components/ActionProvider.tsx';
import { ToastProvider } from '../../../src/components/Toasts.tsx';
import { ApiError, type Api } from '../../../src/lib/api.ts';
import { ApiProvider } from '../../../src/lib/ApiProvider.tsx';
import { ImportDialog } from '../../../src/queue/ImportDialog.tsx';
import { fakeApi } from './helpers.tsx';

function renderDialog(overrides: Partial<Api> = {}) {
  const api = fakeApi(overrides);
  const onClose = vi.fn();
  const onSettled = vi.fn();
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <ActionProvider onSettled={onSettled}>
          <ImportDialog onClose={onClose} />
        </ActionProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { api, onClose, onSettled };
}

async function choose(text: string, name = 'responses.csv') {
  await userEvent.upload(screen.getByLabelText('CSV file'), new File([text], name, { type: 'text/csv' }));
}

describe('ImportDialog', () => {
  it('imports every response in one call and shows the summary with flagged rows', async () => {
    const { api, onSettled } = renderDialog({
      importCandidates: vi.fn(async () => ({
        added: 3,
        updated: 0,
        flagged: [
          { reg_number: '', name: 'No Reg Person', reason: 'Missing registration number; row skipped' },
          { reg_number: '2099101', name: 'Ali Raza', reason: 'Duplicate submission (2 responses); kept the latest' },
        ],
      })),
    });
    await choose(fixture);
    expect(await screen.findByText(/5 responses ready to import/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import 5 responses' }));
    expect(await screen.findByText('Added 3 · Updated 0')).toBeInTheDocument();
    expect(vi.mocked(api.importCandidates).mock.calls[0][0]).toHaveLength(5);
    expect(screen.getByText('Missing registration number; row skipped')).toBeInTheDocument();
    expect(screen.getByText('Duplicate submission (2 responses); kept the latest')).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalled(); // the board reloads
  });

  it('stops before importing when the columns do not match, and shows which ones', async () => {
    const { api } = renderDialog();
    await choose(fixture.replace(',Registration Number,', ',Reg No,'));
    expect(await screen.findByRole('alert')).toHaveTextContent("The columns don't match the Fall 2026 induction form. Nothing was imported.");
    expect(screen.getByRole('row', { name: '5 Registration Number Reg No' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull();
    expect(api.importCandidates).not.toHaveBeenCalled();
  });

  it('explains an empty file', async () => {
    renderDialog();
    await choose('');
    expect(await screen.findByRole('alert')).toHaveTextContent('The file is empty.');
  });

  it("keeps the file ready when the import fails, and shows the server's message", async () => {
    renderDialog({ importCandidates: vi.fn(() => Promise.reject(new ApiError('Not allowed'))) });
    await choose(fixture);
    await userEvent.click(await screen.findByRole('button', { name: 'Import 5 responses' }));
    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 5 responses' })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/web/importDialog.test.tsx`
Expected: FAIL. `../../../src/queue/ImportDialog.tsx` cannot be resolved yet.

- [ ] **Step 3: Write the dialog**

`src/queue/ImportDialog.tsx`:

```tsx
import { useState } from 'react';
import { buttonClasses } from '../components/ActionButton.tsx';
import { useRunAction } from '../components/ActionProvider.tsx';
import { parseFormExport, type HeaderMismatch } from '../csv/parseFormExport.ts';
import { useApi } from '../lib/ApiProvider.tsx';
import type { ImportResult, ImportRow } from '../lib/types.ts';

type Step =
  | { kind: 'choose'; error: string | null }
  | { kind: 'mismatch'; fileName: string; error: string; mismatches: HeaderMismatch[] }
  | { kind: 'ready'; fileName: string; rows: ImportRow[]; warnings: string[]; importing: boolean }
  | { kind: 'done'; result: ImportResult };

/** Reads the Google Forms CSV in the browser, checks it, imports it in one call, and shows the summary. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const run = useRunAction();
  const [step, setStep] = useState<Step>({ kind: 'choose', error: null });
  const busy = step.kind === 'ready' && step.importing;

  async function onFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setStep({ kind: 'choose', error: "Couldn't read that file." });
      return;
    }
    const parsed = parseFormExport(text);
    if (parsed.ok) {
      setStep({ kind: 'ready', fileName: file.name, rows: parsed.rows, warnings: parsed.warnings, importing: false });
    } else if (parsed.mismatches.length > 0) {
      setStep({ kind: 'mismatch', fileName: file.name, error: parsed.error, mismatches: parsed.mismatches });
    } else {
      setStep({ kind: 'choose', error: parsed.error });
    }
  }

  async function onImport() {
    if (step.kind !== 'ready' || step.importing) return;
    setStep({ ...step, importing: true });
    const result = await run(() => api.importCandidates(step.rows));
    setStep(result ? { kind: 'done', result } : { ...step, importing: false });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="w-full max-w-2xl space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="import-title" className="text-lg font-semibold">Import candidates from CSV</h2>
          <button type="button" className={buttonClasses('ghost')} onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {step.kind === 'choose' && (
          <>
            <p className="text-sm text-slate-600">
              In the Google Form's responses sheet choose File → Download → CSV, then pick that file. Importing again later is safe:
              existing candidates keep their number and their place in the queue.
            </p>
            {step.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{step.error}</p>}
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              autoFocus
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-700"
            />
          </>
        )}

        {step.kind === 'mismatch' && (
          <>
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {step.fileName}: {step.error}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Column</th>
                    <th className="px-3 py-2">Expected</th>
                    <th className="px-3 py-2">Found</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {step.mismatches.map((m) => (
                    <tr key={m.column}>
                      <td className="px-3 py-2 tabular-nums">{m.column}</td>
                      <td className="px-3 py-2">{m.expected}</td>
                      <td className="px-3 py-2">{m.found}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className={buttonClasses('secondary', 'md')} onClick={() => setStep({ kind: 'choose', error: null })}>
              Choose another file
            </button>
          </>
        )}

        {step.kind === 'ready' && (
          <>
            <p className="text-sm">
              <span className="font-medium">{step.fileName}</span>: {step.rows.length} {step.rows.length === 1 ? 'response' : 'responses'} ready to import.
            </p>
            {step.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {step.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button type="button" className={buttonClasses('primary', 'md')} onClick={() => void onImport()} disabled={step.importing}>
                {step.importing ? 'Importing…' : `Import ${step.rows.length} ${step.rows.length === 1 ? 'response' : 'responses'}`}
              </button>
              <button type="button" className={buttonClasses('secondary', 'md')} onClick={() => setStep({ kind: 'choose', error: null })} disabled={step.importing}>
                Choose another file
              </button>
            </div>
          </>
        )}

        {step.kind === 'done' && (
          <>
            <p className="text-sm font-medium">
              Added {step.result.added} · Updated {step.result.updated}
            </p>
            {step.result.flagged.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing needs a closer look.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-amber-200">
                <table className="w-full text-left text-sm">
                  <caption className="bg-amber-50 px-3 py-2 text-left font-medium text-amber-900">Needs a closer look</caption>
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Reg number</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {step.result.flagged.map((flag, i) => (
                      <tr key={`${flag.reg_number}-${i}`}>
                        <td className="px-3 py-2 tabular-nums">{flag.reg_number || '—'}</td>
                        <td className="px-3 py-2"><bdi>{flag.name}</bdi></td>
                        <td className="px-3 py-2">{flag.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button type="button" className={buttonClasses('primary', 'md')} onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run test:unit && npm run typecheck`
Expected: `Tests  75 passed (75)`, and `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/queue/ImportDialog.tsx tests/unit/web/importDialog.test.tsx
git commit -m "feat(web): CSV import dialog with header check, warnings and import summary"
```

---

### Task 8: The queue manager's board

**Files:**
- Create: `src/queue/PoolList.tsx`, `src/queue/SearchBox.tsx`, `src/queue/TopBar.tsx`, `src/queue/QueuePage.tsx`
- Modify: `src/app/routes.tsx` (`/queue` renders `QueuePage`)
- Test: `tests/unit/web/queuePage.test.tsx`

**Interfaces:**
- Consumes:
  - Tasks 3–7: `useLiveSnapshot(api.boardSnapshot, api.subscribeBoard())`, `ActionProvider` (with `onSettled` set to the board reload), `ConnectionBanner`, `PanelCard`, `ImportDialog`, `poolHint`, `freePanels`, `describeLocation`, `searchCandidates`, `MoveButtons`, `SkipBadge` and `CandidateName`
  - `useAuth` (Task 5)
- Produces:
  - `<QueuePage>`, mounted at `/queue`
  - Accessible names used by tests and Plan 3's E2E:
    - The regions `Panel N`, the list `Waiting pool`, the searchbox `Search candidates` and the list `Search results`
    - The buttons `Check in #N`, `Send in → Panel X`, `Skip #N`, `Undo check-in for #N`, `Import CSV` and `+ Add panel`
    - The combobox `Line up #N for a panel`
    - The counts `Candidate counts`

- [ ] **Step 1: Write the failing test**

`tests/unit/web/queuePage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISABLED_NOTICE } from '../../../src/auth/AuthProvider.tsx';
import { ApiError } from '../../../src/lib/api.ts';
import { notAllowed } from '../../../src/lib/notAllowed.ts';
import { board, boardPanel, interview } from './fixtures.ts';
import { fakeApi, fakeAuth, renderApp } from './helpers.tsx';

const queueManager = () => fakeAuth({ signedInAs: { id: 'u-queue', username: 'queue', display_name: 'Queue', role: 'queue_manager', is_active: true, current_panel_id: null } });

async function openQueue(api = fakeApi()) {
  const auth = queueManager();
  const view = renderApp('/queue', { api, auth: auth.backend });
  await screen.findByRole('region', { name: 'Panel 1' });
  return { ...view, api, auth };
}

describe('QueuePage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the counts, every panel and the waiting pool', async () => {
    await openQueue();
    const counts = screen.getByLabelText('Candidate counts');
    expect(counts).toHaveTextContent('Registered 40');
    expect(counts).toHaveTextContent('Interviewed 16');
    expect(screen.getByRole('region', { name: 'Panel 2' })).toBeInTheDocument();
    const pool = screen.getByRole('list', { name: 'Waiting pool' });
    expect(within(pool).getAllByRole('listitem')).toHaveLength(3);
    expect(within(pool).getByText('عائشہ خان')).toBeInTheDocument();
    expect(document.title).toBe('Queue · MLSA Induction');
  });

  it('highlights the first person in the pool when a free panel has nobody lined up', async () => {
    const api = fakeApi({
      boardSnapshot: vi.fn(async () =>
        board({ panels: [boardPanel('p1', 'Panel 1', { is_default: true, current: interview(7, 'Sara Ahmed') }), boardPanel('p3', 'Panel 3')] }),
      ),
    });
    await openQueue(api);
    const pool = screen.getByRole('list', { name: 'Waiting pool' });
    const [first, second] = within(pool).getAllByRole('listitem');
    expect(within(first).getByRole('button', { name: 'Send in → Panel 3' })).toHaveClass('bg-brand-600');
    expect(within(second).getByRole('button', { name: 'Send in → Panel 3' })).not.toHaveClass('bg-brand-600');

    await userEvent.click(within(first).getByRole('button', { name: 'Send in → Panel 3' }));
    expect(api.sendIn).toHaveBeenCalledWith('c20', 'p3');
  });

  it('lines people up, skips them and undoes their check-in from the pool', async () => {
    const { api } = await openQueue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Line up #21 for a panel' }), 'Panel 2');
    await userEvent.click(screen.getByRole('button', { name: 'Skip #20' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo check-in for #22' }));
    expect(api.moveCandidate).toHaveBeenCalledWith('c21', 'p2', null);
    expect(api.skipCandidate).toHaveBeenCalledWith('c20');
    expect(window.confirm).toHaveBeenCalledWith("Undo check-in for #22 Zara O'Brien-Khan? They leave the queue and lose their place.");
    expect(api.undoCheckIn).toHaveBeenCalledWith('c22');
  });

  it('finds a registered candidate and checks them in', async () => {
    const api = fakeApi({
      listCandidates: vi.fn(async () => [
        { id: 'c5', number: 5, full_name: 'Hina Tariq', reg_number: '2025005', status: 'registered' as const },
        { id: 'c20', number: 20, full_name: 'Bilal Khan', reg_number: '2025020', status: 'waiting' as const },
      ]),
    });
    await openQueue(api);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search candidates' }), 'hina');
    const results = await screen.findByRole('list', { name: 'Search results' });
    expect(results).toHaveTextContent('2025005 · Not checked in');
    expect(api.listCandidates).toHaveBeenCalledWith('ind-1');

    const loads = vi.mocked(api.boardSnapshot).mock.calls.length;
    await userEvent.click(within(results).getByRole('button', { name: 'Check in #5' }));
    expect(api.checkIn).toHaveBeenCalledWith('c5');
    await waitFor(() => expect(vi.mocked(api.boardSnapshot).mock.calls.length).toBeGreaterThan(loads));

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search candidates' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search candidates' }), '#20');
    expect(await screen.findByText('2025020 · Waiting · pool #1')).toBeInTheDocument();
  });

  it('reloads when a board event arrives and shows a banner while reconnecting', async () => {
    const api = fakeApi();
    await openQueue(api);
    vi.mocked(api.boardSnapshot).mockResolvedValue(board({ counts: { registered: 39, waiting: 5, interviewing: 1, interviewed: 16 } }));
    act(() => api.topics.board.event());
    expect(await screen.findByLabelText('Candidate counts')).toHaveTextContent('Registered 39');

    act(() => api.topics.board.status('error'));
    expect(screen.getByText(/Reconnecting…/)).toBeInTheDocument();
    act(() => api.topics.board.status('subscribed'));
    expect(screen.queryByText(/Reconnecting…/)).toBeNull();
  });

  it("shows the server's message when an action fails", async () => {
    const api = fakeApi({ sendIn: vi.fn(() => Promise.reject(new ApiError('Panel 2 is busy'))) });
    await openQueue(api);
    await userEvent.click(screen.getByRole('button', { name: 'Send #12 in to Panel 2' }));
    expect(await screen.findByText('Panel 2 is busy')).toBeInTheDocument();
  });

  it('adds panels and opens the CSV import', async () => {
    const { api } = await openQueue();
    await userEvent.click(screen.getByRole('button', { name: '+ Add panel' }));
    expect(api.addPanel).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(screen.getByRole('dialog', { name: 'Import candidates from CSV' })).toBeInTheDocument();
  });

  it("offers a retry when the board can't be loaded", async () => {
    const api = fakeApi({ boardSnapshot: vi.fn(() => Promise.reject(new ApiError("Can't reach the server. Check the connection and try again."))) });
    renderApp('/queue', { api, auth: queueManager().backend });
    expect(await screen.findByText("Couldn't load the board")).toBeInTheDocument();
    vi.mocked(api.boardSnapshot).mockResolvedValue(board());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Panel 1' })).toBeInTheDocument();
  });

  it('signs out an account that was disabled while the board was open', async () => {
    const { api, auth, router } = await openQueue();
    auth.profiles.delete('u-queue'); // a disabled account can no longer read its profile
    vi.mocked(api.skipCandidate).mockImplementation(async () => {
      notAllowed.emit(); // what createApi does when the server answers "Not allowed"
      throw new ApiError('Not allowed');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Skip #20' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('alert')).toHaveTextContent(DISABLED_NOTICE);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/web/queuePage.test.tsx`
Expected: FAIL. The panel regions never appear: `/queue` still renders the "Queue board" placeholder, and `findByRole('region', { name: 'Panel 1' })` times out.

- [ ] **Step 3: Write the pool, the search box and the top bar**

`src/queue/PoolList.tsx`:

```tsx
import { useState } from 'react';
import { ActionButton } from '../components/ActionButton.tsx';
import { useRunAction } from '../components/ActionProvider.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { BoardPanel, BoardSnapshot, LaneEntry } from '../lib/types.ts';
import { CandidateName, MoveButtons, SkipBadge } from './bits.tsx';
import { freePanels, poolHint } from './queueView.ts';

/** The waiting pool: everyone checked in who isn't lined up for a panel yet. */
export function PoolList({ board }: { board: BoardSnapshot }) {
  const api = useApi();
  const hint = poolHint(board);
  const free = freePanels(board);
  const { pool } = board;

  return (
    <section aria-labelledby="pool-title" className="self-start rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3">
        <h2 id="pool-title" className="text-base font-semibold">Waiting pool</h2>
        <span className="text-sm text-slate-500">{pool.length} waiting</span>
      </header>
      {pool.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">Nobody is waiting. Check people in from the search box.</p>
      ) : (
        <ol aria-label="Waiting pool" className="divide-y divide-slate-100">
          {pool.map((entry) => {
            const hinted = hint?.candidateId === entry.candidate_id;
            return (
              <li key={entry.candidate_id} className={`space-y-2 px-4 py-3 ${hinted ? 'bg-emerald-50 ring-2 ring-emerald-400 ring-inset' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-sm text-slate-500 tabular-nums">{entry.position}.</span>
                  <CandidateName number={entry.number} name={entry.name} className="flex-1 font-medium" />
                  <SkipBadge count={entry.skip_count} />
                </div>
                <div className="flex flex-wrap items-center gap-1 pl-7">
                  {free.map((panel) => (
                    <ActionButton
                      key={panel.id}
                      variant={hinted && hint?.panelId === panel.id ? 'primary' : 'secondary'}
                      action={() => api.sendIn(entry.candidate_id, panel.id)}
                    >
                      Send in → {panel.name}
                    </ActionButton>
                  ))}
                  <LineUpSelect entry={entry} panels={board.panels} />
                  <MoveButtons entry={entry} laneId={null} laneLength={pool.length} />
                  <ActionButton label={`Skip #${entry.number}`} action={() => api.skipCandidate(entry.candidate_id)}>Skip</ActionButton>
                  <ActionButton
                    variant="danger"
                    label={`Undo check-in for #${entry.number}`}
                    confirm={`Undo check-in for #${entry.number} ${entry.name}? They leave the queue and lose their place.`}
                    action={() => api.undoCheckIn(entry.candidate_id)}
                  >
                    Undo check-in
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** "Line up for ▾": moves the person to the end of the chosen panel's lane. */
function LineUpSelect({ entry, panels }: { entry: LaneEntry; panels: BoardPanel[] }) {
  const api = useApi();
  const run = useRunAction();
  const [pending, setPending] = useState(false);

  async function lineUp(panelId: string) {
    if (!panelId || pending) return;
    setPending(true);
    await run(() => api.moveCandidate(entry.candidate_id, panelId, null));
    setPending(false);
  }

  return (
    <select
      aria-label={`Line up #${entry.number} for a panel`}
      value=""
      disabled={pending || panels.length === 0}
      onChange={(e) => void lineUp(e.target.value)}
      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:opacity-50"
    >
      <option value="">Line up for…</option>
      {panels.map((panel) => (
        <option key={panel.id} value={panel.id}>
          {panel.name}
        </option>
      ))}
    </select>
  );
}
```

`src/queue/SearchBox.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActionButton } from '../components/ActionButton.tsx';
import { errorMessage } from '../lib/api.ts';
import { useApi } from '../lib/ApiProvider.tsx';
import type { BoardSnapshot, CandidateSummary } from '../lib/types.ts';
import { CandidateName } from './bits.tsx';
import { describeLocation, searchCandidates } from './queueView.ts';

/** Find anyone by number, name or reg number; check in people who haven't arrived yet. */
export function SearchBox({ board }: { board: BoardSnapshot }) {
  const api = useApi();
  const [query, setQuery] = useState('');
  const [list, setList] = useState<CandidateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searching = query.trim() !== '';
  const inductionId = board.induction.id;
  const boardVersion = board.server_time; // changes with every board reload, so statuses stay fresh

  useEffect(() => {
    if (!searching) return;
    let active = true;
    api.listCandidates(inductionId).then(
      (rows) => {
        if (!active) return;
        setList(rows);
        setError(null);
      },
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [api, inductionId, searching, boardVersion]);

  const results = searching && list ? searchCandidates(list, query) : [];

  return (
    <div className="relative w-full max-w-md">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('');
        }}
        placeholder="Search number, name or reg number"
        aria-label="Search candidates"
        className="h-10 w-full rounded-md border border-slate-300 px-3 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      />
      {searching && (
        <div className="absolute top-11 right-0 left-0 z-20 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {error ? (
            <p role="alert" className="px-3 py-2 text-sm text-red-700">{error}</p>
          ) : list === null ? (
            <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No candidate matches “{query.trim()}”.</p>
          ) : (
            <ul aria-label="Search results" className="divide-y divide-slate-100">
              {results.map((candidate) => (
                <li key={candidate.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <CandidateName number={candidate.number} name={candidate.full_name} className="block font-medium" />
                    <p className="text-xs text-slate-500">
                      {candidate.reg_number} · {describeLocation(board, candidate)}
                    </p>
                  </div>
                  {candidate.status === 'registered' && (
                    <ActionButton variant="primary" label={`Check in #${candidate.number}`} action={() => api.checkIn(candidate.id)}>
                      Check in
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

`src/queue/TopBar.tsx`:

```tsx
import { ActionButton, buttonClasses } from '../components/ActionButton.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { BoardSnapshot, CandidateStatus } from '../lib/types.ts';
import { SearchBox } from './SearchBox.tsx';

const COUNTS: Array<[CandidateStatus, string]> = [
  ['registered', 'Registered'],
  ['waiting', 'Waiting'],
  ['interviewing', 'Interviewing'],
  ['interviewed', 'Interviewed'],
];

export function TopBar({ board, onImport }: { board: BoardSnapshot; onImport: () => void }) {
  const api = useApi();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <dl aria-label="Candidate counts" className="flex flex-wrap gap-2 text-sm">
        {COUNTS.map(([status, label]) => (
          <div key={status} className="rounded-md bg-slate-100 px-2.5 py-1">
            <dt className="inline text-slate-600">{label} </dt>
            <dd className="inline font-semibold tabular-nums">{board.counts[status]}</dd>
          </div>
        ))}
      </dl>
      <SearchBox board={board} />
      <div className="ml-auto flex gap-2">
        <button type="button" className={buttonClasses('secondary', 'md')} onClick={onImport}>
          Import CSV
        </button>
        <ActionButton variant="primary" size="md" action={() => api.addPanel()}>
          + Add panel
        </ActionButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the page and route it**

`src/queue/QueuePage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { ActionProvider } from '../components/ActionProvider.tsx';
import { buttonClasses } from '../components/ActionButton.tsx';
import { ConnectionBanner } from '../components/ConnectionBanner.tsx';
import { FullPageMessage } from '../components/FullPageMessage.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import { useLiveSnapshot } from '../lib/useLiveSnapshot.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { PanelCard } from './PanelCard.tsx';
import { PoolList } from './PoolList.tsx';
import { TopBar } from './TopBar.tsx';

/** /queue: the queue manager's one screen (admins can open it too). */
export function QueuePage() {
  const api = useApi();
  const { state } = useAuth();
  const subscribe = useMemo(() => api.subscribeBoard(), [api]);
  const { data: board, error, status, reload } = useLiveSnapshot(api.boardSnapshot, subscribe);
  const [importing, setImporting] = useState(false);
  const role = state.status === 'signed_in' ? state.profile.role : 'queue_manager';

  useEffect(() => {
    document.title = 'Queue · MLSA Induction';
  }, []);

  if (!board) {
    return (
      <FullPageMessage title={error ? "Couldn't load the board" : 'Loading the board…'}>
        {error && (
          <>
            <p>{error}</p>
            <button type="button" className={`${buttonClasses('secondary', 'md')} mt-3`} onClick={reload}>
              Try again
            </button>
          </>
        )}
      </FullPageMessage>
    );
  }

  return (
    <ActionProvider onSettled={reload}>
      <ConnectionBanner status={status} />
      <TopBar board={board} onImport={() => setImporting(true)} />
      {error && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800">
          Couldn't refresh the board: {error}
        </p>
      )}
      <main className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid content-start gap-4 lg:grid-cols-2">
          {board.panels.map((panel) => (
            <PanelCard key={panel.id} panel={panel} targetMinutes={board.induction.target_interview_minutes} role={role} />
          ))}
        </div>
        <PoolList board={board} />
      </main>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </ActionProvider>
  );
}
```

Replace `src/app/routes.tsx`:

```tsx
import type { RouteObject } from 'react-router';
import { QueuePage } from '../queue/QueuePage.tsx';
import { LoginPage } from './LoginPage.tsx';
import { AdminHome, ComingSoon, HomeRedirect, NotFound } from './placeholders.tsx';
import { RequireRole } from './RequireRole.tsx';
import { StaffLayout } from './StaffLayout.tsx';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/display', element: <ComingSoon title="Projector" /> },
  {
    path: '/',
    element: <StaffLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'queue', element: <RequireRole roles={['queue_manager', 'admin']}><QueuePage /></RequireRole> },
      { path: 'panel', element: <RequireRole roles={['panelist', 'admin']}><ComingSoon title="Panelist screen" /></RequireRole> },
      { path: 'admin', element: <RequireRole roles={['admin']}><AdminHome /></RequireRole> },
    ],
  },
  { path: '*', element: <NotFound /> },
];
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm run test:unit && npm run typecheck`
Expected: `Tests  84 passed (84)`, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/queue src/app/routes.tsx tests/unit/web/queuePage.test.tsx
git commit -m "feat(web): live queue board with search, check-in, pool actions and reconnect banner"
```

---

### Task 9: The projector

**Files:**
- Create: `src/display/displayView.ts`, `src/display/DisplayPage.tsx`
- Modify: `src/app/routes.tsx` (`/display` renders `DisplayPage`)
- Test: `tests/unit/web/displayView.test.ts`, `tests/unit/web/displayPage.test.tsx`

**Interfaces:**
- Consumes: `api.displaySnapshot(key)` and `api.subscribeDisplay(key)` (Task 3); `useLiveSnapshot` and `Timer` (Task 4).
- Produces:
  - `displayColumns(panelCount): number`
  - `newlySentIn(previous, next): string[]`
  - `selectPanels(panels, panelId): DisplayPanel[]`
  - `<DisplayPage>`, mounted at `/display?key=…[&panel=<id>]`
  - Accessible names: a region per panel; the footer `Waiting`; the status dot `Live` or `Reconnecting`; `data-flash="true"` on a tile for 5 s after a send-in

- [ ] **Step 1: Write the failing tests**

`tests/unit/web/displayView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayColumns, newlySentIn, selectPanels } from '../../../src/display/displayView.ts';
import type { DisplayPanel } from '../../../src/lib/types.ts';

const tile = (id: string, current: DisplayPanel['current'] = null): DisplayPanel => ({ id, name: id, current, lined_up: [] });
const sara = { number: 7, name: 'Sara', started_at: '2026-09-26T09:50:00Z' };
const ali = { number: 12, name: 'Ali', started_at: '2026-09-26T10:05:00Z' };

describe('displayColumns', () => {
  it('fits 1–4 panels on a 16:9 screen', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 9].map(displayColumns)).toEqual([1, 1, 2, 3, 2, 3, 3, 4, 4]);
  });
});

describe('newlySentIn', () => {
  it('flags a panel when someone new is sent in, or the same person comes back after a reopen', () => {
    expect(newlySentIn([tile('p1', sara), tile('p2')], [tile('p1', sara), tile('p2', ali)])).toEqual(['p2']);
    expect(newlySentIn([tile('p1', sara)], [tile('p1', ali)])).toEqual(['p1']);
    expect(newlySentIn([tile('p1')], [tile('p1', sara)])).toEqual(['p1']);
    expect(newlySentIn([], [tile('p9', ali)])).toEqual(['p9']);
  });

  it('flags nothing on the first load, on a reload with no change, or when an interview ends', () => {
    expect(newlySentIn(undefined, [tile('p1', sara)])).toEqual([]);
    expect(newlySentIn([tile('p1', sara)], [tile('p1', { ...sara })])).toEqual([]);
    expect(newlySentIn([tile('p1', sara)], [tile('p1')])).toEqual([]);
  });
});

describe('selectPanels', () => {
  it('shows one panel when asked, and every panel for an unknown id', () => {
    const panels = [tile('p1'), tile('p2')];
    expect(selectPanels(panels, 'p2').map((p) => p.id)).toEqual(['p2']);
    expect(selectPanels(panels, 'gone').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(selectPanels(panels, null).map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
```

`tests/unit/web/displayPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/lib/api.ts';
import { display } from './fixtures.ts';
import { fakeApi, renderApp } from './helpers.tsx';

describe('DisplayPage', () => {
  it('shows each panel, who is up next, and the waiting strip, without a login', async () => {
    const api = fakeApi();
    renderApp('/display?key=k1', { api });
    const panel1 = await screen.findByRole('region', { name: 'Panel 1' });
    expect(within(panel1).getByText('Now interviewing')).toBeInTheDocument();
    expect(within(panel1).getByText('Sara Ahmed')).toBeInTheDocument();
    const panel2 = screen.getByRole('region', { name: 'Panel 2' });
    expect(within(panel2).getByText('Free')).toBeInTheDocument();
    expect(within(panel2).getByText('Ali Raza')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo', { name: 'Waiting' })).getByText('عائشہ خان')).toBeInTheDocument();
    expect(api.displaySnapshot).toHaveBeenCalledWith('k1');
    expect(api.subscribeDisplay).toHaveBeenCalledWith('k1');
    expect(document.title).toBe('Projector · MLSA Induction');
  });

  it('says the link is invalid for a wrong or missing key', async () => {
    renderApp('/display?key=wrong', { api: fakeApi({ displaySnapshot: vi.fn(async () => null) }) });
    expect(await screen.findByText('Invalid display link')).toBeInTheDocument();
  });

  it('says the link is invalid without a key', () => {
    renderApp('/display');
    expect(screen.getByText('Invalid display link')).toBeInTheDocument();
  });

  it('shows one panel full screen with &panel=', async () => {
    renderApp('/display?key=k1&panel=p2');
    expect(await screen.findByRole('region', { name: 'Panel 2' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Panel 1' })).toBeNull();
    expect(screen.queryByRole('contentinfo', { name: 'Waiting' })).toBeNull();
  });

  it('re-reads the snapshot on each broadcast and flashes a panel when someone is sent in', async () => {
    const api = fakeApi();
    renderApp('/display?key=k1', { api });
    await screen.findByRole('region', { name: 'Panel 2' });
    expect(screen.getByRole('region', { name: 'Panel 2' })).not.toHaveAttribute('data-flash');

    vi.mocked(api.displaySnapshot).mockResolvedValue(
      display({
        panels: [
          { id: 'p1', name: 'Panel 1', current: { number: 7, name: 'Sara Ahmed', started_at: '2026-09-26T09:50:00Z' }, lined_up: [] },
          { id: 'p2', name: 'Panel 2', current: { number: 12, name: 'Ali Raza', started_at: '2026-09-26T10:01:00Z' }, lined_up: [] },
        ],
      }),
    );
    act(() => api.topics.display.event());
    const panel2 = screen.getByRole('region', { name: 'Panel 2' });
    expect(await within(panel2).findByText('Now interviewing')).toBeInTheDocument();
    expect(panel2).toHaveAttribute('data-flash', 'true');
    expect(screen.getByRole('region', { name: 'Panel 1' })).not.toHaveAttribute('data-flash');
  });

  it('keeps showing the last state when a reload fails, with an amber status dot while reconnecting', async () => {
    const api = fakeApi();
    renderApp('/display?key=k1', { api });
    await screen.findByRole('region', { name: 'Panel 1' });
    act(() => api.topics.display.status('subscribed'));
    expect(screen.getByRole('status', { name: 'Live' })).toBeInTheDocument();

    vi.mocked(api.displaySnapshot).mockRejectedValue(new ApiError("Can't reach the server. Check the connection and try again."));
    act(() => api.topics.display.status('error'));
    act(() => api.topics.display.event());
    expect(await screen.findByRole('status', { name: 'Reconnecting' })).toBeInTheDocument();
    expect(screen.getByText('Sara Ahmed')).toBeInTheDocument();
    expect(screen.queryByText(/reach the server/)).toBeNull();
  });

  it('shows "Connecting…" rather than an error when the first load fails', async () => {
    renderApp('/display?key=k1', { api: fakeApi({ displaySnapshot: vi.fn(() => Promise.reject(new ApiError('offline'))) }) });
    expect(await screen.findByText('Connecting…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/web/displayView.test.ts tests/unit/web/displayPage.test.tsx`
Expected: FAIL. `../../../src/display/displayView.ts` cannot be resolved, and the page tests find only the "Projector" placeholder.

- [ ] **Step 3: Write the projector logic and page**

`src/display/displayView.ts`:

```ts
import type { DisplayPanel } from '../lib/types.ts';

/** Grid columns for the projector: 1–3 panels side by side, 4 as 2×2, then rows of 3 (4 beyond 6). */
export function displayColumns(panelCount: number): number {
  if (panelCount <= 3) return Math.max(panelCount, 1);
  if (panelCount === 4) return 2;
  if (panelCount <= 6) return 3;
  return 4;
}

/** Panels whose current candidate changed since the previous snapshot. Nothing flashes on the first load. */
export function newlySentIn(previous: DisplayPanel[] | undefined, next: DisplayPanel[]): string[] {
  if (!previous) return [];
  return next
    .filter((panel) => {
      if (!panel.current) return false;
      const before = previous.find((p) => p.id === panel.id)?.current;
      return !before || before.number !== panel.current.number || before.started_at !== panel.current.started_at;
    })
    .map((panel) => panel.id);
}

/** `&panel=<id>` shows one panel; an unknown id (say, a deleted panel) falls back to all of them. */
export function selectPanels(panels: DisplayPanel[], panelId: string | null): DisplayPanel[] {
  const one = panelId ? panels.filter((p) => p.id === panelId) : [];
  return one.length > 0 ? one : panels;
}
```

`src/display/DisplayPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Timer } from '../components/Timer.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { DisplayPanel, DisplayPerson } from '../lib/types.ts';
import { useLiveSnapshot, type LiveStatus } from '../lib/useLiveSnapshot.ts';
import { displayColumns, newlySentIn, selectPanels } from './displayView.ts';

const RESYNC_MS = 30_000; // safety net on top of realtime
const FLASH_MS = 5_000;

/** /display?key=…[&panel=<id>]: the projector. No login; never shows an error page. */
export function DisplayPage() {
  const [params] = useSearchParams();
  const key = params.get('key')?.trim() ?? '';

  useEffect(() => {
    document.title = 'Projector · MLSA Induction';
  }, []);

  if (!key) return <InvalidLink />;
  return <DisplayBoard key={key} displayKey={key} panelId={params.get('panel')} />;
}

function DisplayBoard({ displayKey, panelId }: { displayKey: string; panelId: string | null }) {
  const api = useApi();
  const load = useCallback(() => api.displaySnapshot(displayKey), [api, displayKey]);
  // A broadcast only means "something changed": we re-read display_snapshot instead of trusting the
  // payload, because anyone who knows the projector link could send messages on its public channel.
  const subscribe = useMemo(() => api.subscribeDisplay(displayKey), [api, displayKey]);
  const { data, status } = useLiveSnapshot(load, subscribe, RESYNC_MS);
  const flashing = useFlash(data?.panels);

  if (data === null) return <InvalidLink />;
  if (data === undefined) {
    return (
      <Screen status={status}>
        <p className="m-auto text-[3vw] text-slate-500">Connecting…</p>
      </Screen>
    );
  }

  const panels = selectPanels(data.panels, panelId);
  const single = panelId !== null && panels.length === 1;
  return (
    <Screen status={status}>
      <header className="px-[3vw] pt-[2vw]">
        <h1 className="text-[2vw] font-semibold text-slate-400">{data.induction_name} · Inductions</h1>
      </header>
      <div
        className="grid min-h-0 flex-1 gap-[1.5vw] px-[3vw] py-[1.5vw]"
        style={{ gridTemplateColumns: `repeat(${displayColumns(panels.length)}, minmax(0, 1fr))` }}
      >
        {panels.map((panel) => (
          <PanelTile key={panel.id} panel={panel} targetMinutes={data.target_interview_minutes} flash={flashing.includes(panel.id)} large={single} />
        ))}
      </div>
      {!single && <WaitingStrip people={data.waiting} />}
    </Screen>
  );
}

function Screen({ status, children }: { status: LiveStatus; children: ReactNode }) {
  const live = status === 'live';
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-white">
      {children}
      <span
        role="status"
        aria-label={live ? 'Live' : 'Reconnecting'}
        title={live ? 'Live' : 'Reconnecting'}
        className={`fixed right-3 bottom-3 size-3 rounded-full ${live ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`}
      />
    </div>
  );
}

function PanelTile({ panel, targetMinutes, flash, large }: { panel: DisplayPanel; targetMinutes: number; flash: boolean; large: boolean }) {
  const nameSize = large ? 'text-[7vw]' : 'text-[3.6vw]';
  return (
    <section
      aria-label={panel.name}
      data-flash={flash ? 'true' : undefined}
      className={`flex min-h-0 flex-col rounded-[1.2vw] border p-[2vw] transition-colors duration-700 ${
        flash ? 'border-amber-300 bg-amber-400/20' : 'border-slate-800 bg-slate-900'
      }`}
    >
      <h2 className="text-[1.8vw] font-semibold tracking-wide text-slate-400 uppercase">{panel.name}</h2>
      {panel.current ? (
        <div className="mt-[1vw] min-w-0">
          <p className="text-[1.4vw] font-medium text-sky-300">Now interviewing</p>
          <p className={`${nameSize} leading-tight font-bold break-words`}>
            <span className="tabular-nums">#{panel.current.number}</span> <bdi>{panel.current.name}</bdi>
          </p>
          <Timer
            startedAt={panel.current.started_at}
            targetMinutes={targetMinutes}
            className={`${large ? 'text-[5vw]' : 'text-[3vw]'} font-semibold`}
            colorClassName="text-slate-200"
            overClassName="text-amber-300"
          />
        </div>
      ) : (
        <p className={`mt-[1vw] ${nameSize} font-bold text-emerald-400`}>Free</p>
      )}
      {panel.lined_up.length > 0 && (
        <div className="mt-auto pt-[1vw]">
          <p className="text-[1.3vw] text-slate-400">Up next</p>
          <ol className="text-[1.9vw]">
            {panel.lined_up.map((person) => (
              <PersonRow key={person.number} person={person} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function WaitingStrip({ people }: { people: DisplayPerson[] }) {
  return (
    <footer aria-label="Waiting" className="border-t border-slate-800 bg-slate-900/70 px-[3vw] py-[1.2vw]">
      <p className="text-[1.3vw] font-semibold tracking-wide text-slate-400 uppercase">Waiting</p>
      {people.length === 0 ? (
        <p className="text-[1.8vw] text-slate-500">Nobody waiting</p>
      ) : (
        <ol className="mt-[0.5vw] grid grid-cols-4 gap-x-[2vw] gap-y-[0.4vw] text-[1.8vw]">
          {people.map((person) => (
            <PersonRow key={person.number} person={person} />
          ))}
        </ol>
      )}
    </footer>
  );
}

function PersonRow({ person }: { person: DisplayPerson }) {
  return (
    <li className="overflow-hidden text-ellipsis whitespace-nowrap">
      <span className="text-slate-400 tabular-nums">#{person.number}</span> <bdi>{person.name}</bdi>
    </li>
  );
}

function InvalidLink() {
  return <div className="flex h-screen items-center justify-center bg-slate-950 text-[3vw] text-slate-300">Invalid display link</div>;
}

/** Ids of panels that just got a new candidate, each for FLASH_MS. */
function useFlash(panels: DisplayPanel[] | undefined): string[] {
  const previous = useRef<DisplayPanel[] | undefined>(undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [flashing, setFlashing] = useState<string[]>([]);

  useEffect(() => {
    if (!panels) return;
    const fresh = newlySentIn(previous.current, panels);
    previous.current = panels;
    if (fresh.length === 0) return;
    setFlashing((ids) => [...new Set([...ids, ...fresh])]);
    timers.current.push(setTimeout(() => setFlashing((ids) => ids.filter((id) => !fresh.includes(id))), FLASH_MS));
  }, [panels]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return flashing;
}
```

Replace `src/app/routes.tsx`:

```tsx
import type { RouteObject } from 'react-router';
import { DisplayPage } from '../display/DisplayPage.tsx';
import { QueuePage } from '../queue/QueuePage.tsx';
import { LoginPage } from './LoginPage.tsx';
import { AdminHome, ComingSoon, HomeRedirect, NotFound } from './placeholders.tsx';
import { RequireRole } from './RequireRole.tsx';
import { StaffLayout } from './StaffLayout.tsx';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/display', element: <DisplayPage /> },
  {
    path: '/',
    element: <StaffLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'queue', element: <RequireRole roles={['queue_manager', 'admin']}><QueuePage /></RequireRole> },
      { path: 'panel', element: <RequireRole roles={['panelist', 'admin']}><ComingSoon title="Panelist screen" /></RequireRole> },
      { path: 'admin', element: <RequireRole roles={['admin']}><AdminHome /></RequireRole> },
    ],
  },
  { path: '*', element: <NotFound /> },
];
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run test:unit && npm run typecheck && npm run build`
Expected:
- `Tests  95 passed (95)`
- `tsc` prints nothing.
- The build ends with `✓ built in …` and no chunk-size warning.

- [ ] **Step 5: Commit**

```bash
git add src/display src/app/routes.tsx tests/unit/web/displayView.test.ts tests/unit/web/displayPage.test.tsx
git commit -m "feat(web): projector with live tiles, flash on send-in, single-panel mode and status dot"
```

---

### Task 10: Local-development guide and a full run in the browser

**Files:**
- Modify: `readme.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the readme section that Plan 3's deployment guide extends.

- [ ] **Step 1: Document the web app**

In `readme.md`, replace the line `Supabase Studio: http://127.0.0.1:54323` with:

````markdown
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
````

In the `## Tests` block, change the `test:unit` line to:

```bash
npm run test:unit         # Vitest unit and component tests (web tests run in jsdom)
```

- [ ] **Step 2: Run the whole suite from a clean database**

Start the edge functions in a second terminal first: `npm run functions:serve`.

Run: `npm run db:reset && npm run db:test && npm run seed:dev && npm run test:unit && npm run test:integration && npm run typecheck && npm run build`
Expected:
- `Result: PASS`
- `Tests  95 passed (95)`
- `Tests  13 passed (13)` (9 from Plan 1, plus 4)
- `tsc` prints nothing.
- The build ends with `✓ built in …`.

- [ ] **Step 3: Check it in a real browser**

Run `npm run dev`. Then, in any browser (or a browser-automation tool), do each of these and confirm the result. Viewports: 1440×900 for the board, 1920×1080 for the projector.

1. Open http://localhost:5173/queue. It redirects to `/login?next=%2Fqueue`. Sign in as `queue` / `induction-dev`; you land on `/queue` with Panel 1, Panel 2 and an empty waiting pool.
2. In a second browser profile or a private window, open http://localhost:5173/admin and sign in as `admin`. Open the projector link from "Projector link". The projector shows both panels as **Free**, a green dot at the bottom right, and no console errors.
3. On the board, search `1` and click **Check in** on #1, then do the same for #2 and #3. The search result changes to `Waiting · pool #1` and so on, and the projector's Waiting strip lists them.
4. Use **Line up for… → Panel 2** on #2. Panel 2's card lists #2 with a **Send in** button, and the projector shows "Up next #2 …" under Panel 2.
5. Click **Send in → Panel 1** on #1. Within about half a second the projector's Panel 1 tile says "Now interviewing #1 …" with a running timer and flashes amber for about 5 s. The board's timer runs too.
6. Click **Import CSV**, choose `fixtures/form-export-fake.csv`, then **Import 5 responses**. The summary lists "Missing registration number; row skipped" and "Duplicate submission (2 responses); kept the latest".
7. Stop the realtime container for 10 s (`docker stop supabase_realtime_yawar-work`, then `docker start supabase_realtime_yawar-work`). The board shows the "Reconnecting…" banner and the projector's dot turns amber. Both recover on their own, and the board is up to date without a manual refresh.
8. Clean up: **End interview** on Panel 1, **Back to pool** on #2, then **Undo check-in** on #2 and #3, confirming each.

If no browser is available where this runs, say so in the report; do not mark the step done.

- [ ] **Step 4: Commit**

```bash
git add readme.md
git commit -m "docs: run the web app locally"
```
