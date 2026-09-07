# Quorena — Environment Variables Reference

## Overview

Variables are categorized by purpose. Types:
- **[REQUIRED]** — App will crash or degrade without this variable.
- **[OPTIONAL]** — App works with defaults; set for custom behavior.
- **[SCRIPT]** — Only needed for CLI bootstrap/maintenance scripts.
- **[INFRA]** — Set in Dockerfile/CI, not in `.env` files.

Variables prefixed with `NEXT_PUBLIC_` are exposed to client-side code.

---

## AI / Genkit

| Variable | Required | Description | Example |
|---|---|---|---|
| `GEMINI_API_KEYS` | ✅ (recommended) | Comma-separated list of Gemini API keys from **different Google accounts** for automatic rotation/fallback via `src/ai/key-resolver.ts`. Each free-tier account contributes its own ~20 req/min quota, so 3 keys ≈ 3× capacity. The resolver round-robins, skips keys that hit 429 for Google's `retryDelay` (or 60s default), and fails fast with `ALL_GEMINI_KEYS_EXHAUSTED` if all are cooling (bounded 15s wait). Supports optional `scope` param for future per-client key assignment without call-site changes. | `AIzaSy...key1...,AIzaSy...key2...` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ (fallback) | Single-key fallback (backward compat). If `GEMINI_API_KEYS` is unset, the resolver falls back to this var, then `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `GOOGLE_GENAI_API_KEY`. Single-key mode behaves exactly as before (no behavior change) — multi-key simply extends capacity. | `AIzaSy...` |

