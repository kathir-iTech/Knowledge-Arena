# Knowledge Arena — Production Deployment Guide

**Applies to:** commit `ff1aec7`+ · Next.js 15 (App Router) · Firebase (Auth, Firestore, Storage) · Genkit/Gemini

This guide covers everything needed to run Knowledge Arena in production: environment configuration, Firebase setup, hosting, and the operational checklists (production, security, monitoring, backup, disaster recovery, rollback).

---

## 1. Required Environment Variables

Copy `.env.example` → `.env` (deployment platform) or `.env.local` (local dev). **Never commit the real values.**

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client | Yes | Firebase Auth domain; must match the project's auth domain (custom domain supported) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | client | Yes* | Storage bucket for attachments (set to `<project>.appspot.com`; only needed if attachments used) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | server | One of 3 | Service account JSON as a single-line string |
| `SERVICE_ACCOUNT_PATH` | server | One of 3 | Filesystem path to a service account JSON |
| *(none — fallback)* | server | — | `service-account.json` in the project root, or Application Default Credentials |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | Yes | Gemini API key — used by AI Forge (PDF/quiz generation) and read directly by the workspace health check |

The Firebase **client config** (project id, API key, app id, sender id) is embedded in `src/firebase/config.ts`; the API key is public by design (Firebase client keys are not secrets).

---

## 2. Firebase Configuration

### 2.1 Project setup (one-time)

