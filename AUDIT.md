# Knowledge Arena — Complete Technical Audit

> Generated: 2026-07-14  
> Scope: Full codebase analysis of every source file  
> Methodology: Direct file reads — no assumptions or prior conversations

---

## 1. PROJECT STRUCTURE

```
project-root/
├── .agents/
│   ├── skills/
│   │   ├── developing-genkit-js/          # Genkit skill references
│   │   └── fbs-to-agy-export/             # Firebase Studio → Antigravity export skill
│   └── workflows/
├── .github/
├── .idx/                                   # IDX dev environment config
├── .next/                                   # Build output
├── .vscode/
├── docs/
│   ├── backend.json                         # Firestore schema reference
│   └── blueprint.md
├── node_modules/
├── public/
│   └── robots.txt
├── src/
│   ├── ai/                                  # AI layer (Genkit + Gemini)
│   │   ├── engines/
│   │   │   ├── decision-support-engine.ts
│   │   │   ├── knowledge-engine.ts
│   │   │   └── prediction-engine.ts
│   │   ├── flows/
│   │   │   └── generate-quiz-pdf-flow.ts    # PDF extraction + Gemini quiz gen
│   │   ├── genkit.ts                        # Genkit instance setup
│   │   └── index.ts                         # Re-exports
│   ├── app/                                 # Next.js App Router
│   │   ├── api/
│   │   │   ├── debug-pdf/route.ts
│   │   │   ├── decision-support/summary/route.ts
│   │   │   ├── knowledge/summary/route.ts
│   │   │   ├── predictions/summary/route.ts
│   │   │   └── rate-limit/check/route.ts
│   │   ├── battle/[roomCode]/page.tsx
│   │   ├── cheating-detected/page.tsx
│   │   ├── commander/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── edit-arena/[quizId]/page.tsx
│   │   │   ├── history/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── profile/page.tsx
│   │   ├── create-quiz/page.tsx
│   │   ├── executive/
│   │   │   ├── analytics/page.tsx
│   │   │   ├── commanders/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── question-bank/page.tsx
│   │   │   ├── requests/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── students/page.tsx
│   │   ├── gladiator/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── history/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── profile/page.tsx
│   │   ├── kicked/page.tsx
│   │   ├── error.tsx
│   │   ├── global-error.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx                         # Landing/login page
│   ├── components/
│   │   ├── analytics/
│   │   │   ├── AnalyticsDashboard.tsx
│   │   │   ├── charts/index.tsx
│   │   │   ├── QuestionAnalyticsSection.tsx
│   │   │   ├── QuizAnalyticsSection.tsx
│   │   │   ├── QuizOverviewCards.tsx
│   │   │   └── StudentAnalyticsSection.tsx
│   │   ├── auth/LoginForm.tsx
│   │   ├── dashboard/
│   │   │   ├── CommanderDashboard.tsx
│   │   │   └── GladiatorDashboard.tsx
│   │   ├── profile/GladiatorProfile.tsx
│   │   ├── quiz/
│   │   │   ├── BattleRoomLoader.tsx
│   │   │   ├── LiveQuiz.tsx
│   │   │   ├── PDFQuizGenerator.tsx
│   │   │   ├── QuestionReviewPanel.tsx
│   │   │   ├── QuizCreatorForm.tsx
│   │   │   ├── QuizEditor.tsx
│   │   │   ├── QuizResults.tsx
│   │   │   ├── QuizReview.tsx
│   │   │   └── WaitingRoom.tsx
│   │   ├── ui/                               # shadcn/ui primitives (button, card, dialog, etc.)
│   │   ├── AvatarEditor.tsx
│   │   ├── ClientLayout.tsx
│   │   ├── CommanderSidebar.tsx
│   │   ├── ExecutiveSidebar.tsx
│   │   ├── FirebaseErrorListener.tsx
│   │   ├── GladiatorSidebar.tsx
│   │   └── LoadingScreen.tsx
│   ├── contexts/AuthContext.tsx               # Auth state management
│   ├── firebase/
│   │   ├── client-provider.tsx
│   │   ├── config.ts                          # Firebase project config
│   │   ├── error-emitter.ts
│   │   ├── errors.ts                          # FirestorePermissionError class
│   │   ├── index.ts                           # Firebase init + exports
│   │   └── provider.tsx                       # Firebase context provider
│   ├── hooks/
│   │   ├── useAnalytics.ts
│   │   ├── useAuth.ts
│   │   ├── use-mobile.tsx
│   │   ├── usePageFocusChange.ts
│   │   └── use-toast.ts
│   ├── lib/
│   │   ├── firebase-admin.ts                  # Firebase Admin SDK init
│   │   ├── quiz-validator.ts                  # Question validation logic
│   │   ├── rate-limiter.ts                    # In-memory sliding window rate limiter
│   │   ├── schemas.ts                         # ValidatedQuiz, ValidatedParticipant types
│   │   ├── types.ts                           # User type
│   │   ├── utils.ts                           # cn(), generateRoomCode()
│   │   └── verify-auth.ts                     # Server-side Firebase token verification (REST)
│   ├── services/
│   │   ├── analytics.service.ts               # Analytics computation + CSV/HTML export
│   │   ├── game.service.ts                    # Questions, answer keys, submissions, scoring
│   │   ├── participant.service.ts             # Participant CRUD + history
│   │   └── quiz.service.ts                    # Quiz CRUD + duplication
│   └── types/pdfreader.d.ts                   # Type declarations for pdfreader package
├── .antigravityignore
├── .dockerignore
├── .env                                        # GOOGLE_GENERATIVE_AI_API_KEY
├── .env.example
├── .firebaserc
├── .gitignore
├── apphosting.yaml
├── components.json                             # shadcn/ui config
├── Dockerfile
├── firebase.json                               # Firebase hosting, emulators, rules references
├── firestore.indexes.json
├── firestore.rules
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── storage.rules
├── tailwind.config.ts
├── tsconfig.json
└── studio.json                                 # Firebase Studio project ID
```

---

## 2. TECH STACK

### Languages & Runtime
| Technology | Version | Usage |
|---|---|---|
| TypeScript | ^5.9.3 | All source code |
| Node.js | >=20 (Docker: 22-alpine) | Server runtime |
| HTML/CSS | — | Pages + Tailwind |

### Framework
| Technology | Version | Usage |
|---|---|---|
| Next.js | ^15.5.9 | App Router, server actions, API routes, SSR/CSR |
| React | ^19.2.1 | UI components |
| Turbopack | — | Dev server bundler |

### UI & Styling
| Library | Version | Usage |
|---|---|---|
| TailwindCSS | ^3.4.1 | Utility CSS framework |
| tailwindcss-animate | ^1.0.7 | Animation utilities |
| tailwind-merge | ^3.0.1 | Class merging |
| clsx | ^2.1.1 | Conditional classnames |
| class-variance-authority | ^0.7.1 | Component variants |
| lucide-react | ^0.475.0 | Icons (BrainCircuit, Swords, Shield, etc.) |
| recharts | ^3.9.2 | Analytics charts |
| react-qr-code | ^2.0.12 | QR code generation |

