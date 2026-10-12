# SIH-26242-RPL — Full Read-Only Audit

**Branch audited:** `sih-26242-rpl` @ `22de50b6130d3ff61dbeafcb75ab18d3e80d561e`
**Repo:** `D:\Developer\Desktop\Knowledge-Arena` (origin `https://github.com/kathir-iTech/Knowledge-Arena.git`)
**Date:** 2026-10-09
**Mode:** READ-ONLY. No source file, config file, git ref, or Firebase/Vercel resource was modified.
This file is the only artifact written by the audit.

**Evidence conventions**
- `file:line` = committed/working-tree source, or raw command output quoted verbatim.
- **UNVERIFIED** = could not be checked from this machine.
- **NEEDS HUMAN CHECK** = must be confirmed in a web console (Vercel dashboard / Firebase console).
- Secrets are masked to their first 6 characters.

**Incidental side effects produced by read-only tooling (disclosed):**
1. `firebase projects:list` (earlier session) truncated/overwrote the gitignored `firebase-debug.log`.
2. `npm run build` (user-authorized) wrote to `.next/`.
3. An aborted full Playwright run (20-minute timeout) left partial results and screenshots on disk.
4. Temp evidence files written under `%TEMP%\opencode\` (`build-out.txt`, `pw-out.txt`, `preview-login.txt`, `preview-8378.js`, `preview-curl-json.txt`).
5. `vercel curl` (read-only GET) auto-generated a *deployment protection bypass token* for project `prj_6j6SeCxdbqG5XnDZ8TematwU1EIC` in order to reach protected preview URLs. No deployment, env var, domain, or Firebase document was created or changed.

---

# Section 10 — Summary (written last, placed first)

**Verdict: the RPL feature is real, substantial, wired end-to-end in code, and deployed — but only as a Vercel *preview*. It is absent from production, it is gated behind an environment/configuration puzzle that most plausibly explains the sign-in loop, and it ships with seven concrete, evidence-backed defects.**

1. **It is not a mock-up.** 12 route pages + 1 layout (`src/app/(rpl)/rpl/**`), 14 API routes (`src/app/api/rpl/**`), 9 library modules (`src/lib/rpl/*`), 2 Genkit flows, a 515-line rules block, a 571-line seeder and a 278-line Playwright spec (57 files under the branch carry `rpl` in the path). Every one of the 14 APIs is called by at least one UI surface, and every API enforces `verifyFirebaseToken*` (Section 6).
2. **It does not ship to users.** Production `https://knowledge-arena.vercel.app` answers `/api/rpl/alerts` with **404** and `/rpl` with **307 → `/`**; the preview answers **401** and **307 → `/login`** respectively. `git ls-tree -r origin/main` contains **0** files matching `rpl` (Section 1, Section 6).
3. **The likely sign-in root cause is environmental, not a broken login flow.** The client is hard-wired to Firebase project `studio-4092189688-c74a7` (`src/firebase/config.ts:2`) on both preview and production (observed in both bundles), while `.firebaserc` points at `demo-quorena` and the Admin SDK *throws* if `FIREBASE_SERVICE_ACCOUNT_KEY.project_id` differs (`src/lib/firebase-admin.ts:65`). If they differ, `/api/auth/session` returns 500 (`src/app/api/auth/session/route.ts:23-26`), no `__session` cookie is ever minted, and every `/rpl/*` request bounces back to `/login` (`src/middleware.ts:140-151`) — an infinite loop that matches the reported symptom exactly. Two other independent blockers sit in front of it: **Vercel Deployment Protection 302s every deployment URL to `vercel.com/sso-api`** (only the production alias is public), and the missing `*.vercel.app` Firebase authorized domain **NEEDS HUMAN CHECK** (Sections 1–3).
4. **A second, code-level loop exists for the non-RPL portals.** Middleware resolves roles from `decoded.customClaims?.role` only (`src/middleware.ts:169-171`), but custom claims are written in exactly one place (`src/app/api/admin/users/route.ts:388`). Any user created by Google sign-in has no claims → every `/executive`, `/commander`, `/gladiator` URL redirects to `/login` (Section 3).
5. **CSP is healthy and verified live.** Both production and preview serve a nonce + `strict-dynamic` policy whose header nonce matches the HTML nonce (`MATCH=YES` in both). The "tight host allowlist" CSP rewrite exists only in the **uncommitted** working tree and is not deployed. The preview carries the `frame-src` fix that the HEAD commit message claims (Section 4).
6. **Build gates:** typecheck ✅, build ✅, lint ❌ (1 error, 3 warnings, exit 1), full Playwright suite **not verified** (aborted > 20 min), CI never runs on this branch (`.github/workflows/ci.yml` triggers only on `main`), and CI contains **no lint step** at all (Section 5).
7. **Seven defects found in the RPL code itself** (Section 6): offline queue replays with no `Authorization` header (queued declarations can never sync); `POST /api/rpl/assess` never writes `overallScore`/`unitScores`/`scores`, so admin `avgScore` is always 0 for live data; the seeder writes κ=0.58 "Moderate" while the algorithm used by the app computes κ=0.384615 "Fair" for the same ratings, and writes κ=0.71 for a single-assessment pack; app and seeder use **different item-ID schemes** so seeded assessments render empty and then duplicate on save; 5 of 14 APIs have no rate limit; the AI suggest endpoint returns HTTP 200 with a fabricated score on failure; `rpl_forge_cache` has no rules match (harmless because it is Admin-SDK-only, but the rules file documents the old `forge_cache` name).
8. **Rules/indexes are consistent but their deployment is unproven.** `firestore.rules` is byte-identical to `firestore.rules.template` (SHA256 `2170E3F1…`, 515 lines) so the CI hash gate would pass; all RPL queries are single-field, which is why zero `rpl_*` entries exist in `firestore.indexes.json`; Storage is inert by design (Spark plan). Whether these rules are actually live on `studio-4092189688-c74a7` is **NEEDS HUMAN CHECK** because the Firebase CLI token refresh fails (Section 7).
9. **Branding is 100 % "Quorena" and 100 % quiz-oriented.** The landing page headline is "Turn any lesson into a live quiz." and no landing component mentions RPL at all, so the SIH feature is reachable only by typing `/rpl` (Section 8).
10. **Security hygiene is decent**: no committed private keys, `.env.local` untracked, Bearer-auth on every API, distributed Firestore rate limiter, HSTS/XFO/XCTO present, no CORS, no `dangerouslySetInnerHTML`. Remaining gaps: 5 unrated routes, service-worker PII cached on device, the client Firebase web API key committed in `scripts/*`, and `secure` cookie flag weakened in the uncommitted diff (Section 9).

**Top three actions for a human, in order:** (1) confirm `FIREBASE_SERVICE_ACCOUNT_KEY.project_id` equals `studio-4092189688-c74a7` in Vercel Preview+Production and that `*.vercel.app` is an authorized domain; (2) turn off Deployment Protection (or publish the bypass URL) so judges can open the preview; (3) fix the middleware role source and the two write-path defects (D1, D2 in Section 6) before any live demo.

---

# Section 1 — Git & deployment state

## 1.1 Local repository

```
$ git log -1 --format='%H %ad %s' --date=iso
22de50b6130d3ff61dbeafcb75ab18d3e80d561e 2026-10-04 20:49:30 +0530 Fix: CSP frame-src for Firebase auth redirect on SIH preview

$ git status -sb          →  ## sih-26242-rpl
$ git rev-parse --abbrev-ref '@{u}'
fatal: no upstream configured for branch 'sih-26242-rpl'
```

- HEAD = branch tip of `sih-26242-rpl`; **no upstream/tracking configured** (so `git status` will not show ahead/behind counts).
- Remote tips (read-only `git ls-remote origin`):
  - `refs/heads/sih-26242-rpl` = `22de50b6130d3ff61dbeafcb75ab18d3e80d561e` → **identical to HEAD: no unpushed commits.**
  - `refs/heads/main` = `ec210aa9983211882b5f952e7fb2d617f3fedf39`
- **Local tracking ref `origin/main` = `32c51b7`** ("Freeze pre-pilot tree: battle submit route, rules hardening, test infra", 2026-09-22). The remote has moved to `ec210aa…`, which is **not present in the local object store** (`git cat-file -t` → *fatal: could not get object info*). Content and ancestry of GitHub `main` are therefore **UNVERIFIED** — the audit did not `git fetch` (read-only rule). Everything below that compares against "main" uses the local `32c51b7` ref and must be re-checked after a fetch.

```
$ git diff --stat origin/main..HEAD
63 files changed, 13371 insertions(+), 4 deletions(-)
```

## 1.2 Working tree (not committed, not deployed)

`git status --porcelain`:

| State | Files |
|---|---|
| ` M` (tracked, modified) | `API.md`, `ARCHITECTURE.md`, `SECURITY.md`, `SECURITY_NOTES.md`, `docs/JUDGE_QA.md`, `next.config.ts`, `scripts/seed-demo.ts`, `src/app/layout.tsx`, `src/components/ClientLayout.tsx`, `src/components/GladiatorSidebar.tsx`, `src/contexts/AuthContext.tsx`, `src/lib/session-cookie.ts`, `src/middleware.ts` |
| `??` (untracked) | `.github/workflows/playwright.yml`, `database-debug.log`, `screenshots/`, `tests/take-screenshots.spec.ts`, `tests/zz-probe.spec.ts` |

The 13 modified files are the Phase‑1 login-chain set: CSP nonce→allowlist rewrite (`src/middleware.ts`), cookie `secure` flag now production-only (`src/lib/session-cookie.ts:34-42`), login redirect logic (`src/contexts/AuthContext.tsx`, `src/components/ClientLayout.tsx`), sidebar (`src/components/GladiatorSidebar.tsx`), `next.config.ts`, plus documentation. **None of it is on the remote.** `firestore.rules`, `firestore.rules.template`, `firestore.indexes.json` and `storage.rules` are **not** modified.

## 1.3 Vercel state

`vercel ls knowledge-arena` (project `kathirs-projects-0d1795d0/knowledge-arena`, account scope `kathirs-projects-0d1795d0`, logged in as `kathir-itech`):

| Age | Deployment URL | Target | Created | Aliases |
|---|---|---|---|---|
| 4d | `knowledge-arena-19xiiqffd-kathirs-projects-0d1795d0.vercel.app` | production | Mon Oct 05 2026 06:24:08 +0530 (`vercel inspect`) | `knowledge-arena.vercel.app`, `knowledge-arena-kathirs-projects-0d1795d0.vercel.app`, `knowledge-arena-git-main-kathirs-projects-0d1795d0.vercel.app` |
| 4d | `knowledge-arena-q44w8llgo-…vercel.app` | production | (older prod) | — |
| **5d** | **`knowledge-arena-1pm684s00-kathirs-projects-0d1795d0.vercel.app`** | **preview** | **Sun Oct 04 2026 20:49:43 +0530** (`dpl_HZUrnRrXMupCcCukQF4pCGbEmjMY`) | `knowledge-arena-git-sih-26242-rpl-kathirs-projects-0d1795d0.vercel.app` |
| 5d | `knowledge-arena-qf4adlo2h-…vercel.app` | preview | 20:42:10 (+0530) | — |
| 5d | `knowledge-arena-8coxlfifl-…vercel.app` | preview | — | — |

- **The preview was created 13 seconds after the HEAD commit** (commit 20:49:30 → deployment 20:49:43) and its build log lists 309 output items, i.e. the deployed preview **is commit `22de50b`**, including the RPL tree and the `frame-src` fix.
- **The 13 uncommitted files are not in that deployment.**
- No `.vercel/` directory exists → the project is **unlinked** locally (`vercel …` calls resolved by project name/scope only).
- **Environment variables (names only; values shown as "Hidden" by `vercel env ls`):** `CRON_SECRET` (Production only); `GEMINI_API_KEYS`, `GOOGLE_GENERATIVE_AI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` (Production + Preview). **Values are not readable** without writing a file to disk (forbidden) → **NEEDS HUMAN CHECK**.

## 1.4 Deployment Protection (the single biggest access blocker)

```
$ curl -sI https://knowledge-arena-1pm684s00-kathirs-projects-0d1795d0.vercel.app/login
HTTP/1.1 302 Found
Location: https://vercel.com/sso-api?url=https%3A%2F%2Fknowledge-arena-1pm684s00-...%2Flogin&nonce=29ccc71d…
Set-Cookie: _vercel_sso_nonce=…; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax
X-Robots-Tag: noindex
Protected by Vercel Authentication
```
Same 302 for the **production deployment URL** `knowledge-arena-19xiiqffd-…` and even for a static asset (`/_next/static/css/aace3db49b5bf1a0.css` → 302).
Only `https://knowledge-arena.vercel.app` (the production alias) returns `HTTP/1.1 200 OK`.

**Consequence:** any judge or anonymous visitor who opens the preview URL (or the raw production deployment URL) gets a Vercel login wall, not the app. This alone can look like "login is broken" before Firebase is ever reached. → **NEEDS HUMAN CHECK** (Vercel → Project → Settings → Deployment Protection).

Because of this, preview content in this audit was fetched with `vercel curl` (authenticated, read-only GET) — see §1.5 and Sections 2/4.

## 1.5 Black-box deploy-state probes (GET only, no auth)

| Probe | Production (`knowledge-arena.vercel.app`) | Preview (`knowledge-arena-1pm684s00-…`) |
|---|---|---|
| `GET /login` | `200 OK` + nonce CSP | `200 OK` + nonce CSP incl. `frame-src` |
| `GET /rpl` | **`307 → https://knowledge-arena.vercel.app/`** | **`307 → …/login`** |
| `GET /rpl/admin` | `307 → /` | (not probed) |
| `GET /api/rpl/alerts` | **`404 Not Found`** (`X-Next-Error-Status: 404`, Next `_not-found` HTML) | **`401 {"error":"Unauthorized"}`** |
| `GET /api/rpl/status/self` | (not probed) | `401 {"error":"Unauthorized"}` |

Interpretation:
- Production has **no RPL UI and no RPL API** → matches `git ls-tree -r origin/main | findstr rpl` → **0 files** (local `32c51b7` ref).
- The `/rpl → /` redirect on production is explained exactly by `origin/main:src/middleware.ts` line 119‑120 `if (!requiredRole) return NextResponse.redirect(new URL('/', …))`, whereas HEAD inserts a dedicated `/rpl` branch first (`src/middleware.ts:135-151`) that redirects unauthenticated users to `/login`.
- Preview returns 401 (not 404) for the RPL APIs → the RPL routes are live and their auth gates work.

---

# Section 2 — Which Firebase project

## 2.1 Client SDK (hard-coded)

`src/firebase/config.ts`:
- line 2: `projectId: "studio-4092189688-c74a7"` — **literal, not from env**
- line 4: `apiKey: "AIzaSy…"` (masked: `AIzaSy…`, 39 chars; also present in `scripts/e2e-test.ts:48` and `scripts/api-test.ts:45`)
- lines 5–6: `authDomain` / `databaseURL` = `process.env.NEXT_PUBLIC_FIREBASE_* || "<studio-…>.firebaseapp.com"` fallback
- **No code anywhere reads `NEXT_PUBLIC_FIREBASE_PROJECT_ID`** (grep over `src/` and `scripts/` → no hits) → the client project is *always* `studio-4092189688-c74a7`, whatever the env var says.

## 2.2 Observed in the deployed bundles (live evidence)

`/_next/static/chunks/8378-577f1288ed683648.js` (**preview**, fetched with `vercel curl`) contains:
```
projectId:"studio-4092189688-c74a7"
authDomain:"studio-4092189688-c74a7.firebaseapp.com"
apiKey:"AIzaSy…"
projectId:"demo-quorena"        ← emulator branch
apiKey:"demo-key"
```
Production chunk `8378-85128ecf3ba74887.js` contains the same `studio-4092189688-c74a7` values (earlier session). → Preview and production are pointed at **the same Firebase project**, and `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` on preview is the studio domain (or unset → fallback).

## 2.3 Admin SDK (must match, or it throws)

`src/lib/firebase-admin.ts`:
- line 22: `const EMULATOR_PROJECT_ID = 'demo-quorena'` (emulator mode, lines 36/82)
- lines 55–60: validates `type/project_id/private_key/client_email`
- **lines 65–68:** `if (parsed.project_id !== firebaseConfig.projectId) throw new Error("Firebase Admin SDK: Service account project \"…\" does not match client project …")`

So `FIREBASE_SERVICE_ACCOUNT_KEY.project_id` **must** be `studio-4092189688-c74a7`. Its value is unreadable from here → **NEEDS HUMAN CHECK** (Vercel → Environment Variables → `FIREBASE_SERVICE_ACCOUNT_KEY` → `.project_id`).

## 2.4 CLI / project targets

- `.firebaserc` → `"default": "demo-quorena"` (a demo/emulator target, **not** the studio project).
- `firebase.json` declares no project (only rules/indexes/emulators/predeploy).
- Firebase CLI is logged in as `25d148@psgitech.ac.in` but token refresh fails (`oauth2/v3/token` → 400, then projects list → 401) → **no Google read access from this machine**; `gcloud` and ADC are absent.
- Therefore **authorized domains / Google provider status cannot be read**: → **NEEDS HUMAN CHECK** at
  `https://console.firebase.google.com/project/studio-4092189688-c74a7/authentication/settings` (Authorized domains must include both `*.vercel.app` origins used above, and the provider must be enabled).

---

# Section 3 — Login chain, traced end to end

| # | Step | Evidence |
|---|---|---|
| 1 | Landing → `Sign in` → `/login` | `src/components/landing/LandingHero.tsx:46`, `LandingNav.tsx:44` |
| 2 | `/login` renders `LoginForm` (optionally prefilled with demo creds) | `src/app/login/page.tsx:8,46` |
| 3a | **Gladiators:** "Continue with Google" → `signInWithGoogle()` → `signInWithRedirect` | `src/components/auth/LoginForm.tsx:51-52,58-69` (label: *"Gladiators - Sign in with Google (Part 5A: open signup)"*) |
| 3b | **Staff:** email+password → `login()`; *"Accounts are created by your Executive"* | `LoginForm.tsx:82-87` |
| 4 | Redirect back → `onAuthStateChanged` → `ensureGladiatorProfile(uid, …)` creates/merges `users/{uid}` with **`role: 'gladiator'`** client-side | `src/contexts/AuthContext.tsx:118`, `:158`, `:164`; called at `:269` |
| 5 | `migrateSession()` → `POST /api/auth/session` with `Authorization: Bearer <idToken>` | `AuthContext.tsx:318,347`; comment at `:453` admits a failure here is silent |
| 6 | `createSessionCookie(idToken)` → `Set-Cookie: __session`, `httpOnly`, `SameSite=Lax`, `maxAge=3600`, `secure` | `src/app/api/auth/session/route.ts:18-21`; `src/lib/session-cookie.ts:4-10,12-15,33-42` (working tree: `secure` only when `NODE_ENV==='production'`, lines 34‑40); HEAD version: `secure: opts.secure ?? true` |
| 7 | Any failure → **`500 {"error":"Failed to create session"}`** | `src/app/api/auth/session/route.ts:23-26` |
| 8 | `middleware` gates the route. Portals require a valid cookie **and** `customClaims.role` | `src/middleware.ts:143-148,169-171` |
| 9 | `/rpl/*` requires only a *valid* cookie (Admin-SDK `verifySessionCookie(…, true)`), no role claim | `src/middleware.ts:135-151` |
| 10 | `ClientLayout` shows **"Authenticating..."** while `isLoading` | `src/components/ClientLayout.tsx:113-114` |
| 11 | Post-login home: `ROLE_HOME` = executive `/executive/workspace`, commander `/commander/dashboard`, gladiator `/gladiator/dashboard`; `AppRole` = those 3 only — **no student/RPL role** | `src/lib/auth-redirect.ts:3-6,9,13,17` |
| 12 | API-side role resolution: `customClaims` first, **Firestore fallback** | `src/lib/verify-auth.ts:119-140` |

**There is no sign-up button anywhere** — sign-up is implicit in the Google flow (step 4 writes the user doc with `role: 'gladiator'`).

### 3.1 Candidate root causes of the "Authenticating…/login loop" (ranked)

| # | Hypothesis | Evidence | Status |
|---|---|---|---|
| A | **Admin SDK project mismatch** → `createSessionCookie` throws → 500 → cookie never set → `/rpl/*` → `/login` → repeat | `src/lib/firebase-admin.ts:65-68`, `src/app/api/auth/session/route.ts:23-26`, `src/middleware.ts:140-148` | Plausible; needs env value → **NEEDS HUMAN CHECK** |
| B | **Vercel Deployment Protection** 302s the URL to `vercel.com/sso-api` before the app runs | §1.4 raw headers | **Confirmed** (occurs today) |
| C | **Missing `*.vercel.app` authorized domain** in Firebase → `auth/unauthorized-domain` on the OAuth return | `authDomain` = `studio-4092189688-c74a7.firebaseapp.com` observed in both bundles | **NEEDS HUMAN CHECK** |
| D | **No custom claims for non-executive-created users** → portal URLs redirect to `/login` even with a good cookie | claims written only at `src/app/api/admin/users/route.ts:388`; middleware reads only `customClaims` at `src/middleware.ts:169-171` | **Confirmed in code** (affects `/executive`, `/commander`, `/gladiator`, `/create-quiz`; `/rpl` is exempt) |
| E | Google path silently loses the session: `migrateSession` failure is swallowed; `signupInProgress` guard is dead (never set `true`) | `AuthContext.tsx:345` (read-only guard), `:453`, `:91` | Confirmed in code |

---

# Section 4 — CSP / middleware

## 4.1 What is actually served (observed)

**Production `GET /login`** (raw headers):
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-eaa4582c-…' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com https://lh3.googleusercontent.com;
  connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com
  https://identitytoolkit.googleapis.com https://securetoken.googleapis.com wss://*.firebaseio.com;
  font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff    X-Frame-Options: DENY    X-Dns-Prefetch-Control: off
```
Nonce check: `HEADER_NONCE=9712236e-… / HTML_NONCE=9712236e-… / MATCH=YES` → **the policy does not break the app's own scripts.**

**Preview `GET /login`** (via `vercel curl -D -`):
```
Content-Security-Policy: … frame-ancestors 'none'; frame-src 'self' https://studio-4092189688-c74a7.firebaseapp.com https://vercel.live; …
HEADER_NONCE=d4b2bb1c-… / PREVIEW_BODY_NONCE=d4b2bb1c-… / MATCH=YES
X-Robots-Tag: noindex
```
→ the HEAD commit's `frame-src` fix **is deployed** (matches `git show HEAD:src/middleware.ts:69`).

## 4.2 Source of truth

- **Committed HEAD** (`git show HEAD:src/middleware.ts`): per-request `crypto.randomUUID()` nonce, `x-nonce` request header + `Content-Security-Policy` response header (lines 77‑87), `frame-src … studio-…firebaseapp.com https://vercel.live` (line 69), matcher excludes `_next/static|image|favicon|icons|robots.txt` (exported `config` at the end of the file).
- **Working tree (UNCOMMITTED):** switches to a *tight host allowlist* and documents why: *"never fully wired (Next never stamped the nonce onto its framework scripts), so the policy blocked login for several rounds… Decision: drop the nonce/'strict-dynamic' entirely"* (`src/middleware.ts:29-36`). **This rewrite is not deployed** and contradicts the observed, working nonce policy — a decision to be made deliberately, not accidentally via commit.
- Middleware skips CSP entirely for API/assets (`src/middleware.ts:99-112` → `if (isApiOrAsset) return NextResponse.next()`), which is why API 404s carry no CSP header.

## 4.3 `next.config.ts` gates

`next.config.ts:7` `output: 'standalone'`; `:24` `ignoreBuildErrors: false`; `:32` `ignoreDuringBuilds: true` (ESLint skipped at build); `:36` `serverActions.bodySizeLimit: '20mb'`; `:43` `ppr: false`.

---

# Section 5 — Build gates

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 | re-run this session: `TYPECHECK_EXIT=0` |
| Lint | `npm run lint` (`next lint`) | ❌ **exit 1** | re-run this session (below) |
| Build | `npm run build` | ✅ exit 0, 122 routes, "Skipping linting", 1 warning (`src/app/api/rpl/assess/suggest/route.ts` opentelemetry critical dependency) | `%TEMP%\opencode\build-out.txt` (211 lines) |
| Unit tests | none configured | no vitest/jest anywhere; `package.json.scripts.test = "playwright test"` | `package.json` |
| E2E subset | `npx playwright test tests/battle-idempotency.spec.ts` | ✅ 5 passed (4.3 s) | earlier session |
| E2E full | `npm test` | ⚠️ **not verified** — aborted after 20 min; partial log `%TEMP%\opencode\pw-out.txt` (3096 lines, ≥147 test executions) with `ERR_CONNECTION_REFUSED at http://127.0.0.1:3456/` and live-site assertion failures | requires dev server on 3456 + emulators (none running; ports 8080/9099/9000 closed) |

Fresh lint output (verbatim, exit 1):
```
./src/ai/flows/rpl-forge-flow.ts
228:9  Error: 'allowedMethods' is assigned a value but only used as a type.  @typescript-eslint/no-unused-vars
./src/app/(rpl)/rpl/assess/[assessmentId]/page.tsx
597:23  Warning: Using `<img>` … @next/next/no-img-element
606:25  Warning: Using `<img>` …
./src/app/(rpl)/rpl/profile/[workerId]/page.tsx
357:21  Warning: Using `<img>` …
```
(`next lint` itself warns it is deprecated in Next 16.)

**CI reality (`.github/workflows/ci.yml`):**
- triggers: `push`/`pull_request` **only to `main`** → **this branch has never run CI**.
- steps: Firestore-rules hash gate (`cp firestore.rules /tmp/…; npm run rules:generate; cmp`) → `npm run typecheck` → `npm run build` (with `GOOGLE_GENERATIVE_AI_API_KEY`) → `npx playwright install` → `firebase emulators:exec --only firestore,auth --project demo-test "npx playwright test tests/phase114-responsive.spec.ts tests/landing.spec.ts tests/phase113-e2e.spec.ts tests/command-center.spec.ts"`.
- **There is no lint step in CI**, so the failing lint would not block a merge today.
- `.github/workflows/playwright.yml` (runs the whole `tests/` dir on `main`/`master`) is **untracked** — not in effect.

**Test inventory:** `playwright.config.ts` (`baseURL http://localhost:3456`, `timeout 60000`, `retries 1`, chromium), `playwright.e2e.config.ts` (`testDir ./e2e`), **12 files in `tests/`** (10 `*.spec.ts` plus `qa-e2e.js`, `qa-workflow.ps1`), including **`tests/rpl-e2e.spec.ts` (278 non-empty lines / 304 added lines per `git diff`, 6 tests across 4 suites: declaration wizard, assessor scoring, kappa report, 3 access-control cases; BASE `http://127.0.0.1:3456`, requires emulators)** — never executed in this audit.

---

# Section 6 — RPL feature reality check

## 6.1 Inventory (all present, all substantial)

- **UI:** 12 `page.tsx` + `layout.tsx` = 13 files, **4810 lines** total (measured):
  `rpl` 171 · `rpl/layout` 79 · `admin` 482 · `assess` 171 · `assess/[assessmentId]` 742 · `assessor` 392 · `certify/[workerId]` 304 · `consistency/[packId]` 443 · `declare` 695 · `declare/result` 401 · `forge` 289 · `profile/[workerId]` 384 · `status` 257.
- **API:** 14 routes (`src/app/api/rpl/**`), **2135 lines** total (measured).
- **Lib:** `src/lib/rpl/{competency-profile,evidence-upload,kappa-monitor,kappa,nsqf-packs,offline-store,recompute-consistency,rpl-collections,types}.ts`.
- **AI:** `src/ai/flows/rpl-forge-flow.ts`, `src/ai/flows/rpl-matching-flow.ts`; suggest route `src/app/api/rpl/assess/suggest/route.ts`.
- **Data:** `scripts/rpl/seed-rpl-demo.mjs` (571 lines), `tests/rpl-e2e.spec.ts` (304 lines), `public/rpl-sw.js`, rules block `firestore.rules:533-551`.
- **Content:** 3 NSQF packs — `ELE/Q1301` (Electrician, `nsqf-packs.ts:39`), `CON/Q0304` (Plumber, `:112`), `SSC/Q2212` (IT‑ITeS Data Entry, `:185`) — **12 competency units** (`id: 'ELE/N1301'…` at lines 46,62,78,94 / 119,135,151,167 / 192,208,224,240) each with `performanceCriteria[]` (arrays at lines 48,64,80,96,121,137,153,169,194,210,226,242).

## 6.2 API gate table (verified by reading each `route.ts`)

| Route | Methods | Auth | Role | Rate limit |
|---|---|---|---|---|
| `/api/rpl/admin/overview` | GET | `WithRole('executive')` | executive | ❌ none |
| `/api/rpl/alerts` | GET | `WithRole('executive')` | executive | 30/min |
| `/api/rpl/assess` | GET | `WithAnyRole([commander,executive])` | — | ❌ none |
| `/api/rpl/assess` | POST | `WithRole('commander')` | commander | ❌ none |
| `/api/rpl/assess/[assessmentId]` | GET | `WithAnyRole([commander,executive])` | — | ❌ none |
| `/api/rpl/assess/my-consistency` | GET | `WithAnyRole([commander,executive])` | — | 30/min |
| `/api/rpl/assess/suggest` | POST | `WithRole('commander')` | commander | 10/min |
| `/api/rpl/certify` | POST | `WithRole('executive')` | executive | 15/min |
| `/api/rpl/consistency/[packId]` | GET | `WithRole('executive')` | executive | ❌ none |
| `/api/rpl/declare` | POST | `verifyFirebaseToken` (any) | — | 15/min |
| `/api/rpl/evidence` | POST/GET/DELETE | AnyRole([cmd,exec]) / +gladiator on GET | — | 15·30·15/min |
| `/api/rpl/forge` | POST | `WithAnyRole([cmd,exec])` | — | 10/min |
| `/api/rpl/match` | POST | `verifyFirebaseToken` (any) | — | 3/min |
| `/api/rpl/profile/[workerId]` | GET | `verifyFirebaseToken` + in-route privileged check (`route.ts:53-55` → 403) | — | 30/min |
| `/api/rpl/status/[workerId]` | GET | `verifyFirebaseToken` + resolved-uid privileged check (`route.ts:70-72` → 403) | — | ❌ none |

Client pages use **only** these APIs — there is **no client-side Firestore read/write for RPL** (grep for `.where|getDocs|setDoc|onSnapshot` in `src/app/(rpl)/**` → zero hits). Evidence images are compressed client-side (`src/lib/rpl/evidence-upload.ts:35-45`, target ≤ ~700 KB) and POSTed as base64 to `/api/rpl/evidence` (Admin-SDK write).

## 6.3 Live behaviour of the deployed preview (GET probes)

- `GET /rpl` → `307 /login` (middleware branch works, `src/middleware.ts:140-151`).
- `GET /api/rpl/alerts` → `401 {"error":"Unauthorized"}`; `GET /api/rpl/status/self` → `401` → auth gates work in production-shaped Node runtime.

## 6.4 Defects found (each is code-verifiable)

**D1 — Offline queue can never sync (data loss for the demo).**
`public/rpl-sw.js` `sync` handler replays with `fetch('/api/rpl/declare', { method:'POST', headers:{'Content-Type':'application/json'}, body: … })` — **no `Authorization: Bearer` header** — while the route requires one (`src/app/api/rpl/declare/route.ts:21 verifyFirebaseToken(req)`). Every replay gets 401, `res.ok` is false, the record is never deleted → infinite, permanently-failing queue. The queued payload also carries `localId`/`savedAt` (`rpl-sw.js` `storeRecord` path, `src/lib/rpl/offline-store.ts:53-58`). Registration itself is correct: `src/app/(rpl)/rpl/layout.tsx:30-34` registers `/rpl-sw.js` with `scope: '/rpl/'`.

**D2 — Admin overview scores are always 0 for live data.**
`POST /api/rpl/assess` builds `parentData = { assessorId, workerId, packId, status, aiSuggestionUsed, createdAt, updatedAt, … }` (`src/app/api/rpl/assess/route.ts:136-156`) — it writes **neither `overallScore`, `unitScores`, nor `scores`**. `admin/overview` computes `assessmentScore()` from exactly those three fields (`src/app/api/rpl/admin/overview/route.ts:67-88`) and its own comment says the fallback is *"`0` when no submitted assessment for the pack carries a score"*. Seeder-written assessments do carry `scores` (`scripts/rpl/seed-rpl-demo.mjs:324`), so **demo data looks right and real data looks empty** — a classic demo-vs-real divergence.

**D3 — Seeded κ contradicts the app's own κ implementation.**
- Seeder arrays: `ASSESSOR1_EU1=[4,3,4,4]`, `ASSESSOR1_EU2=[3,3,2,4]`, `ASSESSOR2_EU1=[3,3,3,4]`, `ASSESSOR2_EU2=[2,3,2,3]` (`seed-rpl-demo.mjs:73-78`) → concatenated `RATINGS_A/B`.
- It **writes** `kappa: 0.58, interpretation: 'Moderate', assessmentCount: 2` (`:378-382`) and prints `kappa=0.58 Moderate` in its summary (`:564`), while the same script also computes `seedKappa = computeKappa(RATINGS_A, RATINGS_B)` from the app's `src/lib/rpl/kappa.ts` and prints it (`:490-495`, `:558`).
- Independent reproduction of `computeKappa` (linear-weighted, `kappa.ts:90-111`) on those exact arrays: `po=0.833333 pe=0.729167 **kappa=0.384615 → 'Fair'**` (`interpretKappa` thresholds at `kappa.ts:16-24`: `<0.4 Fair`, `<0.6 Moderate`). **0.58 "Moderate" ≠ 0.384615 "Fair".**
- Second pack: writes `kappa: 0.71, 'Substantial', assessmentCount: 1` (`:460-464`) — a **single** assessment cannot yield a pairwise inter-assessor κ at all (`recomputePackConsistency` needs ≥2 submitted docs, `src/lib/rpl/recompute-consistency.ts:60-65`; `computeKappa` needs paired vectors, `kappa.ts:57-61`).

**D4 — Two incompatible item-ID schemes (breaks seeded assessments).**
- App (UI + save path): `` const itemId = `${unit.id}::p${idx}` `` and `` `${unit.id}::k${idx}` `` (`src/app/(rpl)/rpl/assess/[assessmentId]/page.tsx:60`, `:76`), saved via `docRef.collection('items').doc(sanitizeDocId(item.itemId))` (`src/app/api/rpl/assess/route.ts:177`).
- Seeder: `` sanitizeItemId = `${unitId.replace(/\//g,'-')}-p${idx}` `` → `ELE/N1301-p0` (`seed-rpl-demo.mjs:95-97`, used at `:355`, `:435`).
Consequence: opening a seeded assessment, the UI's `byId.get(itemId)` never matches (`page.tsx:62`) → all scores render empty; saving writes a *second* set of `::p` items next to the seeded `-p` items; `recompute-consistency` reads **every** doc in `items` (`src/lib/rpl/recompute-consistency.ts:78`) → criteria double-counted → κ distorted.

**D5 — 5 of 14 RPL APIs have no rate limit:** `admin/overview`, `assess` (GET+POST), `assess/[assessmentId]`, `consistency/[packId]`, `status/[workerId]` (grep for `enforceRateLimit` in each `route.ts`).

**D6 — AI suggest fails open with a fabricated score.** `FALLBACK = { proposedScore: 2, rationale: 'AI suggestion unavailable — score manually.' }` returned as **HTTP 200** in the catch (`src/app/api/rpl/assess/suggest/route.ts:15-18` + catch block); rate limit 10/min; 30 s timeout (`SUGGEST_TIMEOUT_MS`); model `gemini-3.6-flash` via `withGeminiKeyRotation` + `createGenkitForKey`. Whether that model id is valid for the configured keys is **UNVERIFIED** (key values unreadable) → **NEEDS HUMAN CHECK**.

**D7 — Rules/name drift (benign but confusing):** the app writes `rpl_forge_cache` (`rpl-collections.ts:8`, used `rpl-forge-flow.ts:411-413`) but the rules file documents/matches the old name `forge_cache` (`firestore.rules:502-506`). Because the flow uses the Admin SDK the mismatch does not fail today; any future client read would be denied.

### Not-a-bug (checked and cleared)
- `consistencyByPack` lookup keys the map on the `packId` **field** (`admin/overview:128`) and reads `pack.id` (`:153`) → consistent with `docToStore.packId` (`recompute-consistency.ts:238`); an earlier suspicion of a doc-id/field mismatch is **wrong**.
- Kappa is genuinely computed from per-criterion items (`recompute-consistency.ts:60,78`), not from a hard-coded table.
- `evidence-upload.ts` is **not** dead: imported and driven by the assessment page (`page.tsx:15,225,374-375,398`).

## 6.5 Wiring of the UI to the APIs (page → endpoint)

`admin` → `/api/rpl/admin/overview`, `/api/rpl/alerts` · `assess` → `/api/rpl/assess` · `assess/[assessmentId]` → `/api/rpl/assess/{id}`, `/api/rpl/assess/suggest`, evidence helpers · `assessor` → `/api/rpl/assess`, `/api/rpl/assess/my-consistency` · `certify/[workerId]` → `/api/rpl/certify` · `consistency/[packId]` → `/api/rpl/consistency/{packId}` · `declare` → `/api/rpl/declare`, `/api/rpl/match` · `declare/result`, `status`, `rpl` → `/api/rpl/status/…` · `forge` → `/api/rpl/forge` (2 calls) · `profile/[workerId]` → `/api/rpl/profile/{id}`.
**All 14 endpoints are exercised by the UI** (evidence collected by enumerating every `fetch(` under `src/app/(rpl)`).

## 6.6 Seeder is not wired

`scripts/rpl/seed-rpl-demo.mjs` is referenced **nowhere** in `package.json.scripts` (only `demo:seed`/`demo`, which run the emulator quiz seeder `scripts/seed-demo.ts`) nor in any `.github` workflow → running it is a manual, undocumented step.

---

# Section 7 — Firestore rules, indexes, Storage

## 7.1 Rules

- `firestore.rules` is **generated from `firestore.rules.template`** (`scripts/generate-firestore-rules.js:14-45`, wired as `firebase.json` predeploy `npm run rules:generate`).
- **Read-only verification of the CI hash gate:** template has **no** `{{ALLOWED_GLADIATOR_EMAIL_DOMAIN}}` placeholder, and
  `SHA256(firestore.rules.template) = SHA256(firestore.rules) = 2170E3F1FB1EF4F4E6D70193E94008865881AF4DE876733C5F148CA8575BB437`, both 515 lines → **identical, gate would pass**; `git status` shows neither file modified.
- RPL blocks (present in **both** template and rules):

| Path | Rule (verbatim intent) | Line |
|---|---|---|
| `/rpl_workers/{workerId}` | read: owner ∥ commander ∥ executive · create: owner · update: owner ∥ executive | `firestore.rules:533-537` |
| `/rpl_assessments/{assessmentId}` | read: commander ∥ executive ∥ `resource.data.workerId == auth.uid` · create/update: commander ∥ executive | `:538-541` |
| `/rpl_assessments/{id}/items/{itemId}` | read: commander ∥ executive · write: commander | `:542-545` |
| `/rpl_consistency/{packId}` | **read: any signed-in user** · write: executive | `:546-549` |
| `/rpl_certifications/{workerId}` | read: owner ∥ commander ∥ executive · write: executive | `:550-553` |

- **No rule** exists for `rpl_forge_cache` or the `rpl_assessments/{id}/evidence` subcollection → **default deny** for clients, which is correct: both are written only through the Admin SDK (`rpl-forge-flow.ts:411-413`, `src/app/api/rpl/evidence/route.ts:95,152,217`; stated in `evidence-upload.ts:1-5`).
- Noted exposure: `rpl_consistency` is readable by *any* authenticated user (κ values + assessor ids) — acceptable for a demo, worth a second look.
- Other collections are locked down for writes (`rate_limits`, `ai_jobs`, `forge_cache`, `search_df`, `ai_translations`, `auditLogs`, `notifications`, `ai_logs`, `security_logs` → `allow … if false`, `firestore.rules:445-516`).

## 7.2 Indexes

`firestore.indexes.json`: **19 composite indexes + 1 `fieldOverride`**, covering `quizzes`, `users`, `executive_requests`, `question_bank`, `auditLogs`, `security_logs`, `notifications`, `ai_logs`, `battle_logs`, `participants` — **zero `rpl_*` entries**.
Cross-check against every RPL query in code (all single-field):

```
admin/overview:106-109   where status=='draft' | status=='submitted' | signedAt>=…
admin/overview:169-171   orderBy declarationSubmittedAt desc limit 10 | submittedAt | signedAt
assess:33                where assessorId==uid
assess/my-consistency:75,126  where assessorId==… | where packId==…
certify:79 · profile/[workerId]:60 · status/[workerId]:117  where workerId==…
status/[workerId]:48-51  where assessmentReferenceCode==… limit 1
recompute-consistency:60 where packId==…
```
→ each needs only Firestore's automatic single-field index; `src/app/api/rpl/status/[workerId]/route.ts:115-116` states this explicitly ("never touch firestore.indexes.json"). **Consistent — no missing index found.**

## 7.3 Storage

`storage.rules` (18 lines): header comment *"Storage is NOT provisioned on this Firebase project (Spark plan, requires Blaze)… Do NOT deploy with `firebase deploy --only storage`"*; global `allow read, write: if false`, plus an inert `/rpl-evidence/{workerId}/{filename}` rule (5 MB, `image/*`). Active evidence path is base64-in-Firestore. `firebase.json` does declare `storage.rules` (so `firebase init` won't error).

## 7.4 Deployment of rules/indexes

**NEEDS HUMAN CHECK** — the Firebase CLI cannot authenticate from this machine (token refresh 400/401), so it is unknown whether the *committed* rules/indexes are the ones currently live on `studio-4092189688-c74a7`. Check: Firebase console → Firestore → Rules / Indexes (rules text should end with the `rpl_certifications` block at `:550`).

---

# Section 8 — Landing page & branding

- `src/app/page.tsx:5-18` composes `LandingNav`, `LandingHero`, `LandingShowcases`, `LandingFeatures`, `LandingCTA`, `LandingFooter`.
- **Headline** (`LandingHero.tsx:37-39`): *"Turn any lesson into a live quiz."*; sub-copy (`:41-46`): *"Upload a PDF and **Quorena** turns it into a quiz in minutes. Students join with a room code…"*.
- **CTAs:** primary → `/login` (`:46`), secondary → `#product` (`:57`); nav CTA → `/login` (`LandingNav.tsx:44`); footer CTA → `/login` (`LandingSections.tsx:31`).
- **Nav links** (`LandingNav.tsx:7-12`): `#product` (How it works), `#ai-forge` (Quiz Creator), `#live-battle` (Live Quizzes), `#analytics` (Insights) — **all same-page anchors; no `/rpl`, no RPL section anywhere** (grep `RPL|Recognition of Prior` across `src/components/landing/**` → **0 hits**).
- **Brand strings:** `Quorena` in `LandingNav.tsx:27,38` (aria-label `:25`), `src/app/layout.tsx:11` (`title: 'Quorena'`), `:12` (quiz description), `:24` (`application-name`), `public/manifest.ts:5-6`, `src/app/api/executive/settings/route.ts:17 workspaceName: 'Quorena'`, `src/lib/siem.ts:21`, `src/services/analytics.service.ts:708`.
- **Placeholders:** grep for `lorem|TBD|TODO|FIXME|placeholder|coming soon|XXX` across `src/**` → **0 hits**.
- **Real-time product screenshots/mock data:** `LandingHero.tsx:6-11` (fake leaderboard entries Ruby/Atlas/Lola) — intentional mock, not stale data.
- **Verdict:** the landing sells the *quiz* product only. The SIH RPL feature is invisible from `/` — reachable only by typing `/rpl` or following an external link. If judges start at the production URL they will never discover it.

---

# Section 9 — Security & hygiene

**Secrets**
- No private keys in git: `git ls-files | findstr .env/serviceAccount/*.pem` → only `.env.example`; grep `private_key|BEGIN .*PRIVATE` → only documentation/placeholder text (`.env.example:1`).
- `.env.local` is **untracked** (`.gitignore:41`); live values (masked): `ALLOWED_GLADIATOR_EMAIL_DOMAIN=knowle***` (19 chars), `NEXT_PUBLIC_ALLOWED_GLADIATOR_EMAIL_DOMAIN=knowle***`, `CRON_SECRET=7fef85***` (48 chars); **no `NEXT_PUBLIC_FIREBASE_*` and no Gemini keys locally** (all `GEMINI_*` are commented out).
- Firebase **web** API key is committed (`src/firebase/config.ts:4`, `scripts/e2e-test.ts:48`, `scripts/api-test.ts:45`, inlined in both deployed bundles) — expected to be public, listed for completeness.
- Vercel sensitive values (`FIREBASE_SERVICE_ACCOUNT_KEY`, `GEMINI_API_KEYS`, …) are stored as Hidden → **NEEDS HUMAN CHECK** for their contents.

**Session / cookies**
`httpOnly: true`, `sameSite: 'Lax'`, `maxAge: 3600`, `secure`: HEAD = always `true` (`src/lib/session-cookie.ts:36`); **uncommitted working tree** = `secure` only when `NODE_ENV === 'production'` (`:34-40`) — a localhost/preview convenience that must not be committed accidentally for a production-affecting change.

**AuthN/AuthZ**
- Every API requires `Authorization: Bearer` (`src/lib/verify-auth.ts:61-89,90-155,157+`; `missing_bearer_header` logging at `:71,101,168`).
- Role resolution: `customClaims` first, Firestore fallback (`:119-140`); read-only revocation check (`:14,21`).
- **Middleware is the weaker layer:** claims-only (`src/middleware.ts:169-171`); claims are written only by `PATCH /api/admin/users` (`route.ts:388`), which is executive-gated (`:14,274`) with guards "cannot modify your own executive account" (`:284`) and "cannot modify executive accounts" (`:291`).
- Rate limiting is **Firestore-backed, distributed, fail-open** (`src/lib/rate-limiter.ts:14-35`) — the correct choice for serverless; 9 of 14 RPL routes use it (D5 for the rest).

**Transport / headers (observed on both prod and preview):** `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`, plus the CSP of Section 4.

**Other**
- **No CORS anywhere:** grep `Access-Control|CORS` across `src/**` → 0 hits; no `OPTIONS` handlers → browser same-origin only (good for this app).
- **No `dangerouslySetInnerHTML`** anywhere in `src/**` → no raw-HTML sink found.
- **Upload limits:** evidence ≤ 5 MB source, compressed to ≤ ~700 KB (`evidence-upload.ts:8-11`), enforced server-side `sizeBytes` 1…5 MB (`api/rpl/evidence/route.ts:14,91-92`); `serverActions.bodySizeLimit: '20mb'`.
- **Service-worker data at rest:** `public/rpl-sw.js:145-158` caches successful `GET /api/rpl/status/*` responses (worker PII) in the browser Cache Storage on the user's device; navigations are cached cache-first (`:123-140`). Scoped to `/rpl/` only (`layout.tsx:32`).
- **Deployment Protection** (Section 1.4) is a privacy win and a demo blocker at the same time.

---

*End of audit. Section 10 was written after Sections 1–9 and is reproduced at the top of this file.*