1. Create/enable the Firebase project. Current config references `studio-4092189688-c74a7`; for a fresh project, update `src/firebase/config.ts` (projectId, appId, apiKey, messagingSenderId).
2. **Authentication**: enable Email/Password and Google sign-in. Set the auth domain (custom domains supported via `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`).
3. **Firestore**: deploy rules and indexes:
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```
   Rules live in `firestore.rules` (validated transition map, role-based access, server-only writes for all log collections). Indexes live in `firestore.indexes.json` (11 composite indexes + participants `user_id` collection-group override). Check index status in the console and wait for "Enabled" before release — queries fail until indexes build.
4. **Storage**: deploy `storage.rules` (`firebase deploy --only storage`).
5. **Service account**: create one in *Project Settings → Service Accounts* (Firebase Admin SDK), download the JSON, and provide it via one of the three mechanisms above. Grant it the minimum roles (Firestore, Auth Admin, Storage as needed).

### 2.2 Accounts bootstrap

There is **no self-signup for staff**: 
- **Gladiators** self-register via Google sign-in (profile auto-created with `role: 'gladiator'`).
- **Commanders** are created via the executive's admin panel (`/executive` → Admin → `/api/admin/users`, server-side Admin SDK `createUser`).
- **Executives** are created with the bootstrap script:
  ```bash
  npx tsx scripts/bootstrap-executive.ts
  ```
- All staff accounts are subject to the force-password-change gate on first login. Emails ending in `@knowledgearena.app` are treated as staff (`STAFF_EMAIL_DOMAIN`).

---

## 3. Hosting Recommendations

The app is a **Node.js server** (API routes + server actions + Genkit flows). `next.config.ts` emits `output: 'standalone'`, so it runs as a plain Node process.

> ⚠️ **Do not use Firebase Hosting static hosting.** The `hosting` block in `firebase.json` (`public: ".next"`, SPA rewrites) is a Firebase Studio export artifact and does not fit this app — there is no static export, and API routes require a server. Use it only as a CDN edge in front of Cloud Run if desired.

### Option A — Google Cloud Run (recommended)

1. `npm ci && npm run build` (produces `.next/standalone`).
2. Containerize with a minimal image (example):
   ```dockerfile
   FROM node:22-slim AS runner
   WORKDIR /app
   ENV NODE_ENV=production PORT=8080
   COPY --from=build /app/.next/standalone ./
   COPY --from=build /app/.next/static ./.next/static
   COPY --from=build /app/public ./public
   EXPOSE 8080
   CMD ["node", "server.js"]
   ```
   (Turbopack dev-only; production uses the standalone server. If PDF parsing needs native binaries, build on the platform or use `--platform=linux/amd64`.)
3. Deploy:
   ```bash
   gcloud builds submit --tag gcr.io/<project>/knowledge-arena
   gcloud run deploy knowledge-arena --image gcr.io/<project>/knowledge-arena \
     --region <region> --allow-unauthenticated \
     --cpu 1 --memory 1Gi --min-instances 0 --max-instances 10 \
     --set-env-vars "GOOGLE_GENERATIVE_AI_API_KEY=...,FIREBASE_SERVICE_ACCOUNT_KEY=..."
   ```
4. Set `NEXT_PUBLIC_*` variables via the platform (server values are read at runtime; the client bundle embeds public ones at build time — rebuild on change).

### Option B — Vercel

1. Import the repo; add all variables from §1 (public and private).
2. Framework preset: Next.js. `output: 'standalone'` is ignored on Vercel (their runtime handles it).
3. `getClientIp` prefers `x-vercel-forwarded-for` automatically.

### Option C — Traditional VM / Node host

Standalone build + a process manager (systemd/pm2) + a reverse proxy (nginx/Caddy). Recommended proxy hardening:
- Terminate TLS, forward `X-Forwarded-For`/`X-Forwarded-Proto`.
- **Strip inbound `X-Forwarded-For` at the edge** so clients cannot spoof the last hop used by the rate limiter (`getClientIp`).
- Set `server_tokens off` / hide framework headers.

---

## 4. Production Checklist

- [ ] All 5 env vars set; `GOOGLE_GENERATIVE_AI_API_KEY` verified with a test generation
- [ ] `firebase deploy --only firestore:rules,firestore:indexes,storage` succeeded and indexes show **Enabled**
- [ ] At least one executive bootstrapped (`scripts/bootstrap-executive.ts`) and one commander created
- [ ] `npm ci && npm run build` passes on a clean machine with network access
- [ ] Smoke test: login (staff + gladiator Google), create arena, join, start→activate→evaluate→end→archive
- [ ] Attachment upload + PDF import (< 10 MB) works against real Storage/Firestore
- [ ] Custom auth domain resolves (`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` + `firebase.json` hosting rewrites for `/__/*` if using Firebase Auth on a custom domain)
- [ ] Health check: `/api/executive/workspace` reports Gemini key + storage bucket present
- [ ] CDN caching rules as intended (static assets immutable, HTML revalidated)
- [ ] Rollback plan known (see §9)

---

## 5. Security Checklist

- [ ] **Secrets**: service account + API key never committed; rotate quarterly; restrict IAM on the service account
- [ ] **Rules audit**: `firestore.rules` deployed and reviewed — client writes only where allowed (participants, submissions, messages, battle logs self-authored); all log collections are server-write-only
- [ ] **Rate limits active**: 34 call sites across 29 routes (battle 30/min, messages 20/min, writes 15/min, admin 10/IP, exports 5/min, AI 10/min). Note: the limiter is in-memory — per-warm-instance on scaled platforms (see §6 for the follow-up)
- [ ] **Auth**: every API route verifies the Bearer ID token + role (`verifyFirebaseTokenWithRole`); Firestore rules enforce roles per request; password change forced for staff accounts
- [ ] **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS, `Permissions-Policy` served by `next.config.ts`
- [ ] **Monitoring alerts** on `security_logs` growth and 401/429 spikes (see §7)
- [ ] Session timeout (30 min) and force-password-change enabled (client gates — documented limitation, see report)
- [ ] Storage rules restrict uploads to expected types/sizes and ownership

---

## 6. Monitoring Checklist

- [ ] **Logs**: Next.js/Cloud Run logs stream `console` output; API routes log domain errors via `battleErrorResponse`, audit events via `/api/audit/log`, security events via `security_logs`, AI runs via `ai_logs`, battle events via `battle_logs`
- [ ] **Dashboards**: executive pages — Security Logs (`/executive/security`), AI Logs (`/executive/ai-logs`), Audit Logs, System Insights (30-day AI + security metrics)
- [ ] **Metrics to watch**: request error rate (5xx), 429 rate-limit responses, Firestore reads/writes per minute, egress (PDF imports), Gemini quota errors (`quota_exceeded`), index usage
- [ ] **Alerting** (recommendations): 5xx > 1% over 5 min; 429 spike (potential abuse); `security_logs` violation rate > threshold; Gemini 429s (quota exhaustion); service account key expiry; Firestore cost > budget
- [ ] **Optional**: Sentry/ErrorBoundary integration for client/server exception tracking (no APM currently wired — see Roadmap)
- [ ] Uptime check on the public homepage (e.g., Cloud Monitoring synthetic probe)

---

## 7. Backup Recommendations

Firestore's managed backups (console or `firestore backups` CLI) are the primary mechanism:

- Enable **continuous (PITR)** backups for the last 7 days; take **scheduled daily** full backups with 30–365 day retention.
- Scope: all collections (users, quizzes + subcollections, logs).
- Export manually before any destructive release (rules/index changes, migrations):
  ```bash
  gcloud firestore export gs://<bucket>/backups/YYYY-MM-DD --project <project>
  ```
- Store backups in a **different region** than the primary database.
- Verify restoration **regularly** (test restore into a scratch project).
- Storage: enable versioning + lifecycle rules; Gemini/Auth data (accounts) live in Firebase — no export needed but document the console export path.

---

## 8. Disaster Recovery Recommendations

| Scenario | Response |
|---|---|
| Database corruption / bad migration | Restore latest backup into the same project (or a scratch project); point app at restored data via service-account switch or DNS |
| Regional outage | If multi-region Firestore isn't enabled, use the latest cross-region backup export to re-import into a second project; keep a warm container image |
| Gemini quota/outage | AI routes degrade gracefully (fallback chain, per-model retries, `quota_exceeded`/`all_models_failed` errors surfaced to UI); battle engine is AI-independent and unaffected |
| Service account compromise | Revoke/rotate key immediately (`firebase projects` / IAM), re-issue, redeploy; check `security_logs` + audit logs |
| Abuse/attack | Rate limits (in-memory) + `security_logs` provide visibility; scale down max instances; block via CDN rules; revert to previous deploy |

**RTO/RPO targets (recommended):** RPO ≤ 24 h (daily backups) or ≤ 5 min (PITR); RTO ≤ 4 h for single-project restore (backup export → import), ≤ 1 h for redeploy from image.

---

## 9. Rollback Strategy

1. **Immutable deploys**: every release is a new image/build artifact (Cloud Run revision, Vercel immutable deploy). Rollback = point traffic at the previous revision/deploy — no code revert needed.
2. **Pre-flight check before rollback**: run the previous artifact's health check (`/api/executive/workspace`) against production env vars (env vars are shared — keep them backwards compatible, add-only).
3. **Data compatibility**: the schema is additive in practice (new fields have defaults via `??` reads). If a release introduced schema migrations, rollback the **code first**, then leave data in place (reads tolerate missing fields).
4. **Firestore rules/indexes**: deploy rules independently from code. If new rules break clients, deploy the previous `firestore.rules` immediately (index rollback is destructive — only roll back indexes if the new index caused a cost incident).
5. **Full revert**: `git revert <sha>` is only needed for source-level fixes; image/revision rollback is the standard path.