### shadcn/ui Components
| Component | File |
|---|---|
| AlertDialog | `src/components/ui/alert-dialog.tsx` |
| Avatar | `src/components/ui/avatar.tsx` |
| Badge | `src/components/ui/badge.tsx` |
| Button | `src/components/ui/button.tsx` |
| Card | `src/components/ui/card.tsx` |
| Checkbox | `src/components/ui/checkbox.tsx` |
| Dialog | `src/components/ui/dialog.tsx` |
| DropdownMenu | `src/components/ui/dropdown-menu.tsx` |
| Form | `src/components/ui/form.tsx` |
| Input | `src/components/ui/input.tsx` |
| Label | `src/components/ui/label.tsx` |
| RadioGroup | `src/components/ui/radio-group.tsx` |
| Select | `src/components/ui/select.tsx` |
| Separator | `src/components/ui/separator.tsx` |
| Sheet | `src/components/ui/sheet.tsx` |
| Sidebar | `src/components/ui/sidebar.tsx` |
| Skeleton | `src/components/ui/skeleton.tsx` |
| Slider | `src/components/ui/slider.tsx` |
| Tabs | `src/components/ui/tabs.tsx` |
| Textarea | `src/components/ui/textarea.tsx` |
| Toast | `src/components/ui/toast.tsx` |
| Toaster | `src/components/ui/toaster.tsx` |
| Tooltip | `src/components/ui/tooltip.tsx` |

### Firebase
| SDK | Version | Usage |
|---|---|---|
| firebase | ^11.9.1 | Client SDK (auth, firestore) |
| firebase-admin | ^14.1.0 | Admin SDK (server-side Firestore access) |
| Firebase Auth | — | Email/password authentication |
| Firestore | — | Primary database |
| Firebase Hosting | — | Static hosting + rewrites |
| Firebase Emulators | — | Local dev (Firestore:8080, Auth:9099, Hosting:5000, UI:4000) |

### AI Layer
| Library | Version | Usage |
|---|---|---|
| genkit | ^1.0.0 | AI orchestration, flow definition, prompts |
| @genkit-ai/googleai | ^1.0.0 | Google AI (Gemini) plugin |
| Google Gemini 2.5 Flash | — | Default AI model |
| Google Gemini 2.0 Flash | — | First fallback model |
| Google Gemini 2.5 Pro | — | Second fallback model |

### PDF Extraction
| Library | Version | Usage |
|---|---|---|
| pdfreader | ^3.0.8 | Server-side PDF text extraction (wraps pdf2json) |
| pdf2json | 3.1.4 | Transitive dep of pdfreader, actual PDF parser |

### Forms & Validation
| Library | Version | Usage |
|---|---|---|
| react-hook-form | ^7.54.2 | Form state management |
| @hookform/resolvers | ^4.1.3 | Zod resolver for react-hook-form |
| zod | ^3.24.2 | Schema validation (quiz input, AI output, forms) |

### Utilities
| Library | Version | Usage |
|---|---|---|
| uuid | ^9.0.1 | ID generation for questions |
| @types/uuid | ^9.0.8 | Type definitions |
| recharts | ^3.9.2 | Analytics charting |

### Development
| Tool | Version | Usage |
|---|---|---|
| TypeScript | ^5.9.3 | Type checking (`tsc --noEmit`) |
| cross-env | ^7.0.3 | Cross-platform env vars |
| genkit-cli | ^1.0.0 | Genkit dev tools |
| postcss | ^8 | CSS processing |
| @types/node | ^20 | Node.js types |
| @types/react | ^19.2.1 | React types |
| @types/react-dom | ^19.2.1 | React DOM types |

**Notable absences**: No ESLint config (ignored in build), no Prettier config, no testing framework.

---

## 3. APPLICATION ARCHITECTURE

### Architecture Pattern
**Next.js 15 App Router** with a mix of:
- **Client Components** (`'use client'`) — most pages and interactive components
- **Server Actions** (`'use server'`) — `generateQuizFromPDF` in `generate-quiz-pdf-flow.ts`
- **API Routes** — 5 REST endpoints under `src/app/api/`
- **Server-Side Rendered Pages** — minimal SSR (battle entry)

### Data Flow
```
[Browser] ←→ [Next.js Server]
   ↓              ↓
[Firebase Auth]  [Firebase Admin SDK]
   ↓              ↓
[Firestore (Realtime)]  [Genkit + Gemini API]
```

### State Management
- **Auth state**: `AuthContext` (React Context) wrapping Firebase `onAuthStateChanged`
- **Firebase services**: `FirebaseProvider` (React Context) providing `auth`, `firestore`, `firebaseApp`
- **Local state**: `useState`/`useMemo`/`useCallback` — no external state library
- **Realtime data**: Firestore `onSnapshot` subscriptions (participants, questions, quiz status)

### Routing
```
/                          → Landing page (login form)
/commander/*               → Teacher role pages
/gladiator/*               → Student role pages
/executive/*               → Teacher admin pages
/create-quiz               → Quiz creation (both manual + AI forge)
/battle/[roomCode]         → Battle room (waiting → live → results)
/kicked                    → Kicked page
/cheating-detected         → Cheating detected page
/api/*                     → API routes
```

### Role-Based Routing
- **`ClientLayout`** wraps all pages and redirects based on `user.role`:
  - `/` → not logged in: stay; teacher: → `/commander/dashboard`; student: → `/gladiator/dashboard`
  - Teacher accessing `/gladiator/*` → redirect to `/commander/dashboard`
  - Student accessing `/commander/*`, `/executive/*`, `/create-quiz` → redirect to `/gladiator/dashboard`
  - `/battle/*` → always allowed for authenticated users

### AI Flow
```
PDF Upload (browser FileReader → base64 data URI)
  → Server Action (generateQuizFromPDF)
    → verifyFirebaseToken (REST API call to Firebase Identity Toolkit)
    → rateLimiter.check (in-memory sliding window, 5/min)
    → Buffer.from(base64)
    → extractTextFromPdfBuffer (pdfreader)
    → Build prompt (content + difficulty + question count)
    → callGeminiWithFallback (gemini-2.5-flash → 2.0-flash → 2.5-pro)
    → Parse structured output (zod schema)
    → Return { questions, difficulty, engine }
  → Client receives questions → QuestionReviewPanel
  → User reviews/edits → "Create Arena" → Firestore writes
```

---

## 4. DATABASE STRUCTURE (FIRESTORE)

### Collection: `users/{userId}`

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `email` | string | Email address |
| `role` | `'teacher'` \| `'student'` | User role |
| `avatar` | string | Emoji avatar (e.g., "🤖") |

**Relationships**: Referenced by `quizzes.created_by`, `quizzes/*/participants/*`

---

### Collection: `quizzes/{quizId}`

| Field | Type | Description |
|---|---|---|
| `title` | string | Arena title |
| `status` | `'waiting'` \| `'live'` \| `'finished'` | Current arena state |
| `created_by` | string (ref → `users`) | Creator user ID |
| `created_at` | number (ms timestamp) | Creation timestamp |
| `current_question_index` | number | Current question (0-based, -1 = not started) |
| `question_count` | number | Total questions |
| `question_start_at` | number \| null | Timestamp for question timer start |
| `archived` | boolean | Soft-delete flag |

