# Quorena ⚔️

> **The ultimate AI-powered quiz battleground. Create, compete, and conquer.**

Quorena is a real-time multiplayer quiz platform where educators generate AI-powered quizzes from PDFs and students compete in live battles. Built with Next.js, Firebase, and Google Gemini AI.

---

## Features ✨

- **AI PDF Forge** — Generate intelligent multiple-choice quizzes from any PDF using Google Gemini AI. Select difficulty and question count; the AI extracts key concepts and crafts questions automatically.
- **Real-Time Battles** — Compete live with opponents. Questions appear simultaneously on all screens; scores update in real-time via Firestore listeners.
- **Role-Based Access** — Three tiers: **Executive** (admin/analytics), **Commander** (quiz creator/host), **Gladiator** (participant). Tailored dashboards and permissions for each role.
- **Battle Room System** — Each quiz generates a unique 6-character room code with a shareable QR code. Gladiators join by entering the code.
- **Live Scoring & Time Bonus** — Correct answers score `500 + up to 500` time bonus based on speed. Leaderboard updates live.
- **Tab-Visibility Enforcement** — Gladiators who switch browser tabs during a battle are detected and can be blocked (anti-cheating).
- **Smart Analytics** — Track performance with detailed per-quiz, per-student, and per-question insights. Export to CSV or HTML.
- **Executive Workspace** — Central dashboard with system health monitoring, user management, audit logs, backup/restore, and platform settings.
- **Commander Dashboard** — Create quizzes, manage battles, view participant stats, and send requests to Executive.
- **Gladiator Profile** — View battle history, scores, accuracy stats, and join new battles via room code.
- **Messaging System** — Direct conversations between Executives and Commanders with real-time updates, file attachments, and unread counts.
- **Announcements** — Executives can broadcast announcements to all Commanders or target specific individuals.
- **Notifications** — System-wide notification service for battle completion, new messages, requests, and system warnings.
- **Audit Logging** — Every action is logged with actor, role, action type, target, and metadata. Filterable and paginated.
- **Backup & Restore** — Full platform backup (users, quizzes, conversations, settings) with import/restore capability.
- **Data Export** — Export users, questions, battles, and audit logs in CSV or JSON format.
- **Rate Limiting** — Sliding-window rate limiter for login, signup, and AI API endpoints.
- **File Attachments** — Secure file upload validation with MIME type, extension, and size checks.
- **Password Management** — Force password change on first login; Executive can reset passwords.
- **Cheating Detection** — Tab-switch violations tracked per participant; automated or manual blocking.
- **Dark-Themed UI** — Cyberpunk-inspired design with electric blue and neon purple accents, smooth animations, and responsive layout.

---

