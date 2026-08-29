# Knowledge Arena — Environment Variables Reference

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

**Where to get it:** Firebase Console → Storage → Get the bucket URL (e.g., `your-project.appspot.com`).

**Must have `NEXT_PUBLIC_` prefix** (read by client-side code).

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
# Knowledge Arena — Environment Variables
# ═══════════════════════════════════════════════════════════════

# ─── AI / Genkit ───────────────────────────────────────────────
# Preferred multi-key (comma-separated, one per Google account):
GEMINI_API_KEYS=
# Fallback single-key (backward compat):
GOOGLE_GENERATIVE_AI_API_KEY=

# ─── Firebase Admin SDK ────────────────────────────────────────
FIREBASE_SERVICE_ACCOUNT_KEY=

# ─── Firebase Auth ─────────────────────────────────────────────
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=

# ─── Firebase Storage (optional) ───────────────────────────────
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

# ─── Script-Only Variables ─────────────────────────────────────
SERVICE_ACCOUNT_PATH=
# EXECUTIVE_SEQ=001
# EXECUTIVE_PASSWORD=1234567
# EXECUTIVE_NAME=
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

## Legacy / Removed Variables

These variables are no longer read by the application:

| Variable | Reason Removed |
|---|---|
| `GEMINI_API_KEY` | Legacy single-key var — still read as fallback by `key-resolver.ts` if `GEMINI_API_KEYS` is unset |
| `GOOGLE_GENAI_API_KEY` | Legacy alias — still read as fallback by `key-resolver.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase was replaced by Firestore |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase was replaced by Firestore |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase was replaced by Firestore |