**Key**: 6-character uppercase alphanumeric room code (e.g., `A3B2C1`)

---

### Subcollection: `quizzes/{quizId}/questions/{questionId}`

| Field | Type | Description |
|---|---|---|
| `text` | string | Question text |
| `options` | string[4] | 4 multiple-choice options |
| `timer` | number | Time limit in seconds |
| `sort_index` | number | Display order |
| `scored` | boolean | Whether question has been scored (set during evaluation) |

---

### Subcollection: `quizzes/{quizId}/questions/{questionId}/submissions/{userId}`

| Field | Type | Description |
|---|---|---|
| `question_id` | string | Question ID |
| `selected_option` | number (0–3) | Chosen answer |
| `submittedAt` | number (ms) | Submission timestamp |

---

### Subcollection: `quizzes/{quizId}/answerKeys/{questionId}`

| Field | Type | Description |
|---|---|---|
| `correct_option_index` | number (0–3) | Index of correct answer |

---

### Subcollection: `quizzes/{quizId}/participants/{userId}`

| Field | Type | Description |
|---|---|---|
| `user_id` | string (ref → `users`) | Participant user ID |
| `score` | number | Total score |
| `status` | `'playing'` \| `'finished'` \| `'blocked'` | Participant state |
| `violations_count` | number | Malpractice violations |
| `name` | string \| undefined | Display name |
| `avatar` | string \| undefined | Emoji avatar |

---

### Indexes (`firestore.indexes.json`)

**Composite Index:**
- Collection: `quizzes`
- Fields: `created_by` ASC, `created_at` DESC

**Collection Group Override:**
- Collection: `participants`
- Field: `user_id` ASC (collection group query for student history)

---

### Relationships Diagram

```
users (userId)
  └─ created_by ──→ quizzes (quizId)
                      ├─ participants (userId)
                      ├─ questions (questionId)
                      │   └─ submissions (userId)
                      └─ answerKeys (questionId)
```

---

## 5. FIREBASE

### Client SDK (`src/firebase/`)
- **`config.ts`**: Hardcoded Firebase project config (`projectId: studio-4092189688-c74a7`, `apiKey`, `appId`, etc.)
- **`index.ts`**: On-client Firebase initialization with `initializeApp`, returns SDK triplet `{ firebaseApp, auth, firestore }`
- **`provider.tsx`**: React context providing `{ firebaseApp, firestore, auth, user, isUserLoading, userError }`
- **`client-provider.tsx`**: Initializes Firebase once via `useMemo` and wraps children in `FirebaseProvider`
- **`errors.ts`**: `FirestorePermissionError` class that logs detailed debug info including auth object and rules context
- **`error-emitter.ts`**: Custom event emitter for permission errors (used by `FirebaseErrorListener`)

### Admin SDK (`src/lib/firebase-admin.ts`)
- Initializes from `FIREBASE_SERVICE_ACCOUNT_KEY` env var (full JSON string) or `applicationDefault()`
- Exposes `getAdminFirestore()` and `fetchDocsWithToken()` helper
- Used by: `prediction-engine.ts`, `knowledge-engine.ts`

### Auth Flow (Server-side)
- **`verify-auth.ts`**: Token verification via Firebase Identity Toolkit REST API (`POST accounts:lookup`). No Admin SDK dependency. Supports role verification via Firestore REST API (`GET /users/{uid}`).

### Security Rules (`firestore.rules`)
- **Functions**: `isSignedIn()`, `getRole()`, `isTeacher()`, `isOwner(userId)`, `isQuizCreator(quizId)`, `isNotBlocked(quizId, userId)`
- **`users/{userId}`**: Read: all authenticated. Create: self only. Update: self only (role changes blocked).
- **`quizzes/{quizId}`**: Read: all authenticated. Create: teachers only. Update/Delete: quiz creator only.
- **`questions/{questionId}`**: Read: all authenticated. Create/Update/Delete: quiz creator only.
- **`answerKeys/{questionId}`**: Read: quiz creator OR quiz finished. Create/Update/Delete: quiz creator only.
- **`submissions/{userId}`**: Read: quiz creator OR submitter. Create: submitter only (if not blocked). Delete: quiz creator only.
- **`participants/{userId}`**: Read: all authenticated. Create: self only. Update: quiz creator OR self (limited to `violations_count` increment). Delete: quiz creator only.

### Storage Rules (`storage.rules`)
- All read/write denied (no file storage in use).

### Emulators (`firebase.json`)
- Firestore: port 8080, Auth: port 9099, Hosting: port 5000, UI: port 4000

### Environment Variables
| Variable | Source | Usage |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | `.env` | Gemini API key |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `.env` (not in `.env.example`) | Admin SDK service account JSON |
| `NEXT_PUBLIC_TEACHER_DOMAIN` | `.env` (optional, default `@staffs.com`) | Teacher email domain |

---

## 6. ROUTES (PAGES)

### Landing
| Route | File | Access | Purpose |
|---|---|---|---|
| `/` | `src/app/page.tsx` | All (unauthenticated) | Login page with room code support via `?roomCode=` |

### Commander (Teacher only)
| Route | File | Access | Purpose |
|---|---|---|---|
| `/commander/dashboard` | `src/app/commander/dashboard/page.tsx` | Teacher | Arena library with search, sort, filter — create, duplicate, delete, export |
| `/commander/edit-arena/[quizId]` | `src/app/commander/edit-arena/[quizId]/page.tsx` | Teacher (creator) | Edit arena title, questions, options, timers |
| `/commander/history` | `src/app/commander/history/page.tsx` | Teacher | List of finished quizzes with winners |
| `/commander/profile` | `src/app/commander/profile/page.tsx` | Teacher | Profile edit (name + emoji avatar) |

### Gladiator (Student only)
| Route | File | Access | Purpose |
|---|---|---|---|
| `/gladiator/dashboard` | `src/app/gladiator/dashboard/page.tsx` | Student | Join arena (room code input) + recent history |
| `/gladiator/history` | `src/app/gladiator/history/page.tsx` | Student | Full battle history table |
| `/gladiator/profile` | `src/app/gladiator/profile/page.tsx` | Student | Profile edit (name + emoji avatar) |

### Executive (Teacher admin)
| Route | File | Access | Purpose |
|---|---|---|---|
| `/executive/dashboard` | `src/app/executive/dashboard/page.tsx` | Teacher | Analytics dashboard (dynamic import) |
| `/executive/analytics` | `src/app/executive/analytics/page.tsx` | Teacher | Same analytics dashboard |
| `/executive/commanders` | `src/app/executive/commanders/page.tsx` | Teacher | **Placeholder** — "No commanders" |
| `/executive/question-bank` | `src/app/executive/question-bank/page.tsx` | Teacher | **Placeholder** — "No questions" |
| `/executive/requests` | `src/app/executive/requests/page.tsx` | Teacher | **Placeholder** — "No pending requests" |
| `/executive/settings` | `src/app/executive/settings/page.tsx` | Teacher | **Placeholder** — "Settings not available" |
| `/executive/students` | `src/app/executive/students/page.tsx` | Teacher | **Placeholder** — "No student records" |

