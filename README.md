# RPL Compass

**SIH-26242 — AI-assisted Recognition of Prior Learning (RPL) assessment platform**

RPL Compass helps assessors certify the skills Indian workers already have on the
job, without making them sit a course again. It structures the assessment,
records every step, and — most importantly — **measures how much two assessors
agree** with each other, so low agreement is detected and flagged instead of
quietly shipping a certificate.

**Core idea: AI proposes, humans decide.** AI can suggest a match or a score;
a human assessor always makes the decision and a human admin signs the
certificate. The system audits whether the humans agree with each other
(Cohen's weighted kappa) and raises an alert when they do not.

## The problem (SIH26242)

Recognition of Prior Learning is slow, paper-heavy and inconsistent: two
assessors can score the same worker very differently, and nobody notices. The
problem statement (Ministry of Skill Development, SIH 2026) asks for an
AI-assisted skill-assessment tool that makes RPL fair, fast and trustworthy.
RPL Compass answers with a 5-step pipeline where agreement is measured, not
assumed.

## The 5-step pipeline

```
Declare  →  Match  →  Score  →  Measure  →  Certify
```

| Step | What happens | Where |
|---|---|---|
| **Declare** | The worker declares their trade, experience and skills (EN/HI/TA), with optional evidence. Works offline; syncs when back online. | `/rpl/declare` |
| **Match** | The declared skills are matched to an official NSQF qualification pack (AI proposes, with a local offline fallback matcher). | `/rpl/declare/result` |
| **Score** | An assessor scores each criterion on a 1–4 rubric. AI can offer a *suggestion*; the assessor can ignore it, and the app records whether the suggestion was used (`aiSuggestionUsed`). | `/rpl/assess` |
| **Measure** | Inter-assessor agreement is computed per qualification pack (Cohen's linear-weighted kappa, 95% CI, Landis & Koch band). κ < 0.4 raises an admin alert. | `/rpl/consistency/[packId]` |
| **Certify** | An admin reviews the recomputed profile and signs off; the worker gets a certificate with a human-readable reference code. | `/rpl/certify/[workerId]` |

## Roles

| Role | Who | Home after login | Notes |
|---|---|---|---|
| **Candidate** | The worker being assessed | `/rpl` | Anyone can sign up. Sees only their own record. |
| **Assessor** | Trained evaluator who scores candidates | `/rpl/assessor` | Granted **server-side** only (`RPL_ASSESSOR_EMAILS`). |
| **Admin** | Programme officer monitoring agreement and signing certificates | `/rpl/admin` | Granted **server-side** only (`RPL_ADMIN_EMAILS`). |

Role assignment is env-driven and enforced in three layers: client route
guards, API route checks, and Firestore security rules. A self-signed-up user
can never grant themselves assessor or admin.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Styling / UI | Tailwind CSS v3, shadcn/Radix UI, Lucide icons, Recharts |
| Auth / DB | Firebase Auth (email/password + Google popup) and Firestore, with a server session cookie |
| AI | Genkit + Google Gemini (multi-key rotation, offline TF-IDF fallback) |
| Offline | Service worker (scoped `/rpl/`) + IndexedDB queue that replays with a fresh ID token |
| i18n | English, Hindi, Tamil (`src/lib/rpl/i18n.ts`) |
| Tests | Playwright (E2E), Node test scripts (`scripts/test-*.mjs`) |

## Run locally (with the Firebase emulators)

Prerequisites: Node.js ≥ 22.13, npm.

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template (names are documented below; keep values out of git)
cp .env.example .env.local

# 3. Start the Firebase emulators — ALWAYS under the local demo project
npx firebase emulators:start --project demo-quorena \
  --import=./.firebase-emulator-data --export-on-exit=./.firebase-emulator-data

# 4. In a second terminal: dev server wired to the emulators (port 3456)
npx cross-env NEXT_PUBLIC_FIREBASE_EMULATOR=true \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 \
  npx next dev --turbopack -p 3456

# 5. (Optional) seed the demo data as admin
npm run demo:seed
```

Open <http://localhost:3456/rpl>. Never point any of these commands at a real
Firebase project — the scripts are emulator-only by design.

### Test accounts convention

Demo/test accounts use **fake emails ending in `@rplcompass.test`** — never a
real personal address:

| Email | Role |
|---|---|
| `admin@rplcompass.test` | admin (via `RPL_ADMIN_EMAILS`) |
| `assessor1@rplcompass.test` | assessor (via `RPL_ASSESSOR_EMAILS`) |
| `assessor2@rplcompass.test` | assessor (via `RPL_ASSESSOR_EMAILS`) |
| `candidate1@rplcompass.test` | candidate (default for sign-ups) |

### Key commands

| Command | Description |
|---|---|
| `npx firebase emulators:start --project demo-quorena …` | Start Auth + Firestore + RTDB emulators |
| `npx next dev --turbopack -p 3456` | Dev server used by the test suites |
| `npm run demo:seed` | Seed the demo dataset (emulator-only) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript check |
| `npx playwright test` | Playwright suites in `tests/` |
| `node scripts/test-kappa.mjs` | κ maths unit tests |
| `node scripts/test-i18n.mjs` | i18n integrity tests (EN/HI/TA) |

## Environment variables

Names only — values live in `.env.local` / hosting secrets and are never
committed. Full reference: [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

| Variable | Used for |
|---|---|
| `RPL_ADMIN_EMAILS` | Comma-separated emails granted the admin role at session mint |
| `RPL_ASSESSOR_EMAILS` | Comma-separated emails granted the assessor role |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Admin SDK credentials (server only) |
| `SERVICE_ACCOUNT_PATH` | Alternative: path to an Admin SDK credentials file |
| `GEMINI_API_KEYS` | Comma-separated Gemini keys (rotation + quota cooldown) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Single-key Gemini fallback |
| `GEMINI_API_KEY` | Legacy single-key fallback |
| `CRON_SECRET` | Bearer guard for `/api/cron/*` endpoints |
| `SIEM_WEBHOOK_URL` | Optional security telemetry export |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Realtime Database URL |
| `NEXT_PUBLIC_FIREBASE_EMULATOR` | Set to `true` only when running against emulators |
| `ALLOWED_GLADIATOR_EMAIL_DOMAIN` / `NEXT_PUBLIC_ALLOWED_GLADIATOR_EMAIL_DOMAIN` | Sign-up domain restriction |

Server-only variables must never be prefixed with `NEXT_PUBLIC_`.

## Status (honest, this branch)

**Verified locally against the emulators** (Playwright suites in `tests/`):
login/session chain and role redirects; candidate declare → result (reference
code, matched pack); assessor scoring end to end; admin demo-data load with
κ computed from the seeded ratings (ELE/Q1301 computes **κ = 0.3846, "Fair"**
— the low-agreement alert fires, which is the point of the demo); access
control (candidates cannot read other profiles or admin APIs).

**Built but not fully verified:** evidence upload, certification sign-off
click-through, AI suggestion endpoint against live Gemini keys, service-worker
offline replay in a real browser, preview-deployment clicks.

**Known caveats:**
- Hindi and Tamil strings are **machine-drafted and pending native-speaker
  review** (see `docs/i18n-review.md`); an in-app note says so.
- Gemini free-tier quota can be exhausted; the app falls back to a local
  matcher / shows "AI temporarily unavailable" instead of crashing.
- The demo numbers are computed from **synthetic demo data** (badged as such
  in the UI); no number in this app is hand-typed.

## Documentation

| Document | Description |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, data model, auth flow |
| [`docs/API.md`](docs/API.md) | API endpoint reference |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Data model reference |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | Environment variables reference |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security model |
| [`docs/INSTALL.md`](docs/INSTALL.md) | Installation notes |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deployment guide |
| [`docs/PPT-CORRECTIONS.md`](docs/PPT-CORRECTIONS.md) | Slide claims vs. what the app computes |

## Origin

Origin: built on the Quorena codebase. Quorena (formerly Knowledge Arena) is
an earlier quiz-battle platform by the same team; RPL Compass reuses its
stack — login, Firebase plumbing, AI integration and UI kit. The legacy
Quorena screens are quarantined for RPL users (they redirect to `/rpl`), and
RPL data is kept isolated from Quorena data. License: MIT.
