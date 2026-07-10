# Deployment Guide

## Recommended Platform: Firebase Hosting + Cloud Run

For a Next.js 15 app with real-time Firestore and AI features, the best deployment is:

1. **Firebase Hosting** for static assets + SSR rewrites to Cloud Run
2. **Cloud Run** for the Next.js server (supports Genkit/Google AI SDK)
3. **Firestore + Firebase Auth** for database and authentication (no migration needed)

### Why not Vercel?

- Vercel free tier has a 10-second function timeout — Genkit AI PDF processing may exceed this
- Vercel Hobby has no support for Node.js native modules used by `pdf-parse`
- Firestore real-time listeners work, but Vercel Edge functions have WebSocket limitations

### Why not Render?

- Render's free tier cold starts are slow (15-60s) for Next.js SSR
- No native Firebase emulator support
- Same timeout issues for AI flows

### Firebase Hosting + Cloud Run (Best)

#### Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Docker (for local Cloud Run testing, optional)

#### Build

```bash
npm run build
```

#### Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

**Note**: The current `firebase.json` is configured for a static export of the `.next` directory. For full SSR with Cloud Run:

1. Create a `Dockerfile` for Next.js standalone output
2. Deploy to Cloud Run
3. Update `firebase.json` hosting rewrites to point to the Cloud Run URL

#### Alternative: Static Export (Limited)

For fully static deployment (no SSR, no API routes):

```bash
# Not currently supported — API routes require a server
```

#### Alternative: Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Vercel auto-detects Next.js. Configure environment variables in the Vercel dashboard:
- `GOOGLE_GENERATIVE_AI_API_KEY`

## Environment Variables

Set all required variables in your hosting platform's dashboard.
See [ENVIRONMENT.md](./ENVIRONMENT.md) for the full list.

## Post-Deployment Checklist

- [ ] `npm run build` passes with zero errors
- [ ] Firestore indexes deployed (`firebase deploy --only firestore:indexes`)
- [ ] Firestore rules deployed (`firebase deploy --only firestore:rules`)
- [ ] Environment variables configured in hosting dashboard
- [ ] Firebase Authentication email/password provider enabled
- [ ] Test signup with `@staffs.com` email (teacher role)
- [ ] Test signup with other email (student role)
- [ ] Test quiz creation, joining, live play, and results
- [ ] Test AI PDF generation (if key is configured)