### Arena (All authenticated)
| Route | File | Access | Purpose |
|---|---|---|---|
| `/create-quiz` | `src/app/create-quiz/page.tsx` | Teacher | Arena Architect — Manual creation or AI PDF Forge |
| `/battle/[roomCode]` | `src/app/battle/[roomCode]/page.tsx` | All authenticated | Battle room router → Waiting / Live / Results |

### Utility (All)
| Route | File | Access | Purpose |
|---|---|---|---|
| `/kicked` | `src/app/kicked/page.tsx` | All | Post-kick screen with violation info |
| `/cheating-detected` | `src/app/cheating-detected/page.tsx` | All | Generic unauthorized access |
| `/not-found` | `src/app/not-found.tsx` | All | 404 page |
| `/error` | `src/app/error.tsx` | All | Client error boundary |
| `/global-error` | `src/app/global-error.tsx` | All | Global error boundary |

---

## 7. API ENDPOINTS

### `POST /api/debug-pdf`
- **File**: `src/app/api/debug-pdf/route.ts`
- **Auth**: None
- **Input**: `{ pdfDataUri: string }`
- **Output**: `{ success, pages, textLength, totalItems, pagesWithNoText, isImageOnly, first300, logs }`
- **Purpose**: Debug endpoint to test PDF text extraction. Uses `pdfreader` library.
- **Error**: Returns `{ error, details, stack, logs }`

### `POST /api/rate-limit/check`
- **File**: `src/app/api/rate-limit/check/route.ts`
- **Auth**: None (uses client IP)
- **Input**: `{ type: 'login' | 'signup', identifier?: string }`
- **Output**: `{ allowed: true }` or `{ error, retryAfter }` with 429 status
- **Purpose**: Pre-flight rate limit check for login/signup. Checks IP-based and email-based limits.

### `GET /api/knowledge/summary`
- **File**: `src/app/api/knowledge/summary/route.ts`
- **Auth**: Firebase token with `teacher` role
- **Rate limit**: 10 requests/min per user
- **Output**: `{ insight, topicCoverage, nextStrategicMove }` (AI-generated)
- **Purpose**: AI-powered knowledge summary of arena stats.
- **Error**: Returns `{ success: false, message, stack? }` with 401/429/500 status

### `GET /api/predictions/summary`
- **File**: `src/app/api/predictions/summary/route.ts`
- **Auth**: Firebase token with `teacher` role
- **Rate limit**: 10 requests/min per user
- **Output**: `{ trend, predictedEngagement, recommendation }` (AI-generated)
- **Purpose**: AI prediction based on recent quiz stats.
- **Error**: Returns `{ success: false, message, stack? }` with 401/429/500 status

### `GET /api/decision-support/summary`
- **File**: `src/app/api/decision-support/summary/route.ts`
- **Auth**: Firebase token with `teacher` role
- **Rate limit**: 10 requests/min per user
- **Output**: `{ criticalAlerts, arenaOptimization, commanderAdvice }` (AI-generated)
- **Purpose**: AI-generated strategic advice for teachers.
- **Error**: Returns `{ success: false, message, stack? }` with 401/429/500 status

---

## 8. SERVER ACTIONS

### `generateQuizFromPDF(input)`
- **File**: `src/ai/flows/generate-quiz-pdf-flow.ts`
- **Role**: Exported server action (`'use server'`)
- **Auth**: Firebase ID token verification via `verifyFirebaseToken`
- **Rate limit**: 5 requests/min per user (in-memory sliding window)
- **Input**: `{ pdfDataUri: string, difficulty: 'easy'|'moderate'|'hard', questionCount: 3-30, idToken: string }`
- **Output**: `{ questions: Array<{text, options, correctAnswerIndex, explanation}>, difficulty, engine?, error? }`
- **Flow**:
  1. Verify Firebase token → get uid
  2. Rate limit check
  3. Validate PDF size (max 10MB decoded)
  4. Decode base64 → Buffer
  5. Extract text using `pdfreader` (PdfReader.parseBuffer)
  6. Clean text (collapse whitespace, trim)
  7. Validate text length (min 20 chars, reject image-only PDFs)
  8. Build Gemini prompt with difficulty mapping (max 40K chars)
  9. Call Gemini with fallback chain (2.5-flash → 2.0-flash → 2.5-pro)
  10. Parse structured JSON output
  11. Return questions or error reason

---

## 9. USER ROLES

### Teacher (`role: 'teacher'`)
**Determined by email domain** — defaults to `@staffs.com` (configurable via `NEXT_PUBLIC_TEACHER_DOMAIN` env var)

**Permissions:**
- Create/update/delete quizzes
- Create/update/delete questions and answer keys
- Start quizzes, advance questions, finish quizzes
- View all submissions and answer keys before quiz finishes
- View analytics
- Block/unblock participants
- Export results (CSV + HTML)

**Accessible pages:**
- `/commander/*`, `/executive/*`, `/create-quiz`, `/battle/*`, `/commander/history`

**Restricted from:**
- `/gladiator/*` (redirected to `/commander/dashboard`)

### Student (`role: 'student'`)
**Determined by email domain NOT matching teacher domain**

**Permissions:**
- Join quizzes (by room code)
- Submit answers
- Report violations (self-report)
- View own submissions after quiz finishes
- View own history

**Accessible pages:**
- `/gladiator/*`, `/battle/*`

**Restricted from:**
- `/commander/*`, `/executive/*`, `/create-quiz` (redirected to `/gladiator/dashboard`)

### Role Detection
- **Runtime**: `AuthContext.signup()` checks email domain with case-insensitive `endsWith(teacherDomain)`
- **Firestore Rules**: `isTeacher()` checks Firestore `users/{uid}.role == 'teacher'`
- **Server-side**: `verifyFirebaseTokenWithRole()` in `verify-auth.ts` fetches role from Firestore REST API

---

## 10. COMPLETE WORKFLOWS

### Executive Workflow
```
Executive logs in (teacher email @staffs.com)
  → Redirected to /commander/dashboard  (no separate executive dashboard)
  → Can access /executive/* pages:
    → Dashboard: analytics charts (Recharts)
    → Analytics: same dashboard
    → Commanders: PLACEHOLDER
    → Question Bank: PLACEHOLDER
    → Requests: PLACEHOLDER
    → Settings: PLACEHOLDER
    → Students: PLACEHOLDER
```

### Commander (Teacher) Workflow
```
Commander logs in (teacher email @staffs.com)
  → Redirected to /commander/dashboard (Arena Library)
  → Creates arena:
    → Clicks "Create Arena" → /create-quiz
    → Two tabs: "Manual" or "AI PDF Forge"
    → Manual: QuizCreatorForm (title, questions, options, timers)
    → AI Forge: PDFQuizGenerator (upload PDF → extract text → Gemini → questions)
    → Questions appear in QuestionReviewPanel
    → Review, edit, delete, regenerate questions
    → "Create Arena" dialog: title + timer
    → Firestore writes: quiz document, questions, answerKeys, participant entry
    → Redirect to /battle/[roomCode]
  → Battle starts:
    → WaitingRoom: QR code, room code, participant avatars
    → "Start Battle" → quiz status → 'live', question_start_at set
    → LiveQuiz: question display, timer, answer tracking
    → Teacher sees: participant stats, submission counts, violation alerts
    → "Evaluate & Next" → scores computed, next question started
    → "Reveal Podium" → quiz status → 'finished'
  → Results:
    → Leaderboard, scores, individual reviews
    → Export CSV or HTML
    → Edit draft arenas, duplicate, delete
```

