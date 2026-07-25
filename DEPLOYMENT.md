# Deployment Guide

## Recommended Platform: Firebase Hosting + Cloud Run

For a Next.js 15 app with real-time Firestore and AI features, the recommended deployment is:

| Component | Service | Purpose |
|-----------|---------|---------|
| Static assets + SSR | Firebase Hosting + Cloud Run | Serves the Next.js app with full SSR and API routes |
| Database | Firestore | Real-time NoSQL database |
| Authentication | Firebase Auth | Email/password with role-by-domain |
| AI features | Genkit + Google Gemini | Quiz generation, predictions, copilot |

### Why not Vercel?

- Vercel Hobby has a 10-second function timeout — Genkit AI processing may exceed this
- Vercel Hobby has no support for some Node.js native modules used by `pdf-parse`
- Firestore real-time listeners work, but Vercel Edge functions have WebSocket limitations

### Why not Render?

- Render's free tier cold starts are slow (15-60s) for Next.js SSR
- No native Firebase emulator support
- Same timeout issues for AI flows

---

## Prerequisites

- Node.js 18+
- npm 9+
- A Firebase project (Blaze plan required for Cloud Run)
- Firebase CLI: `npm install -g firebase-tools`
- Google AI API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Enable **Firestore Database** (start in test mode, then configure rules)
4. Enable **Authentication** → Sign-in method → **Email/Password**
5. (Optional) Enable **Storage** for file attachments

### 2. Configure Firestore

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

Deploy security rules:

```bash
firebase deploy --only firestore:rules
```

### 3. Get Service Account Key

1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate new private key**
3. Save the JSON file (you'll need its contents for `FIREBASE_SERVICE_ACCOUNT_KEY`)

### 4. Update Firebase Config

The client-side Firebase config is in `src/firebase/config.ts`. Update the values to match your Firebase project:

```typescript
export const firebaseConfig = {
  projectId: "your-project-id",
  appId: "1:xxx:web:xxx",
  apiKey: "AIza...",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  measurementId: "",
  messagingSenderId: "xxx",
};
```

---

## Environment Variables

### Required

| Variable | Description | Source |
|----------|-------------|--------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key for Genkit features | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Full Firebase service account JSON (minified to one line) | Firebase Console → Service Accounts |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Custom auth domain for same-domain OAuth | Firebase project's firebaseapp.com |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket URL for file uploads | (disabled) |

### Script-Only

| Variable | Description |
|----------|-------------|
| `SERVICE_ACCOUNT_PATH` | Path to service account JSON file on disk |
| `EXECUTIVE_SEQ` | Sequence number for bootstrap executive (default: `001`) |
| `EXECUTIVE_PASSWORD` | Initial password for bootstrap executive (default: `1234567`) |
| `EXECUTIVE_NAME` | Display name for bootstrap executive |

See `.env.example` for the full documentation.

---

## Build

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Verify
npm run typecheck
```

The build outputs to `.next/` using Next.js standalone output mode.

---

## Deploy to Firebase Hosting + Cloud Run

### 1. Build the Docker Image

```bash
# Build the Next.js standalone output
npm run build

# Build the Docker image
docker build -t knowledge-arena .

# Test locally (optional)
docker run -p 3000:3000 knowledge-arena
```

### 2. Push to Google Container Registry

```bash
# Tag the image
docker tag knowledge-arena gcr.io/YOUR_PROJECT_ID/knowledge-arena

# Push to GCR
docker push gcr.io/YOUR_PROJECT_ID/knowledge-arena
```

### 3. Deploy to Cloud Run

```bash
gcloud run deploy knowledge-arena \
  --image gcr.io/YOUR_PROJECT_ID/knowledge-arena \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 300 \
  --set-env-vars="GOOGLE_GENERATIVE_AI_API_KEY=your_key_here" \
  --set-env-vars="FIREBASE_SERVICE_ACCOUNT_KEY=your_service_account_json"
```

### 4. Configure Firebase Hosting

Update `firebase.json`:

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "https://your-cloud-run-url.a.run.app"
      }
    ]
  }
}
```

```bash
firebase deploy --only hosting
```

---

## Deploy to Vercel

The simplest deployment option for smaller projects:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# - GOOGLE_GENERATIVE_AI_API_KEY
# - FIREBASE_SERVICE_ACCOUNT_KEY (server-side only)
# - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN (optional)
```

**Note:** Vercel Hobby has a 10s function timeout. AI features (PDF quiz generation) may fail if they exceed this limit. Upgrade to Pro for 60s timeout.

---

## Deploy to Firebase App Hosting

Firebase App Hosting is a new option that integrates with Cloud Run:

```bash
# Follow Firebase App Hosting setup in Firebase Console
# Connect your GitHub repository
# Configure environment variables in the console
```

---

## Security Checklist

- [ ] Firestore rules restrict access by authenticated user ID
- [ ] Firebase Auth email/password provider enabled
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` stored as a secret, never in client code
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` stored server-side only
- [ ] CORS headers configured if using custom domains
- [ ] Rate limiting enabled on auth endpoints
- [ ] Helmet-like security headers configured (see `next.config.ts`)

---

## Post-Deployment Checklist

- [ ] `npm run build` passes with zero errors
- [ ] `npm run typecheck` passes with zero errors
- [ ] Firestore indexes deployed (`firebase deploy --only firestore:indexes`)
- [ ] Firestore rules deployed (`firebase deploy --only firestore:rules`)
- [ ] Environment variables configured in hosting dashboard
- [ ] Firebase Authentication email/password provider enabled
- [ ] Test signup with `@staffs.com` email (teacher/executive role)
- [ ] Test signup with other email (student/gladiator role)
- [ ] Bootstrap executive account created (run `npx tsx scripts/bootstrap-executive.ts`)
- [ ] Test quiz creation, joining, live play, and results
- [ ] Test search functionality
- [ ] Test messaging and announcements
- [ ] Test AI PDF quiz generation (if API key is configured)
- [ ] Test CSV/PDF export
- [ ] Verify responsive layout on mobile

---

## Common Issues

### "Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_KEY is not set"

The `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable is missing or empty. Set it in your hosting platform's environment variables with the full minified service account JSON.

### AI features return 500 / timeout

- Genkit AI generation may exceed the function timeout on free plans
- Upgrade to Vercel Pro (60s timeout), Cloud Run (configurable, default 300s), or increase the timeout setting
- The `serverActions.bodySizeLimit` in `next.config.ts` is set to `20mb` — ensure your hosting platform supports this

### "Failed to fetch" / CORS errors

- Ensure `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is set to your production domain
- Firebase Auth OAuth redirects must match the authorised domain list in Firebase Console

### Real-time listeners not working

- Firestore requires websocket-like connections. Ensure your hosting platform supports long-lived connections
- Cloud Run fully supports this; Vercel serverless functions may have limitations

### Build fails with memory error

- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" npm run build`
- Or build locally and deploy the standalone output
