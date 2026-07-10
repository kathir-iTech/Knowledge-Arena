# Installation Guide

## Prerequisites

- Node.js >= 20
- npm >= 10
- A Firebase project with Authentication and Firestore enabled

## Step 1: Clone and Install

```bash
git clone <repository-url>
cd project
npm install
```

## Step 2: Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and set the required variables (see [ENVIRONMENT.md](./ENVIRONMENT.md)).

## Step 3: Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project (or use existing `studio-4092189688-c74a7`)
3. Enable **Authentication** > Sign-in method > Email/Password
4. Enable **Cloud Firestore** > Create database (start in test mode, apply rules later)
5. In Project Settings > General > Your apps > Web app, copy the config
6. Update `src/firebase/config.ts` with your Firebase project config

## Step 4: Firestore Indexes

Deploy indexes:

```bash
npx firebase-tools deploy --only firestore:indexes
```

Required indexes (defined in `firestore.indexes.json`):
- Collection group on `participants` for student history queries

## Step 5: Firestore Rules

Deploy security rules:

```bash
npx firebase-tools deploy --only firestore:rules
```

## Step 6: Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Step 7: Create Accounts

1. Sign up with an email ending in `@staffs.com` to get the **teacher** role
2. Sign up with any other email to get the **student** role

## AI Features (Optional)

For AI quiz generation from PDF, set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env`.

Get a key at [Google AI Studio](https://aistudio.google.com/app/apikey).

## Troubleshooting

- **Build fails with TypeScript errors**: Run `npm run typecheck` to identify issues
- **Firestore permission denied**: Ensure `firestore.rules` is deployed
- **AI features not working**: Verify `GOOGLE_GENERATIVE_AI_API_KEY` is set