### Gladiator (Student) Workflow
```
Gladiator signs up (non-teacher email)
  → Redirected to /gladiator/dashboard
  → Receives room code from teacher (or scans QR)
  → Enters 6-character code → "Join" → POST /battle/[roomCode]
  → If waiting: WaitingRoom (participants list, teacher online indicator)
  → When teacher starts:
    → LiveQuiz: question displayed with timer
    → Select option (A/B/C/D) → submission written to Firestore
    → Violations detected: focus loss → self-report violations_count
    → After 2 violations: blocked → redirected to /kicked
  → When quiz finishes:
    → Results: leaderboard, scores, rank, percentile
    → Review: per-question breakdown with correct/incorrect markers
  → History: /gladiator/history table (quiz, score, date)
```

---

## 11. AI SYSTEM

### Architecture
```
[Genkit Instance] ── plugin ──→ [Google AI (Gemini)]
     │                                    │
     │ ┌──────────────────────────────────┘
     │ ↓                 ↓                 ↓
  [PDF Forge]    [Knowledge Engine]   [Prediction Engine]   [Decision Support]
```

### Genkit Setup (`src/ai/genkit.ts`)
```typescript
export const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-2.5-flash'),
});
```

### PDF Forge (`src/ai/flows/generate-quiz-pdf-flow.ts`)

**Extraction:** `pdfreader` (wraps `pdf2json` internally) — pure Node.js, no DOM APIs.

**Gemini Fallback Chain:**
1. `gemini-2.5-flash` (primary)
2. `gemini-2.0-flash` (first fallback)
3. `gemini-2.5-pro` (second fallback)

**Error Classification:**
- Auth errors (403, PERMISSION_DENIED, API key issues) → thrown immediately
- Rate limit errors (429, RESOURCE_EXHAUSTED, quota, 500, 503) → continue to next model
- All other errors → continue to next model
- If all exceeded → `all_models_failed`
- If all quota errors → `quota_exceeded`

**Prompt Template:**
```
Generate exactly N high-quality multiple-choice questions based on the following content.
Difficulty: {difficulty label}
- Questions must be derived ONLY from the provided content.
- Provide exactly 4 options for each question.
- Ensure distractors are plausible but incorrect.
- Include a clear explanation for the correct answer.
Output format MUST be a JSON object with a "questions" array:
{ "questions": [{ "text", "options"[4], "correctAnswerIndex", "explanation" }] }
Content: {truncated to 40K chars}
```

**Output Validation:** Zod schema ensures structured output.

### Knowledge Engine (`src/ai/engines/knowledge-engine.ts`)
- Uses `fetchDocsWithToken` to get quiz stats from Admin SDK
- Sends `totalArenas` count to Gemini
- Returns `{ insight, topicCoverage, nextStrategicMove }`

### Prediction Engine (`src/ai/engines/prediction-engine.ts`)
- Uses `fetchDocsWithToken` with sorting to get last 5 quizzes
- Sends quiz titles + question counts to Gemini
- Returns `{ trend, predictedEngagement, recommendation }`
- Fallback: if no data, returns static message

### Decision Support Engine (`src/ai/engines/decision-support-engine.ts`)
- No data input — purely prompt-based
- Returns `{ criticalAlerts, arenaOptimization, commanderAdvice }`

### Retry Logic
Shared `withRetry()` helper in knowledge and prediction engines: 3 retries with exponential backoff (1s, 2s, 4s).

### Rate Limiting
- PDF Forge: 5/min per user (in-memory sliding window in `generateQuizFromPDF`)
- AI API endpoints: 10/min per user (in `rate-limiter.ts`, enforced in each API route)

---

## 12. COMPONENT AUDIT

### Dashboard Components
| Component | File | Purpose | Parent | Children |
|---|---|---|---|---|
| `CommanderDashboard` | `src/components/dashboard/CommanderDashboard.tsx` | Arena library with CRUD | Commander dashboard page | `QuizCard` |
| `GladiatorDashboard` | `src/components/dashboard/GladiatorDashboard.tsx` | Join arena + history | Gladiator dashboard page | — |

### Quiz / Arena Components
| Component | File | Purpose | Parent | Children |
|---|---|---|---|---|
| `PDFQuizGenerator` | `src/components/quiz/PDFQuizGenerator.tsx` | PDF upload + Gemini generation UI | `create-quiz/page.tsx` | — |
| `QuestionReviewPanel` | `src/components/quiz/QuestionReviewPanel.tsx` | Review/edit/delete/regenerate questions | `create-quiz/page.tsx` | — |
| `QuizCreatorForm` | `src/components/quiz/QuizCreatorForm.tsx` | Manual quiz creation form | `create-quiz/page.tsx` | — |
| `QuizEditor` | `src/components/quiz/QuizEditor.tsx` | Edit existing arena | `edit-arena/[quizId]/page.tsx` | — |
| `BattleRoomLoader` | `src/components/quiz/BattleRoomLoader.tsx` | Battle room router | `battle/[roomCode]/page.tsx` | `WaitingRoom`, `LiveQuiz`, `QuizResults` |
| `WaitingRoom` | `src/components/quiz/WaitingRoom.tsx` | Pre-battle lobby | `BattleRoomLoader` | `QRCode` |
| `LiveQuiz` | `src/components/quiz/LiveQuiz.tsx` | Active quiz battle | `BattleRoomLoader` | `LiveLeaderboard`, `ParticipantStats` |
| `QuizResults` | `src/components/quiz/QuizResults.tsx` | Post-battle leaderboard | `BattleRoomLoader` | `QuizReview` |
| `QuizReview` | `src/components/quiz/QuizReview.tsx` | Per-question answer review | `QuizResults` | — |

### Analytics Components
| Component | File | Purpose |
|---|---|---|
| `AnalyticsDashboard` | `src/components/analytics/AnalyticsDashboard.tsx` | Main analytics orchestrator |
| `QuizOverviewCards` | `src/components/analytics/QuizOverviewCards.tsx` | Summary stat cards |
| `QuizAnalyticsSection` | `src/components/analytics/QuizAnalyticsSection.tsx` | Per-quiz analytics |
| `StudentAnalyticsSection` | `src/components/analytics/StudentAnalyticsSection.tsx` | Per-student analytics |
| `QuestionAnalyticsSection` | `src/components/analytics/QuestionAnalyticsSection.tsx` | Per-question analytics |
| Charts | `src/components/analytics/charts/index.tsx` | Recharts chart components |

### Auth Components
| Component | File | Purpose |
|---|---|---|
| `LoginForm` | `src/components/auth/LoginForm.tsx` | Login/signup form with tabs |
| `AuthProvider` | `src/contexts/AuthContext.tsx` | Auth context provider |

