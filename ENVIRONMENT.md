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
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | Google Generative AI API key for Genkit AI features. Used for quiz generation from PDFs, AI predictions, copilot, decision-support summaries, and knowledge summaries. | `AIzaSy...` |

**Where to get it:** [Google AI Studio](https://aistudio.google.com/app/apikey) → Create API key.

**Note:** This key is auto-detected by the Genkit library. The app does not read `process.env.GOOGLE_GENERATIVE_AI_API_KEY` directly — it is used by `@genkit-ai/googleai`.

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

These are only used by CLI scripts in `src/scripts/`. Not required for normal app operation.

| Variable | Required | Description | Example |
|---|---|---|---|
| `SERVICE_ACCOUNT_PATH` | ❌ (script) | Path to a local service-account JSON file on disk. Alternative to `FIREBASE_SERVICE_ACCOUNT_KEY` for CLI scripts. | `/home/user/service-account.json` |
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
GOOGLE_GENERATIVE_AI_API_KEY=

# ─── Firebase Admin SDK ────────────────────────────────────────
FIREBASE_SERVICE_ACCOUNT_KEY=

# ─── Firebase Auth ─────────────────────────────────────────────
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=

# ─── Firebase Storage (optional) ───────────────────────────────
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

# ─── Script-Only Variables ─────────────────────────────────────
SERVICE_ACCOUNT_PATH=
EXECUTIVE_SEQ=001
EXECUTIVE_PASSWORD=1234567
EXECUTIVE_NAME=
```

---

## Quick Setup

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your actual values
# At minimum, set:
#   GOOGLE_GENERATIVE_AI_API_KEY
#   FIREBASE_SERVICE_ACCOUNT_KEY (for production)

# For production deployment (Vercel):
# Set the same variables in Vercel Project Settings → Environment Variables
```

---

## Legacy / Removed Variables

These variables are no longer read by the application:

| Variable | Reason Removed |
|---|---|
| `GEMINI_API_KEY` | Replaced by `GOOGLE_GENERATIVE_AI_API_KEY` |
| `GOOGLE_GENAI_API_KEY` | Alias, not actively used |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase was replaced by Firestore |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase was replaced by Firestore |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase was replaced by Firestore |