## Tech Stack 🛠

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router, Turbopack) |
| Language | [TypeScript](https://www.typescriptlang.org/) (strict mode) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v3 + `tailwind-merge` + `class-variance-authority` |
| UI Components | [Radix UI](https://www.radix-ui.com/) primitives + [Lucide React](https://lucide.dev/) icons + [Recharts](https://recharts.org/) |
| Forms | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) validation |
| Backend / Auth | [Firebase](https://firebase.google.com/) (Auth, Firestore, Storage) |
| Admin SDK | [firebase-admin](https://firebase.google.com/docs/admin/setup) (server-side) |
| AI / Genkit | [Genkit](https://firebase.google.com/docs/genkit) + [Gemini 2.0 Flash](https://ai.google.dev/) via `@genkit-ai/googleai` |
| PDF Parsing | [pdfreader](https://www.npmjs.com/package/pdfreader) (pure Node.js) |
| Testing | [Playwright](https://playwright.dev/) (E2E) |
| Deployment | [Vercel](https://vercel.com/) (standalone output) |

---

## Architecture Overview 🏗

Quorena follows a **hybrid architecture** combining server-rendered pages, client-side Firebase SDK for real-time data, and server-side API routes for admin operations.

The Next.js 15 App Router serves as the backbone, with React Server Components for static content and Client Components for interactive real-time features. Authentication is handled client-side via Firebase Auth, with ID tokens verified server-side in API routes using the Firebase Admin SDK. Authorization is enforced at three layers: **client-side route guards** (redirects by role), **API route verification** (role-checked middleware), and **Firestore Security Rules**.

All quiz-scoped data is organized under `quizzes/{quizId}` subcollections (questions, answer keys, participants, submissions), providing fast queries and natural data isolation. The AI PDF Forge pipeline uses Genkit to call Google Gemini with a multi-model fallback chain, retry logic, and JSON repair utilities. Real-time features like battle progression, messaging, and leaderboard updates leverage Firestore's `onSnapshot` listeners for instant state synchronization across clients.

---

## Quick Start 🚀

### Prerequisites

- **Node.js** v20+ (LTS recommended)
- **npm** v10+
- **Firebase project** with Auth (Email/Password + Google), Firestore, and (optionally) Storage enabled
- **Google AI API key** from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/knowledge-arena.git
cd knowledge-arena

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your Firebase config and API keys
```

### Run Development

```bash
# Start the Next.js dev server
npm run dev

# (Optional) Start Genkit flow dev server
npm run genkit:dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Key Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run genkit:dev` | Start Genkit flow development UI |
| `npm test` | Run Playwright E2E tests |

---

## Project Structure 📁

```
knowledge-arena/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API route handlers
│   │   │   ├── admin/          # User management
│   │   │   ├── audit/          # Audit logging
│   │   │   ├── battle/         # Battle engine (start, activate, advance, end, ...)
│   │   │   ├── commander/      # Commander dashboard & requests
│   │   │   ├── decision-support/ # AI decision support
│   │   │   ├── executive/      # Executive workspace, analytics, export, backup
│   │   │   ├── gladiator/      # Gladiator dashboard
│   │   │   ├── knowledge/      # AI knowledge summary
│   │   │   ├── messaging/      # Conversations, announcements
│   │   │   ├── predictions/    # AI prediction summary
│   │   │   └── rate-limit/     # Rate limit checking
│   │   ├── battle/             # Battle room page
│   │   ├── commander/          # Commander portal
│   │   ├── create-quiz/        # Quiz creation page
│   │   ├── executive/          # Executive portal
│   │   ├── gladiator/          # Gladiator portal
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Landing page
│   │   └── globals.css         # Global styles
│   ├── ai/                     # Genkit AI integration
│   │   ├── engines/            # AI engine implementations
│   │   ├── flows/              # Genkit flow definitions
│   │   └── genkit.ts           # Genkit instance
│   ├── components/             # React components
│   │   ├── analytics/          # Analytics charts & tables
│   │   ├── auth/               # Login form
│   │   ├── dashboard/          # Role-specific dashboards
│   │   ├── profile/            # Profile components
│   │   ├── quiz/               # Quiz-related components
│   │   └── ui/                 # Primitive UI components
│   ├── config/                 # App configuration
│   ├── contexts/               # React contexts (AuthContext)
│   ├── firebase/               # Firebase client SDK setup
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Shared utilities & types
│   ├── services/               # Business logic services
│   ├── types/                  # TypeScript type declarations
│   └── middleware.ts           # Next.js middleware
├── tests/                      # Playwright E2E tests
├── docs/                       # Architecture documentation
├── scripts/                    # CLI utility scripts
├── public/                     # Static assets
├── .env.example                # Environment variable template
├── next.config.ts              # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
├── firebase.json               # Firebase configuration
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Firestore composite indexes
├── storage.rules               # Firebase Storage rules
└── Dockerfile                  # Docker container definition
```

---

## Environment Variables

See [ENVIRONMENT.md](./ENVIRONMENT.md) for the complete reference.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | Google Gemini API key |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | ✅ (prod) | Firebase Admin SDK private key (minified JSON) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ❌ | Custom auth domain for OAuth |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ❌ | Firebase Storage bucket URL |

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete deployment guide.

1. Set environment variables in Vercel project settings
2. Deploy with `vercel --prod` or via GitHub integration
3. The app uses `next.config.ts` with `output: 'standalone'` — compatible with Vercel, Docker, or Node.js hosting

---

## Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data model, auth flow, design decisions |
| [API.md](./API.md) | Complete API endpoint reference |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables reference |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment guide for Vercel |

---

## License

MIT