### Layout Components
| Component | File | Purpose |
|---|---|---|
| `ClientLayout` | `src/components/ClientLayout.tsx` | Auth-aware layout + role-based redirects |
| `CommanderSidebar` | `src/components/CommanderSidebar.tsx` | Teacher sidebar navigation |
| `ExecutiveSidebar` | `src/components/ExecutiveSidebar.tsx` | Executive sidebar navigation |
| `GladiatorSidebar` | `src/components/GladiatorSidebar.tsx` | Student sidebar navigation |
| `LoadingScreen` | `src/components/LoadingScreen.tsx` | Centered loading spinner |
| `FirebaseErrorListener` | `src/components/FirebaseErrorListener.tsx` | Permission error listener that throws |

### Profile Components
| Component | File | Purpose |
|---|---|---|
| `GladiatorProfile` | `src/components/profile/GladiatorProfile.tsx` | Student profile (name + avatar) |
| `AvatarEditor` | `src/components/AvatarEditor.tsx` | Avatar selection |

---

## 13. SERVICES

### `quiz.service.ts` — Quiz CRUD
- `getQuizById(id)` — Fetch single quiz
- `getQuizzesByCreator(creatorId)` — Fetch all quizzes by user
- `createQuiz(data)` — Create with validation (id length, title >=3, valid status, etc.)
- `updateQuizStatus(id, status)` — Update status only
- `startQuiz(id)` — Set status=live, index=0, question_start_at=now
- `advanceToQuestion(id, index)` — Update index + reset timer
- `deleteQuiz(id)` — Cascading delete (submissions → questions → participants → answerKeys → quiz)
- `resetQuiz(id)` — Reset to waiting state (delete submissions, participants, reset index)
- `updateQuiz(id, data)` — Partial update (title, archived)
- `duplicateQuiz(id, creatorId)` — Full deep copy with rollback on failure
- `subscribeToQuiz(id, callback)` — Real-time snapshot listener

### `game.service.ts` — Questions, Scoring, Submissions
- **`questionService`**:
  - `createQuestions()` — Batch create questions with UUIDs
  - `createAnswerKeys()` — Batch create answer keys
  - `getQuestionsByQuizId()` — Fetch sorted by sort_index
  - `subscribeToQuestions()` — Real-time listener
  - `evaluateQuestion()` — Score all submissions for a question (time-based scoring: 500 + timeFraction * 500)
  - `getAnswerKeys()` — Fetch all answer keys
  - `replaceQuizContent()` — Atomic replace with rollback
- **`submissionService`**:
  - `submitAnswer()` — Write submission document with validation

### `participant.service.ts` — Participant Management
- `getAllParticipantsBulk(quizIds)` — Batch fetch across quizzes
- `getAllParticipants(quizId)` — Fetch all for a quiz
- `joinQuiz(quizId, userId, name?)` — Create participant doc
- `updateParticipant()` — Update violations, status
- `unblockParticipant()` — Reset to playing
- `markAllFinished()` — Set all students to finished
- `clearAllStudents()` — Delete all students
- `subscribeToParticipants()` — Real-time listener
- `getStudentHistory(userId)` — Collection group query for student's battle history

### `analytics.service.ts` — Analytics Computation
- `computeAnalytics()` — Pure function computing:
  - Overview stats (total quizzes, completion rate, avg score)
  - Quiz analytics per finished quiz (participants, scores, histogram, timeline, engagement)
  - Student analytics (rank history, improvement trend, participation frequency)
  - Question analytics (correct/wrong/skipped %, option distribution, common wrong answers)
- `exportAnalyticsCSV()` — CSV string export
- `exportAnalyticsHTML()` — Self-contained HTML report

### `rate-limiter.ts` — In-Memory Rate Limiting
- `SlidingWindowLimiter` class with cleanup interval
- `check(key, config)` — Returns `{ allowed, remaining, resetAt }`
- Predefined limits: LOGIN_PER_IP (5/min), LOGIN_PER_EMAIL (5/min), SIGNUP_PER_IP (5/min), AI_API_PER_USER (10/min)

---

## 14. FEATURES

### Working Features

| Feature | Status | Details |
|---|---|---|
| Firebase Auth (email/password) | ✅ | Login, signup, logout, session persistence |
| Role-based routing | ✅ | Teacher/student redirect on page access |
| Role detection via email domain | ✅ | `@staffs.com` → teacher, others → student |
| Manual quiz creation | ✅ | Form with dynamic questions, options, timers |
| AI PDF Forge (quiz gen) | ✅ | PDF upload → pdfreader extraction → Gemini → questions |
| Question review panel | ✅ | Edit, delete, regenerate individual questions |
| Question validation | ✅ | Length checks, duplicate detection, option validation |
| Room code generation | ✅ | 6-char uppercase alphanumeric |
| QR code generation | ✅ | Using `react-qr-code` |
| Waiting room | ✅ | Participant list, teacher status, copy code, QR |
| Live quiz | ✅ | Timer, answer submission, option selection |
| Malpractice detection | ✅ | Focus loss, fullscreen exit, 2 violations → blocked |
| Scoring | ✅ | Time-based scoring (500 base + up to 500 time bonus) |
| Results leaderboard | ✅ | Ranked list with scores |
| Answer review | ✅ | Per-question correct/wrong/unanswered review |
| Arena duplication | ✅ | Deep copy with rollback on failure |
| Arena deletion | ✅ | Cascading delete (all subcollections) |
| Arena reset | ✅ | Fresh start for re-run |
| CSV export | ✅ | Per-arena results CSV |
| HTML/PDF export | ✅ | Print-friendly HTML report |
| Commander dashboard | ✅ | Search, sort, filter arena library |
| Commander history | ✅ | Finished quizzes with winners |
| Student history | ✅ | Collection group query for cross-quiz history |
| Profile editing | ✅ | Name + emoji avatar |
| Rate limiting | ✅ | Per-endpoint sliding window (login, signup, AI) |
| Firestore Security Rules | ✅ | Role-based access at document level |
| Analytics | ✅ | Overview, quiz, student, question analytics |
| Analytics export | ✅ | CSV + HTML report generation |
| AI Knowledge Engine | ✅ | Gemini-powered quiz summary |
| AI Prediction Engine | ✅ | Gemini-powered engagement prediction |
| AI Decision Support | ✅ | Gemini-powered strategic advice |
| Server-side auth verification | ✅ | Firebase REST API token verification |
| Error boundaries | ✅ | Per-page + global error.tsx |
| Responsive design | ✅ | Mobile/tablet/desktop with safe-area support |
| Custom scrollbar | ✅ | CSS custom scrollbar styling |
| Loading states | ✅ | Skeleton, spinner, status messages |
| Toast notifications | ✅ | Success/error/destructive toasts |
| Standalone Docker build | ✅ | Next.js output: standalone, Dockerfile |
| Firebase hosting config | ✅ | Rewrites, caching headers, emulators |

### Placeholder / Incomplete Features
| Feature | Status | Details |
|---|---|---|
| Executive → Commanders page | ⚠️ Placeholder | "No commanders to manage yet" |
| Executive → Question Bank | ⚠️ Placeholder | "No questions have been added" |
| Executive → Requests | ⚠️ Placeholder | "No pending requests at this time" |
| Executive → Settings | ⚠️ Placeholder | "Settings are not yet available" |
| Executive → Students | ⚠️ Placeholder | "No student records to display yet" |
| genkit:dev script | ⚠️ Broken | References `src/ai/dev.ts` which doesn't exist |

