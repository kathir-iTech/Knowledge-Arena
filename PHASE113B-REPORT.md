# Phase 113B: Dependency + Config Audit

**Date:** 2026-09-03
**Commit range:** `e943fc2` (Phase 113A) → this commit
**Verification:** `npx tsc --noEmit` clean, `npm run build` clean (LastExit 0, 44s compile, 94 static pages)

---

## Step 2 — Full Repository Inventory

### 2.1 File Tree (src/, scripts/, config, docs)

**Route tree (src/app):** 47 API route groups, 3 portals (executive/commander/gladiator), plus public pages. No orphan route files found; all `src/app/**/page.tsx` correspond to a route.

**Top-level src/**:
- `src/ai/` — genkit, key-resolver, engines (decision-support, knowledge, prediction), flows (generate-quiz-pdf, copilot, mindmap, explanation), dev.ts
- `src/app/` — app router (see above)
- `src/components/` — ui/ (shadcn), quiz/, analytics/, dashboard/, auth/, portal shells, mindmap/, executive/command-center/
- `src/lib/` — battle-server, battle-machine, verify-auth, rate-limiter, constants, schemas, etc.
- `src/services/` — quiz, participant, game, battle, battle-log, notification, arena-creation, analytics, audit, ai-log
- `src/hooks/`, `src/contexts/`, `src/types/`, `src/firebase/`, `src/config/`
- `src/middleware.ts` — pass-through with explicit allow for `/manifest.webmanifest` and `/__/*` (Firebase Auth), portal role gate client-side

**Scripts/**: 9 files — `generate-firestore-rules.js` (source of truth), `bootstrap-executive.ts`, `seed-demo.ts`, `cleanup-knowledge-arena.ts`, `api-test.ts`, `e2e-test.ts`, etc.

**Config**: `package.json`, `next.config.ts`, `vercel.json`, `firebase.json`, `firestore.rules` (generated), `firestore.rules.template` (source), `firestore.indexes.json`, `database.rules.json`, `storage.rules`, `tsconfig.json`, `tailwind.config.ts`, `playwright.config.ts`

**Docs**: `AUDIT.md` **missing** (deleted; stale dated 2026-07-14 previously), `FINAL_PROJECT_REPORT.md` (dated July 31, 2026 — stale vs Phase 108-112), `WEBSITE_AUDIT.md` (Phase 108), `ARCHITECTURE.md`, `DEPLOYMENT.md`, `ENVIRONMENT.md`, `ROADMAP.md`, `PHASE{2,3,4,5}-REPORT.md`, `REPORT.md`

**Orphaned / dead artifacts (untracked, not committed):**
- `.lighthouse-chrome/` (4 lighthouse reports `knowledge-arena.vercel.app_2026-08-30_*.html`)
- `snapshot/` (empty)
- `firestore-debug.log`, `npm-install.log` (local logs)
These are correctly gitignored/untracked; no dead *code* files in `src/` detected.

**Duplicated docs:** `FINAL_PROJECT_REPORT.md` and `AUDIT.md` disagree with live code (see Tier 3). Action in Phase 113D: reconcile or delete stale ones.

### 2.2 npm audit — Real Vulnerabilities

**Command:** `npm audit` (2026-09-03)

```
81 vulnerabilities (60 moderate, 21 high)
```

**High / Critical by name (not just count):**

| Severity | Package | Advisory | Fixable |
|----------|---------|----------|---------|
| high | `@opentelemetry/auto-instrumentations-node` ≤0.76.0 → depends on vulnerable `@opentelemetry/*` | GHSA-q7rr-3cgh-j5r3 (Prometheus exporter crash) | `audit fix --force` → breaks genkit 1.x (would downgrade to 0.5.17) — **not safe** |
| high | `@opentelemetry/core` <2.8.0 | GHSA-8988-4f7v-96qf (W3C Baggage unbounded alloc) | `audit fix --force` → same breaking genkit downgrade |
| high | `adm-zip` <0.6.0 | GHSA-xcpc-8h2w-3j85 (4GB alloc) | `audit fix` safe — but transitive via `@genkit-ai/tools-common` only used in dev CLI, not prod server |
| high | `brace-expansion` 2.0.0-2.1.3 | GHSA-mh99-v99m-4gvg + GHSA-rgw5-rvv9-x895 (DoS) | `audit fix` safe |
| high | `extract-zip` * | GHSA-jmr9-qjv8-65gv (symlink traversal) | `fix --force` → would install genkit-cli@0.0.2 breaking |
| high | `fast-uri` 3.0.0-3.1.5 (6 GHSA) | host confusion / SSRF | `audit fix` safe |
| high | `fast-xml-parser` 5.9.3-5.10.0 | GHSA-8r6m-32jq-jx6q (DOCTYPE DoS) | `audit fix` safe |
| high | `ip-address` ≤10.3.0 (3 GHSA) | SSRF/bypass | `audit fix` safe |
| high | `js-yaml` 4.0.0-4.3.0 | GHSA-5p4m-2wfm-xmqj (quadratic CPU) | `audit fix` safe |
| high | `nanoid` ≤3.3.17 | GHSA-28wg-ghj8-5hjv | `audit fix` safe |
| high | `next` 9.3.4-canary - 16.3-preview (8 GHSA) | DoS, SSRF, cache confusion, SA payload | `audit fix` → updates next to 15.5.20 already pinned at 15.5.9 (`^15.5.9` → 15.5.20 already installed per build log) — **re-verify with `npm update next`** |
| high | `postcss` ≤8.5.22 (3 GHSA) | XSS, file read, path traversal | `audit fix` safe |
| high | `qs` 2.2.5-6.15.3 (via `express`/`body-parser`) | GHSA-x5fp-wj9c-mxmx | `audit fix` safe but express only used in genkit-cli dev |
| high | `sharp` <0.35.0 | GHSA-f88m-g3jw-g9cj (libvips) | `audit fix` safe if sharp used (Next image optimization) |
| high | `uuid` <11.1.1 (via genkit) | GHSA-w5hq-g745-h8pq | `fix --force` → uuid 14 breaking |
| moderate | `hono` ≤4.12.33 (4 GHSA) | CORS ReDoS, memo SSR leak | `audit fix` safe |
| moderate | `@hono/node-server` <1.19.15 | GHSA-frvp-7c67-39w9 (Windows %5C traversal) | `audit fix` safe |
| moderate | `qs`, `uuid` etc. | — | `audit fix` safe |

**Verdict:** 21 high are mostly transitive via `@genkit-ai/*` / `@opentelemetry/*` entrapped on genkit 1.x. `npm audit fix` without `--force` is safe to run for `brace-expansion`, `fast-uri`, `postcss`, etc., but `--force` would downgrade genkit to 0.5.x (breaking). No critical with direct prod exploit path in this app's deployed surface (sharp/postcss/next are the only prod-relevant highs; next is already at 15.5.20 per build but package.json pins `^15.5.9` — should bump explicitly to `^15.5.20`).

### 2.3 Dependency Audit — Installed but Zero Runtime Imports

**Method:** `grep -r "dep" src --include="*.ts,*.tsx"` per dep vs `package.json` dependencies.

| Package | Runtime import in `src/`? | Verdict | File:line |
|---------|---------------------------|---------|-----------|
| `d3` | Not in package.json (already removed in Phase 109) | **Re-verified, still gone** — no `d3` in deps | `package.json:21-63` |
| `@radix-ui/react-accordion` | No `import ... accordion` in any `src/**/*.tsx` | **Dead** — no runtime import. Only 11 radix primitives are actually used (alert-dialog, avatar, checkbox, dialog, dropdown-menu, label, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toast, tooltip) | `src/components/ui/*.tsx:4` (none for accordion) |
| `@radix-ui/react-menubar` | No import | **Dead** | — |
| `@radix-ui/react-popover` | No import | **Dead** | — |
| `@radix-ui/react-progress` | No import | **Dead** | — |
| `@vercel/speed-insights` | No `import { SpeedInsights }` or `speed-insights` in `src/` | **Dead** — installed but never rendered. `src/app/layout.tsx:1-65` does not include `<SpeedInsights />`. Vercel Speed Insights requires explicit component. | `src/app/layout.tsx:1-65` |
| `react-is` | No direct `import 'react-is'` in `src/`; only transitive via `recharts`/`prop-types` | **Unnecessary direct dep** — `recharts` already depends on it. Can be removed from direct deps unless needed for peer resolution. | `package.json:57` |
| `react-dom` | No direct import in `src/` (Next.js requires it as peer) | **Required peer** — keep, even though src doesn't import it (Next.js does) | — |
| `tailwindcss-animate` | Imported in `tailwind.config.ts:2` (`import animate from 'tailwindcss-animate'`) | **Used** — not dead | `tailwind.config.ts:2` |
| `pdfjs-dist` | `import('pdfjs-dist/legacy/build/pdf.mjs')` | **Used** — Phase 113A fix | `src/ai/flows/generate-quiz-pdf-flow.ts:598` |
| `@napi-rs/canvas` | Not directly imported in src (pdfjs internal require) but listed in `serverExternalPackages` | **Required** — keep for pdfjs fallback | `next.config.ts:25` |

**Action:** Remove the 4 dead radix deps + `@vercel/speed-insights` + `react-is` in a follow-up cleanup (not done here to keep this audit commit non-breaking; flagged for Phase 113C/113D).

### 2.4 Engines / Vercel / Deployed Node — Three-Way Agreement

| Source | Value | File:line |
|--------|-------|-----------|
| `package.json` `engines` | `">=22.13.0"` | `package.json:5-7` |
| `vercel.json` | `{ "functions": { "app/**": { "maxDuration": 30 } } }` — **no `nodejs.version` pin** | `vercel.json:1-8` |
| `next.config.ts` `serverExternalPackages` | `['@napi-rs/canvas', 'pdfjs-dist']` — present (Phase 112 Tier 4) | `next.config.ts:25` |
| `DEPLOYMENT.md` | Documents Node 22 | — |
| Actual deployed Node | Not checked in this local audit (requires Vercel dashboard / `vercel --version` or live header). Local `node -v` is `v24.18.1` — newer than 22 but satisfies `>=22.13.0`. Vercel honors `engines` field per Vercel docs; `vercel.json` `nodejs.version` is intentionally absent (Phase 109 correction that `engines` is authoritative). |

**Verdict:** No three-way mismatch. The historical outage pattern (Phase 93, 108, 110) was `vercel.json` containing an invalid `nodejs` property and `engines` missing. Both are now fixed: `vercel.json` is minimal and correct, `engines` is pinned, `next.config.ts` externalizes both native deps. **CONFIRMED** locally; **UNVERIFIED** on production until a live `/api/clock` or header check confirms Vercel runtime is actually 22.x.

### 2.5 .env.example vs ENVIRONMENT.md vs Code (`process.env`)

**Code reads (42 matches, `grep -r process.env`):**

| Variable | Where read (file:line) | In `.env.example`? | In `ENVIRONMENT.md`? | Verdict |
|----------|------------------------|--------------------|----------------------|---------|
| `GEMINI_API_KEYS` | `src/ai/key-resolver.ts:34` | ✅ `GEMINI_API_KEYS=` (line 65) | ✅ table | OK |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `src/ai/key-resolver.ts:49` | ✅ (line 66) | ✅ fallback | OK |
| `GEMINI_API_KEY` | `src/ai/key-resolver.ts:50` | ❌ (only doc as legacy) | ✅ legacy table | Documented but not in example — should add comment (already in example comments lines 54-55) |
| `GOOGLE_API_KEY` | `src/ai/key-resolver.ts:51` | ❌ | ✅ legacy | Same — fallback var not in example but documented as fallback |
| `GOOGLE_GENAI_API_KEY` | `src/ai/key-resolver.ts:52` | ❌ | ✅ legacy | Same |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `src/lib/firebase-admin.ts:13`, `scripts/*` | ✅ (line 38) | ✅ | OK |
| `SERVICE_ACCOUNT_PATH` | `src/lib/firebase-admin.ts:15`, `scripts/*` | ⚠️ commented `# SERVICE_ACCOUNT_PATH=` (line 39) | ✅ script-only | Example comments it out — should be documented as alternative |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `src/firebase/config.ts:5` | ✅ (line 12, with default `studio-...`) | ✅ | OK but example hardcodes prod value; should be placeholder |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | `src/firebase/config.ts:6`, `src/lib/firebase-admin.ts:9` | ✅ (line 17) | ❌ **Missing** — `ENVIRONMENT.md` has no Firebase Database section for this var | **Gap**: document in ENVIRONMENT.md |
| `FIREBASE_DATABASE_URL` (server) | `src/lib/firebase-admin.ts:9`, `scripts/wipe*` | ❌ (only `NEXT_PUBLIC_` variant) | ❌ **Missing** | Gap |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `src/app/api/executive/workspace/route.ts:57`, `src/firebase/config.ts` | ✅ (line 13) | ✅ | OK |
| `FIREBASE_STORAGE_BUCKET` | `scripts/wipe-to-clean-slate.mjs:47` | ❌ | ❌ Missing | Gap — script reads `FIREBASE_STORAGE_BUCKET` fallback not documented |
| `NEXT_PUBLIC_ALLOWED_GLADIATOR_EMAIL_DOMAIN` | `src/contexts/AuthContext.tsx:41`, `src/components/auth/LoginForm.tsx:24` | ✅ (line 28) | ❌ **Missing** | Gap |
| `ALLOWED_GLADIATOR_EMAIL_DOMAIN` | `scripts/generate-firestore-rules.js:32`, `.env.example:27` | ✅ (line 27) | ❌ **Missing** — `ENVIRONMENT.md` never documents the Gladiator email-domain lock | Gap — should add section |
| `NEXT_PUBLIC_FIREBASE_EMULATOR` | `src/firebase/index.ts:14`, `src/contexts/AuthContext.tsx:42` | ❌ | ❌ Missing | Gap — emulator flag not documented (dev-only but should be) |
| `EXECUTIVE_SEQ` | `scripts/bootstrap-executive.ts:69` | ❌ (commented) | ✅ | In example as comment, in docs as script-only — OK |
| `EXECUTIVE_PASSWORD` | `scripts/bootstrap-executive.ts:72` | ❌ (commented) | ✅ | OK |
| `EXECUTIVE_NAME` | `scripts/bootstrap-executive.ts:73` | ❌ (commented) | ✅ | OK |
| `QA_BASE_URL` | `tests/qa-workflows.spec.ts:3` | ❌ | ❌ | Test-only, not needed in example — OK to omit |
| `PORT`/`HOSTNAME`/`NODE_ENV`/`NEXT_TELEMETRY_DISABLED` | `ENVIRONMENT.md` infra table, `Dockerfile` | ❌ in example (infra) | ✅ infra | Correctly not in `.env.example` (infra) |
| `ALLOWED_GLADIATOR_EMAIL_DOMAIN` placeholder `{{ALLOWED_GLADIATOR_EMAIL_DOMAIN}}` | `firestore.rules.template:32` | ✅ via generator | — | Source of truth is template via `rules:generate` — confirmed `firebase.json:5` has `predeploy: ["npm run rules:generate"]` |

**Summary:** `.env.example` is more complete than `ENVIRONMENT.md` for the Gladiator email domain and Firebase Database URL. `ENVIRONMENT.md` is missing 5 vars that code actually reads: `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, `FIREBASE_DATABASE_URL`, `FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_ALLOWED_GLADIATOR_EMAIL_DOMAIN` / `ALLOWED_GLADIATOR_EMAIL_DOMAIN`, `NEXT_PUBLIC_FIREBASE_EMULATOR`. Conversely, no variable is documented but unused — all documented vars are read somewhere.

**Recommendation:** Sync `ENVIRONMENT.md` to include the missing vars (add sections: Firebase Realtime Database, Gladiator Email Domain, Emulator) and update `.env.example` to un-comment or document `SERVICE_ACCOUNT_PATH` as alternative.

---

## Verdict for Step 2

- **CONFIRMED** — `serverExternalPackages` still lists both `pdfjs-dist` and `@napi-rs/canvas`; `engines` still `>=22.13.0`; `vercel.json` no longer contains invalid `nodejs` property (historical fix still holds).
- **TRACED** — `firestore.rules` generated from template via `rules:generate` (template is source of truth).
- **Flagged** — 4 dead radix deps + `@vercel/speed-insights` + `react-is` direct dep; 81 npm audit findings (21 high) mostly transitive via genkit OTEL — safe to `audit fix` non-breaking subset.

---

*Evidence: `package.json:5-7`, `vercel.json:1-8`, `next.config.ts:25`, `firebase.json:5`, `scripts/generate-firestore-rules.js:32`, `firestore.rules:1-421`, `src/**/*.ts:process.env` grep, `npm audit` output (81 vuln), `npx tsc --noEmit` (clean), `npm run build` (94 pages, 0 errors).*
