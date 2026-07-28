# Knowledge Arena — Deployment Guide

## Prerequisites

- **Node.js** v20+ and **npm** v10+
- **Firebase project** with the following services enabled:
  - [Authentication](https://console.firebase.google.com/project/_/authentication) (Email/Password + Google Sign-In)
  - [Cloud Firestore](https://console.firebase.google.com/project/_/firestore) (native mode)
  - [Cloud Storage](https://console.firebase.google.com/project/_/storage) (optional, for file uploads)
- **Google AI API key** from [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Vercel account** (or alternative hosting supporting Node.js standalone output)
- **GitHub repository** (for CI/CD)

---

## Firebase Configuration

### 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (or use an existing one).
2. Enable **Authentication** with **Email/Password** and **Google** sign-in providers.
3. Create a **Cloud Firestore** database in native mode.
4. (Optional) Enable **Cloud Storage**.

### 2. Get Firebase Client Config

In Firebase Console → Project Settings → General → Your apps → Web app:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef..."
};
```

Update `src/firebase/config.ts` with these values.

### 3. Generate a Service Account Key

Firebase Console → Project Settings → Service Accounts → Generate new private key.

This downloads a JSON file. **Minify it to a single line** and set it as the `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable.

### 4. Deploy Firestore Security Rules & Indexes

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore
```

This deploys:
- `firestore.rules` — security rules
- `firestore.indexes.json` — composite indexes

If you change the `.firebaserc` project ID, also update `firebaseConfig.projectId` in `src/firebase/config.ts`.

### 5. (Optional) Deploy Storage Rules

```bash
firebase deploy --only storage
```

---

## Environment Variables

Create a `.env.production` file (or set in Vercel dashboard):

```bash
# Required: Google AI API key
GOOGLE_GENERATIVE_AI_API_KEY=your-key-here

# Required for production: Firebase Admin service account key (minified JSON, single line)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

# Optional: Custom auth domain for same-domain OAuth redirects
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-custom-domain.com

# Optional: Firebase Storage bucket
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

See [ENVIRONMENT.md](./ENVIRONMENT.md) for detailed descriptions.

---

## Build & Deploy to Vercel

### Option A: Vercel Dashboard (Recommended)

1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and import your GitHub repository.
3. Configure the project:
   - **Framework Preset:** Next.js
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
4. Add all environment variables from `.env.production` in Vercel's **Environment Variables** section.
5. Click **Deploy**.

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Add environment variables
vercel env add GOOGLE_GENERATIVE_AI_API_KEY
vercel env add FIREBASE_SERVICE_ACCOUNT_KEY
# ... etc
```

### Option C: Docker

The project includes a `Dockerfile` for containerized deployment:

```bash
# Build the Docker image
docker build -t knowledge-arena .

# Run the container
docker run -p 3000:3000 \
  -e GOOGLE_GENERATIVE_AI_API_KEY=your-key \
  -e FIREBASE_SERVICE_ACCOUNT_KEY='{"..."}' \
  knowledge-arena
```

---

## Vercel Configuration Notes

### next.config.ts

Key settings already configured:
- `output: 'standalone'` — Enables standalone deployment (required for Docker, optional for Vercel)
- `experimental.serverActions.bodySizeLimit: '20mb'` — Allows large PDF uploads
- Security headers (HSTS, X-Frame-Options, etc.)
- Firebase Auth rewrite: `__/:path*` → `firebaseapp.com/__/:path*`

### Serverless Function Region

If your Firestore database is in a specific region, set the Vercel project's **Functions Region** to the same or nearest region in Vercel Project Settings → Functions.

### Build Settings

| Setting | Value |
|---|---|
| Node.js Version | 20.x |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm ci` |

### Environment Variables in Vercel

Add these to **Vercel Project Settings → Environment Variables**:

| Name | Scope | Value |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Production | Your Google AI API key |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Production | Minified service account JSON |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Production | Your custom domain (if used) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Production | Your storage bucket URL |

All `NEXT_PUBLIC_*` variables are also needed in **Preview** and **Development** environments if you deploy preview branches.

---

## Post-Deployment Verification

### 1. Health Check

Navigate to your deployed URL. The executive workspace (`/executive`) contains a **system health** panel that verifies:
- ✅ Firebase Auth connectivity and latency
- ✅ Firestore read/write access and latency
- ✅ Messaging collections accessibility
- ✅ AI API key presence
- ✅ Firebase Storage bucket configuration

### 2. Test Authentication

1. Open the landing page.
2. Sign in with a pre-configured Executive or Commander account (email/password).
3. Verify role-based redirects:
   - Executive → `/executive`
   - Commander → `/commander`
   - Gladiator → `/gladiator` (via Google Sign-In)

### 3. Test Quiz Creation & Battle

1. Sign in as a Commander.
2. Create a quiz manually or use the AI PDF Forge.
3. Share the room code with a Gladiator account.
4. Start the battle and verify real-time question delivery.
5. Submit answers and verify scoring.
6. End the battle and verify the leaderboard.

### 4. Test Analytics

1. Sign in as an Executive.
2. Navigate to the analytics dashboard.
3. Verify chart data is populated.
4. Test CSV/HTML export.

### 5. Verify Rate Limiting

Attempt multiple rapid logins to verify the rate limiter returns `429` status.

---

## Troubleshooting

### "Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_KEY is not set"

Ensure `FIREBASE_SERVICE_ACCOUNT_KEY` is set in Vercel environment variables (not `.env.local`). The value must be a single-line, minified JSON string.

### "Service account project does not match client project"

The project ID in your service account key must match `projectId` in `src/firebase/config.ts`. Verify both are the same Firebase project.

### "AI generation failed"

- Check that `GOOGLE_GENERATIVE_AI_API_KEY` is set and valid.
- Verify the Gemini API is enabled in [Google Cloud Console](https://console.cloud.google.com/apis/library).
- Check rate limits: PDF Forge allows 5 requests/minute per user.

### "401 Unauthorized" on API calls

- Ensure the Firebase ID token is included in the `Authorization: Bearer <token>` header.
- Verify the user has the required role in their Firestore user document.
- Tokens expire after 1 hour; the client should refresh them automatically.

### Firestore permission denied

- Check `firestore.rules` are deployed: `firebase deploy --only firestore`
- Verify the authenticated user has the correct role matching the rules.

---

## CI/CD Pipeline

The project is designed for GitHub + Vercel continuous deployment:

1. Push to `main` triggers an automatic Vercel deployment.
2. Environment variables are injected by Vercel.
3. Preview deployments are created for PR branches.
4. Pre-deploy checks: `npm run lint` + `npm run typecheck` are run in your CI.

---

## Security Checklist

- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` is restricted to your app's referrer in Google AI Studio
- [ ] Firestore security rules are deployed and restrict access by role
- [ ] Firebase Auth email/password sign-in is configured (not anonymous)
- [ ] CORS is not over-permissive (Next.js API routes handle this)
- [ ] File upload MIME type validation is active
- [ ] Rate limiting is enforced for auth and AI endpoints
- [ ] HSTS headers are enabled via `next.config.ts`