---

## 15. SECURITY

### Authentication
- **Client**: Firebase Auth (email/password) with `onAuthStateChanged` listener
- **Server**: Firebase Identity Toolkit REST API for token verification (`verify-auth.ts`)
- **No Admin SDK dependency** for token verification — uses REST API to avoid server-side env requirements

### Authorization
- **Client-side**: `ClientLayout` enforces role-based page access with redirects
- **Server-side**: `verifyFirebaseTokenWithRole()` for API routes
- **Server-side**: `verifyFirebaseToken()` for PDF generation server action
- **Firestore Rules**: Granular per-collection rules as documented in §5

### Rate Limiting
- In-memory sliding window (not persisted across server restarts)
- Pre-request check for login/signup
- Inline check for PDF forge (5/min) and AI API (10/min)

### Input Validation
- Server action PDF size: max 10MB after base64 decode
- Server action text length: min 20 chars after extraction
- Zod schemas validate all AI inputs/outputs
- `quiz-validator.ts` validates question structure client-side
- Server action validates: id length, title length, status enum, question count, creator presence

### Data Protection
- `answerKeys` subcollection: only readable by quiz creator or after quiz finishes
- `submissions` subcollection: only readable by submitter or quiz creator
- `participants` update: self only for violations_count increment (not arbitrary changes)
- Role changes blocked in Firestore rules

### Export Security
- No server-side file generation — client-side CSV/HTML only
- HTML sanitization via `escHtml()` helper

### Environment Security
- API keys stored in `.env` (gitignored)
- Service account key via env var (not committed to disk)
- `FIREBASE_SERVICE_ACCOUNT_KEY` not in `.env.example` (intentionally undocumented)

### Potential Concerns
- API key exposed in client-side Firebase config (`config.ts`) — standard Firebase practice
- Rate limiter is in-memory — resets on server restart
- No CSRF protection on API routes (mitigated by same-origin and Firebase auth)
- No Helmet/CSP headers configured in Next.js

---

## 16. RESPONSIVE DESIGN

### CSS Strategy
- TailwindCSS breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Custom `.page-container` class: `max-w-[1400px]` with responsive padding

### Mobile Support
- Safe-area insets via `env(safe-area-inset-*)` with `.safe-top`, `.safe-bottom`, `.safe-left`, `.safe-right` utilities
- `.touch-target` class: `min-height: 44px; min-width: 44px` for touch targets
- `.mobile-*` utilities: full-width, stacked layout, safe area padding, smaller text, horizontal scroll
- Fixed bottom action bars with `safe-area-inset-bottom` padding
- Responsive QR code: hidden on mobile, shown on `sm:` breakpoint
- Responsive participant display: wrap with flex

### Tablet Support
- Bootstrap from mobile layouts at `md:` breakpoint (768px)
- Two-column question grids, side-by-side layouts

### Desktop Support
- Sidebar navigation (CommanderSidebar, GladiatorSidebar, ExecutiveSidebar)
- Full analytics dashboards with charts
- Hover effects, shadow elevations

### Accessibility
- `aria-label`, `aria-live`, `aria-pressed`, `aria-busy`, `aria-selected` attributes
- Skip-to-content link (`#main-content`)
- Proper heading hierarchy
- `role="alert"` for error states
- TabIndex on skip link
- Screen reader support for timers (`aria-live="polite"`, `aria-atomic="true"`)

---

## 17. PERFORMANCE

### Caching
- **Firebase Hosting**: 1-year immutable cache for static assets, `must-revalidate` for HTML
- **Firestore**: No client-side caching — realtime subscriptions always hit the server

### Realtime Subscriptions
- `subscribeToQuiz(roomCode)` — quiz status changes
- `subscribeToParticipants(roomCode)` — participant list updates
- `subscribeToQuestions(roomCode)` — question list updates
- All subscriptions cleaned up on unmount (proper `useEffect` returns)
- Debounced reconnection in `WaitingRoom` (3s timeout)

### Optimizations
- **Dynamic imports** (`next/dynamic`): `LoginForm`, `AnalyticsDashboard`, `PDFQuizGenerator`, `QuestionReviewPanel`, `QuizCreatorForm` — all SSR-disabled
- **`useMemo`**: Computed values in `LiveQuiz` (currentQuestion, ranked participants), `CommanderDashboard` (filtered/sorted quizzes), `QuizResults` (stats, ranked participants)
- **`useCallback`**: Event handlers to prevent re-creation
- **`useRef`**: Flags to prevent double-execution (`advancingRef`, `submittingRef`, `autoJoinTriggered`)
- **Batch writes**: `evaluateQuestion` chunks participant updates into batches of 100
- **`Promise.allSettled`**: Used in delete/clear operations for parallel subcollection deletion
- **Rollback pattern**: `duplicateQuiz` and `replaceQuizContent` track created docs and delete on failure

### Memory Management
- Subscription cleanup on unmount (all `useEffect` returns)
- `useRef` for `unsubRef` (subscription handle)
- Interval cleanup for timer and status rotation
- Periodic cleanup of stale rate limiter entries (every 60s)

### Lazy Loading
- Components: dynamic imports with `Suspense` and fallback skeletons
- Fonts: Google Fonts (Inter, Space Grotesk) loaded via `next/font` with CSS variables

---

## 18. DEPENDENCIES

### Production Dependencies (31 packages)
| Package | Version | Status |
|---|---|---|
| `@genkit-ai/googleai` | ^1.0.0 | ✅ Used |
| `@hookform/resolvers` | ^4.1.3 | ✅ Used (QuizEditor) |
| `@radix-ui/*` (18 packages) | various | ✅ Used (shadcn/ui primitives) |
| `class-variance-authority` | ^0.7.1 | ✅ Used (shadcn/ui) |
| `clsx` | ^2.1.1 | ✅ Used (utils) |
| `firebase` | ^11.9.1 | ✅ Used |
| `firebase-admin` | ^14.1.0 | ✅ Used (AI engines) |
| `genkit` | ^1.0.0 | ✅ Used |
| `lucide-react` | ^0.475.0 | ✅ Used |
| `next` | ^15.5.9 | ✅ |
| `pdfreader` | ^3.0.8 | ✅ Used (PDF extraction) |
| `react` / `react-dom` | ^19.2.1 | ✅ |
| `react-hook-form` | ^7.54.2 | ✅ Used (QuizEditor) |
| `react-qr-code` | ^2.0.12 | ✅ Used (WaitingRoom) |
| `recharts` | ^3.9.2 | ✅ Used (analytics charts) |
| `tailwind-merge` | ^3.0.1 | ✅ Used (utils) |
| `tailwindcss-animate` | ^1.0.7 | ✅ Used (tailwind config) |
| `uuid` | ^9.0.1 | ✅ Used |
| `zod` | ^3.24.2 | ✅ Used |

