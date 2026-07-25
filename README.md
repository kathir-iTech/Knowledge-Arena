# Knowledge Arena

A real-time quiz battle platform for classrooms. Teachers create and command quiz battles (arenas) while students compete as gladiators in live synchronized rounds.

---

## Features

### For Executives (Platform Administrators)

- **Workspace Dashboard** — real-time platform health, user counts, active battles, pending requests
- **Commander Management** — create, disable, reset passwords, view battle history
- **Student Management** — view all gladiators, their stats and activity
- **Request Management** — review and act on commander requests with file attachments
- **Question Bank** — create, edit, import AI-generated questions, organize by category/difficulty
- **Announcements** — broadcast messages to all commanders
- **Messaging** — direct conversations with commanders, file sharing
- **Analytics** — daily/weekly battle stats, user growth, category usage, exports
- **Audit Logs** — full action history with search and filters
- **Export** — data export in CSV/JSON formats
- **Backup & Restore** — full Firestore collection backup and import
- **Settings** — platform-wide configuration

### For Commanders (Teachers/Quiz Creators)

- **Battle Control** — create, edit, duplicate, archive arenas with sorting and search
- **Live Quiz** — synchronized real-time quiz rounds with question-by-question progress
- **Auto-grading** — speed-weighted scoring (up to 500 base + 500 speed bonus)
- **Anti-cheat** — tab-switch detection, fullscreen enforcement, 2-strike disqualification
- **AI Quiz Generation** — generate quizzes from PDF uploads using Gemini AI
- **Student Analytics** — per-student performance breakdown by quiz
- **Result Export** — CSV and PDF export of battle results
- **Battle History** — searchable past battles with average score
- **Requests** — submit and track requests to executive with file attachments
- **Messaging** — communicate with executive, receive announcements
- **Profile** — avatar (emoji/image), display name, activity log

### For Gladiators (Students)

- **Live Quiz** — join battles with room code, real-time question display, answer submission
- **Speed Scoring** — faster answers earn higher speed bonuses
- **Auto-advance** — automatic next question when time expires
- **Results** — per-question feedback, final score, leaderboard
- **Battle History** — past results with scores and dates
- **Profile** — avatar selection, stats card

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, Turbopack, standalone output) |
| **Database** | Google Firestore (real-time NoSQL with listeners) |
| **Auth** | Firebase Authentication (email/password, role-by-domain) |
| **AI** | Genkit + Google Gemini (quiz generation, predictions, copilot) |
| **Styling** | Tailwind CSS, ShadCN UI, Lucide icons |
| **Fonts** | Space Grotesk (headline), Inter (body) |
| **Charts** | Recharts |
| **Language** | TypeScript (strict) |

---

## Folder Structure

```
knowledge-arena/
├── .env.example              # Environment variable reference
├── .github/workflows/        # CI/CD pipeline
├── public/                   # Static assets
├── scripts/                  # CLI maintenance scripts
│   ├── bootstrap-executive.ts
│   ├── check-commander.ts
│   └── cleanup-knowledge-arena.ts
├── src/
│   ├── ai/                   # Genkit AI flows and engines
│   │   ├── engines/          # Decision support, knowledge, prediction
│   │   └── flows/            # Quiz generation, PDF processing
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # 30+ REST API routes
│   │   │   ├── admin/        # User CRUD (executive only)
│   │   │   ├── commander/    # Commander-specific endpoints
│   │   │   ├── executive/    # Executive-specific endpoints
│   │   │   ├── gladiator/    # Gladiator-specific endpoints
│   │   │   ├── messaging/    # Conversations + announcements
│   │   │   ├── audit/        # Audit logging
│   │   │   └── ...           # Predictions, knowledge, rate-limit, etc.
│   │   ├── commander/        # Commander pages
│   │   ├── executive/        # Executive pages
│   │   ├── gladiator/        # Gladiator pages
│   │   ├── battle/           # Live quiz battle page
│   │   ├── create-quiz/      # Quiz creation page
│   │   └── ...               # Shared pages
│   ├── components/           # React components
│   │   ├── ui/               # ShadCN UI primitives
│   │   ├── dashboard/        # Role-specific dashboards
│   │   ├── quiz/             # Quiz-related components
│   │   ├── analytics/        # Analytics dashboard
│   │   ├── profile/          # Profile components
│   │   └── ...               # Shared components
│   ├── contexts/             # React contexts (Auth)
│   ├── firebase/             # Firebase client config
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilities, constants, schemas, types, auth
│   └── services/             # Firestore service layer
├── Dockerfile                # Production container
├── firebase.json             # Firebase Hosting config
├── firestore.indexes.json    # Composite Firestore indexes
├── firestore.rules           # Firestore security rules
├── next.config.ts            # Next.js configuration
├── package.json
└── tsconfig.json
```

---

## Installation

### Prerequisites

- Node.js 18+
- npm 9+
- A Firebase project
- Google AI API key (optional, for AI features)

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd knowledge-arena

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your values:
# - GOOGLE_GENERATIVE_AI_API_KEY (get from https://aistudio.google.com/app/apikey)
# - FIREBASE_SERVICE_ACCOUNT_KEY (Firebase Console → Service Accounts)
# - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN (optional)

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Bootstrap Executive Account

```bash
npx tsx scripts/bootstrap-executive.ts
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Production build (standalone output) |
| `npm start` | Start production server |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint (interactive config selection) |

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions for:

- Firebase Hosting + Cloud Run (recommended)
- Vercel (simplest for smaller projects)
- Firebase App Hosting

### Quick Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables in the Vercel dashboard.

---

## Role System

| Role | Email Domain | Access |
|------|-------------|--------|
| Executive | `@staffs.com` | Full admin: manage users, requests, settings, analytics |
| Commander | Any | Create/manage quizzes, view student analytics |
| Gladiator | Any (non-staff) | Join battles, answer questions, view own history |

---

## Documentation

| File | Purpose |
|------|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment guide for all platforms |
| [INSTALL.md](./INSTALL.md) | Detailed installation instructions |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables reference |
| [DATABASE.md](./DATABASE.md) | Firestore schema and query patterns |
| [AI.md](./AI.md) | Genkit AI module reference |
| [API.md](./API.md) | API route documentation |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture overview |

---

## License

MIT
