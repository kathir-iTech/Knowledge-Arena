# Knowledge Arena

A real-time quiz platform for classroom battles. Students compete as Gladiators; teachers command as Commanders.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **Database**: Google Firestore (real-time NoSQL)
- **Auth**: Firebase Authentication (email/password, role by domain)
- **AI**: Genkit + Google Gemini
- **Styling**: Tailwind CSS, ShadCN UI, Lucide icons
- **Fonts**: Space Grotesk (headline), Inter (body)

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

See [INSTALL.md](./INSTALL.md) for detailed setup.

## Documentation

| File | Purpose |
|------|---------|
| [INSTALL.md](./INSTALL.md) | Full installation guide |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment instructions |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables reference |
| [DATABASE.md](./DATABASE.md) | Firestore schema and queries |
| [AI.md](./AI.md) | AI/Genkit module reference |
| [API.md](./API.md) | API route reference |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture overview |

## Key Features

- Real-time synchronized quiz battles via Firestore listeners
- Speed-weighted scoring (up to 500 base + 500 speed bonus)
- Anti-cheat: tab-switch detection, fullscreen monitoring, 2-strike disqualification
- AI-powered quiz generation from PDFs
- CSV and PDF result exports
- Role-based access (teacher/student via email domain)

## Project Structure

```
src/
  app/              Next.js App Router pages and API routes
  components/       React components (UI, dashboard, quiz, copilot)
  hooks/            Custom hooks (useAuth, usePageFocusChange, etc.)
  lib/              Utilities, types, schemas, auth verification
  services/         Firestore service layer (CRUD operations)
  ai/               Genkit AI flows and engines
  contexts/         React contexts (Auth)
  firebase/         Firebase initialization and config
docs/               Additional documentation
```