### Dev Dependencies (8 packages)
| Package | Version | Status |
|---|---|---|
| `@types/node` | ^20 | ✅ |
| `@types/react` | ^19.2.1 | ✅ |
| `@types/react-dom` | ^19.2.1 | ✅ |
| `@types/uuid` | ^9.0.8 | ✅ |
| `cross-env` | ^7.0.3 | ✅ Used (build script) |
| `genkit-cli` | ^1.0.0 | ⚠️ Partially broken (dev.ts missing) |
| `postcss` | ^8 | ✅ |
| `tailwindcss` | ^3.4.1 | ✅ |
| `typescript` | ^5.9.3 | ✅ |

### Build Warnings
- OpenTelemetry instrumentation: "Critical dependency: the request of a dependency is an expression"
- `@opentelemetry/exporter-jaeger`: "Module not found"
  - These come from Genkit/OpenTelemetry transitive dependencies and are non-blocking

### Unused / Deprecated
- No packages are unused in the current codebase
- `pdf-parse` was removed and replaced with `pdfreader`

---

## 19. KNOWN LIMITATIONS

### Confirmed Limitations

1. **Gemini API quota**: Free tier has strict rate limits. The fallback chain mitigates but cannot overcome account-level quota exhaustion.

2. **Executive placeholder pages**: 6 of 7 executive pages are empty placeholders (Commanders, Question Bank, Requests, Settings, Students, and Analytics is identical to Dashboard).

3. **genkit:dev script broken**: References `src/ai/dev.ts` which doesn't exist. The `genkit:dev` and `genkit:watch` package scripts will fail.

4. **Rate limiter is in-memory**: Resets on server restart. Not suitable for production with multiple instances.

5. **No persistent analytics storage**: Analytics are computed ad-hoc from Firestore data each time, no caching or aggregation.

6. **No WebSocket/real-time connection management**: Firestore SDK handles reconnection internally via long-polling.

7. **Scoring based on first submission timer**: `evaluateQuestion` uses `question_start_at` as base, but all submissions are scored relative to this single timer, not per-user elapsed time.

8. **No test suite**: No unit, integration, or E2E tests exist.

9. **No ESLint or Prettier**: Linting is disabled in build (`ignoreDuringBuilds: true`); no code formatting standard.

10. **Duplicate `executive/analytics` and `executive/dashboard`**: Both render the same `AnalyticsDashboard` component.

---

## 20. DEPLOYMENT

### Docker Build (Primary)
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME="0.0.0.0"
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK ... CMD wget ...
CMD ["node", "server.js"]
```

### Firebase Hosting (Alternative)
- Configured in `firebase.json` with rewrites to `/index.html`
- Caching headers for static assets (1 year immutable)
- Can be deployed via Firebase CLI

### Required Environment Variables
| Variable | Required | Source |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Google AI Studio |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | For Admin SDK features | Firebase Console → Service Accounts |
| `NEXT_PUBLIC_TEACHER_DOMAIN` | Optional (default: `@staffs.com`) | Custom teacher email domain |

### Build Output
- `next build` with `output: 'standalone'` produces `.next/standalone/`
- Docker image ~200MB (Node 22 Alpine)

### Free-tier Limitations
- Gemini API: free tier has rate limits (60 requests per minute for Flash, 10 for Pro)
- Firebase: Spark plan includes Firestore (1GB stored, 10GB/month download, 50K reads/day, 20K writes/day)
- Firebase Auth: 50K monthly active users on Spark

---

## 21. CODE QUALITY

### Dead Code / Unused Files
- `src/ai/dev.ts` — Does not exist, referenced by package.json scripts
- `executive/analytics/page.tsx` — Identical to `executive/dashboard/page.tsx`
- `executive/commanders`, `question-bank`, `requests`, `settings`, `students` — All empty placeholders
- `components.json` — shadcn/ui configuration (not used at runtime)
- `storage.rules` — All access denied, no storage used

### Duplicate Components
- `CommanderSidebar.tsx`, `GladiatorSidebar.tsx`, `ExecutiveSidebar.tsx` — Similar structure, different nav items
- Could be refactored into a single sidebar with role-based items

### Technical Debt
- Unused imports: `useAuth` imported but not used in `LiveQuiz.tsx` (line 11: `import { useAuth } from '@/hooks/useAuth';`)
- Unused type export `generateQuizFromPDF` patterns: `GenerateQuizFromPDFInput` and `GenerateQuizFromPDFOutput` types are exported but importers use inferred types
- `analytics.service.ts` imports types from `@/lib/schemas` but re-defines local `QuestionDoc`, `AnswerKeyDoc`, `SubmissionDoc` interfaces
- Hardcoded `GOOGLE_GENERATIVE_AI_API_KEY` example in `PDFQuizGenerator.tsx` component (line 159)
- Multiple `import` patterns used inconsistently (static, dynamic, `require()`)
- `FirebaseErrorListener` re-throws permission errors via `throw error` in a `useEffect`, which could cause unexpected crashes

### Deprecated Patterns
- `require('pdfreader')` used in `debug-pdf/route.ts` instead of ESM `import`
- `var` used in `pdfreader` CJS output (not project code)
- `sessionStorage` direct manipulation for blocked state (fragile)
- `window.open()` for PDF export without popup handling

---

## 22. FINAL PROJECT HEALTH REPORT

### Project Maturity: **Beta / Feature-Complete**

```
Architecture Quality:      ████████░░  8/10
Code Quality:              ███████░░░  7/10
Security Rating:           ████████░░  8/10
Performance Rating:        ████████░░  8/10
Maintainability Rating:    ███████░░░  7/10
Test Coverage:             ░░░░░░░░░░  0/10
Documentation:             ██████░░░░  6/10
UI/UX Quality:             █████████░  9/10
Mobile Readiness:          ████████░░  8/10
Production Readiness:      ███████░░░  7/10
```

### Critical Issues
1. **No test suite** — zero test files exist
2. **Lint disabled in build** — `eslint.ignoreDuringBuilds: true`
3. **genkit:dev script broken** — references nonexistent file

### Medium Issues
1. **Executive placeholders** — 6 of 7 pages are empty stubs
2. **In-memory rate limiter** — not suitable for multi-instance deployment
3. **Duplicate analytics pages** — `/executive/dashboard` and `/executive/analytics` are identical
4. **Missing FIREBASE_SERVICE_ACCOUNT_KEY** in `.env.example`

### Low Priority Improvements
1. Add ESLint + Prettier configuration
2. Add CSP/security headers to Next.js config
3. Refactor duplicate sidebar components
4. Add loading skeletons to all async operations
5. Implement analytics caching/aggregation
6. Add pagination to large history queries
7. Use persistent rate limiting (Redis or Firestore-based)
8. Remove unused imports and hardcoded values
9. Add error monitoring integration
10. Create `.env.example` with all required variables documented

### Production Readiness Summary
The application is **functionally complete** for the core teacher-student quiz workflow. The AI Forge (PDF → questions), live battle system, scoring, results, and analytics all work end-to-end. Executive placeholder pages are the most visible gap. The application is deployable via Docker with standalone output. The missing test suite and disabled linting are the primary quality concerns for production. Firestore security rules are well-structured. The codebase is clean and follows Next.js 15 + React 19 conventions.