**Where to get it:** [Google AI Studio](https://aistudio.google.com/app/apikey) → Create API key (one per Google account for multi-key).

**Note:** All Gemini key reads are now **centralized in `src/ai/key-resolver.ts`** — no other `src/` file reads `process.env.*API_KEY` directly. `src/ai/genkit.ts` delegates to `getConfiguredKeys()` and `src/app/api/executive/workspace/route.ts` health check uses `getKeyHealth()`. `GEMINI_API_KEYS` (plural) is the new recommended var; the single-key vars remain supported.

**Production recommendation:** Upgrade the underlying Google Cloud project(s) to **billed pay-as-you-go** — this removes the low free-tier ceiling entirely and is the recommended production path. Free-tier multi-key rotation is a low-stakes optimization for development / low-volume use; billing is what truly scales quota.

---

## Firebase Admin SDK

| Variable | Required | Description | Example |
|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | ✅ (production) | Firebase Admin SDK service account key. Full Firebase service account JSON, **minified to a single line**. When unset, falls back to Application Default Credentials (ADC), which works on Google Cloud Run, Cloud Functions, etc. | `{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}` |

**Where to get it:** Firebase Console → Project Settings → Service Accounts → Generate new private key → "Generate Key". Then minify the downloaded JSON to a single line.

**Fallback behavior:**
- If unset, uses Application Default Credentials (ADC).
- ADC works automatically on Google Cloud services (Cloud Run, Cloud Functions, Compute Engine, etc.).
- Locally, you can authenticate via `gcloud auth application-default login`.

---

## Firebase Auth

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ❌ | Custom auth domain for same-domain OAuth redirects. Set to your production domain (e.g., `knowledge-arena.example.com`) to enable seamless Firebase Auth redirect on your custom domain. When unset, defaults to the Firebase project's `firebaseapp.com` domain. | `arena.myschool.edu` |

**Must have `NEXT_PUBLIC_` prefix** (read by client-side code).

**Configuration steps for custom domain:**
1. In Firebase Console → Authentication → Settings → Authorized domains, add your custom domain.
2. Configure your DNS with the required TXT/verify records.
3. Set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to your custom domain.

---

## Firebase Storage

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ❌ | Firebase Storage bucket for file uploads. Used for file attachments in requests and messaging. When unset, the health endpoint shows a "warning" status, and file uploads fall back to base64 storage in Firestore. | `your-project.appspot.com` |
| `FIREBASE_STORAGE_BUCKET` | ❌ (script) | Fallback for scripts (`scripts/wipe-to-clean-slate.mjs`) that reads `FIREBASE_STORAGE_BUCKET` before `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`. | `your-project.appspot.com` |

**Where to get it:** Firebase Console → Storage → Get the bucket URL (e.g., `your-project.appspot.com`).

**Must have `NEXT_PUBLIC_` prefix** (read by client-side code for browser uploads; scripts accept either).

---

## Firebase Realtime Database

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | ❌ | Realtime Database URL for live battle presence (`presence/{quizId}/{uid}` via `getAdminRtdb()` / client). When unset, falls back to `https://studio-4092189688-c74a7-default-rtdb.firebaseio.com` (default instance). | `https://your-project-default-rtdb.firebaseio.com` |
| `FIREBASE_DATABASE_URL` | ❌ (script) | Server-side fallback used by `src/lib/firebase-admin.ts` (`process.env.FIREBASE_DATABASE_URL \|\| firebaseConfig.databaseURL`) and `scripts/wipe-to-clean-slate.mjs`. | `https://your-project-default-rtdb.firebaseio.com` |

**Where to get it:** Firebase Console → Realtime Database → Data tab → URL shown at top (region-specific).

---

## Gladiator Email Domain Lock (per-arena)

Gladiator sign-up is open — any Google account may create a profile. Domain restriction is enforced **at arena-join time**, not at sign-up: each arena carries an `allowed_gladiator_domain` snapshot (copied from the creating Commander's `institution_domain` by `src/services/arena-creation.service.ts`), checked against the ID-token email in `firestore.rules` (`getAllowedGladiatorDomain()` / `isEmailDomainAllowed()`). Blank means an open arena.

| Variable | Required | Description | Example |
|---|---|---|---|
| `ALLOWED_GLADIATOR_EMAIL_DOMAIN` | ❌ (legacy) | No longer read by any `src/` code. Kept in `.env.example` for backward compat only. | — |
| `NEXT_PUBLIC_ALLOWED_GLADIATOR_EMAIL_DOMAIN` | ❌ (legacy) | Same — unread, kept for backward compat only. | — |

---

## Emulator (Local Dev)

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_EMULATOR` | ❌ (dev) | When `true`, `src/firebase/index.ts:14` and `src/contexts/AuthContext.tsx:42` switch to Firebase Emulator (Firestore `:8080`, Auth `:9099`, RTDB `:9000`, Hosting `:5000`). Set automatically by `npm run demo` / `npm run dev` with emulator flags. | `true` |

---

## Cron & Telemetry

| Variable | Required | Description | Example |
|---|---|---|---|
| `CRON_SECRET` | ✅ (prod) | Bearer secret guarding `/api/cron/*` (`sweep-battles`, `forge-worker`, `search-df`, `spaced-repetition`). Must match the GitHub repository secret of the same name used by `.github/workflows/forge-worker.yml`. Requests without `Authorization: Bearer <CRON_SECRET>` get 401. | `openssl rand -hex 32` |
| `SIEM_WEBHOOK_URL` | ❌ | Optional SIEM webhook URL for security telemetry export (`src/lib/siem.ts` posts CEF payloads fire-and-forget). When unset, export is a no-op. | `https://siem.example.com/ingest` |

---

## Script-Only Variables

These are only used by CLI scripts in `scripts/`. Not required for normal app operation.

| Variable | Required | Description | Example |
|---|---|---|---|
| `SERVICE_ACCOUNT_PATH` | ❌ (script) | Path to a local service-account JSON file on disk. Alternative to `FIREBASE_SERVICE_ACCOUNT_KEY` (also used by the app as a fallback). | `/home/user/service-account.json` |
| `EXECUTIVE_SEQ` | ❌ (script) | Bootstrap executive account sequence number (used by `scripts/bootstrap-executive.ts`). | `001` |
| `EXECUTIVE_PASSWORD` | ❌ (script) | Bootstrap executive account password. | `1234567` |
| `EXECUTIVE_NAME` | ❌ (script) | Bootstrap executive display name. | `Admin` |

---

## Infrastructure (Docker/CI)

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | ✅ (INFRA) | Node.js environment. Set to `production` in production builds. Set in Dockerfile and CI. | `production` |
| `NEXT_TELEMETRY_DISABLED` | ❌ (INFRA) | Disables Next.js telemetry. Set to `1` in Dockerfile. | `1` |
| `PORT` | ❌ (INFRA) | Server port. Defaults to `3000`. Set in Dockerfile. | `3000` |
| `HOSTNAME` | ❌ (INFRA) | Server hostname. Set to `0.0.0.0` in Dockerfile. | `0.0.0.0` |

---

## Full .env.example Template

```bash
# ═══════════════════════════════════════════════════════════════
# Quorena — Environment Variables
# ═══════════════════════════════════════════════════════════════

# ─── AI / Genkit ───────────────────────────────────────────────
# Preferred multi-key (comma-separated, one per Google account):
GEMINI_API_KEYS=
# Fallback single-key (backward compat):
GOOGLE_GENERATIVE_AI_API_KEY=

# ─── Firebase Admin SDK ────────────────────────────────────────
FIREBASE_SERVICE_ACCOUNT_KEY=

# ─── Cron & Telemetry (prod) ──────────────────────────────────
# Bearer guard for /api/cron/* (sweep-battles, forge-worker, search-df, spaced-repetition)
CRON_SECRET=
# Optional SIEM webhook for security telemetry export (see src/lib/siem.ts)
SIEM_WEBHOOK_URL=

# ─── Firebase Auth ─────────────────────────────────────────────
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://studio-4092189688-c74a7-default-rtdb.firebaseio.com

# ─── Gladiator Email Domain Lock (optional) ────────────────────
ALLOWED_GLADIATOR_EMAIL_DOMAIN=
NEXT_PUBLIC_ALLOWED_GLADIATOR_EMAIL_DOMAIN=

# ─── Script-Only Variables ─────────────────────────────────────
SERVICE_ACCOUNT_PATH=
# EXECUTIVE_SEQ=001
# EXECUTIVE_PASSWORD=1234567
# EXECUTIVE_NAME=

# ─── Emulator (local dev, auto-set) ────────────────────────────
# NEXT_PUBLIC_FIREBASE_EMULATOR=true
```

---

## Quick Setup

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your actual values
# At minimum, set:
#   GEMINI_API_KEYS (or GOOGLE_GENERATIVE_AI_API_KEY for single-key)
#   FIREBASE_SERVICE_ACCOUNT_KEY (for production)

# For production deployment (Vercel):
# Set the same variables in Vercel Project Settings → Environment Variables
```

---

## Additional Single-Key Fallbacks

`GEMINI_API_KEY`, `GOOGLE_API_KEY`, and `GOOGLE_GENAI_API_KEY` are **still read** as single-key fallbacks by `src/ai/key-resolver.ts:50-52` when `GEMINI_API_KEYS` (and `GOOGLE_GENERATIVE_AI_API_KEY`) are unset. They are kept for backward compatibility — the recommended variables are `GEMINI_API_KEYS` (multi-key, preferred) or `GOOGLE_GENERATIVE_AI_API_KEY` (single-key fallback).

## Removed Variables

These variables are no longer read by the application:

| Variable | Reason Removed |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase was replaced by Firestore |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase was replaced by Firestore |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase was replaced by Firestore |
