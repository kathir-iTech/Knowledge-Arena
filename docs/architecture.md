# Knowledge Arena — Architecture

## 1. System Architecture

High-level overview of the full stack. The Next.js App Router serves both the client UI (React Server/Client Components) and API Routes. Client components interact with Firebase Web SDK (Firestore, Auth) directly for real-time data. Admin-only operations go through API Routes which use the Firebase Admin SDK. Gemini AI is accessed via Genkit through a server action.

```mermaid
graph TB
  subgraph Client["Browser / PWA"]
    RC[React Client Components]
    RSC[React Server Components]
  end

  subgraph NextJS["Next.js 15 App Router"]
    direction TB
    AR[App Router]
    API[API Routes<br/>/api/*]
    SA[Server Actions<br/>'use server']
  end

  subgraph Firebase["Firebase Project"]
    direction TB
    FA[Firebase Auth]
    FS[Cloud Firestore]
    FST[Cloud Storage]
  end

  subgraph AI["AI Pipeline"]
    GK[Genkit]
    GM[Gemini 2.0 Flash]
  end

  subgraph Ext["External"]
    GH[GitHub]
    VCL[Vercel Deploy]
  end

  RC -- "Firebase Web SDK" --> FA
  RC -- "Firestore realtime" --> FS
  RSC --> AR
  AR --> API
  API -- "Firebase Admin SDK" --> FA
  API -- "Admin Firestore" --> FS
  SA -- "Genkit" --> GK
  GK -- "Google AI" --> GM
  GH --> VCL
  VCL --> NextJS
```

---

## 2. Authentication Flow

Login is handled client-side via Firebase Auth. The ID token is then verified server-side in API Routes and Server Actions using `verifyFirebaseToken` / `verifyFirebaseTokenWithRole`. The `ClientLayout` component enforces route-level redirection based on role and authentication state.

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Client Component
  participant FA as Firebase Auth
  participant API as API Route / Server Action
  participant FS as Firestore

  U->>FE: Enter credentials
  FE->>FA: signInWithEmailAndPassword
  FA-->>FE: ID Token
  FE->>API: Request + Bearer Token
  API->>FA: verifyIdToken(token)
  FA-->>API: Decoded token { uid, email }
  API->>FS: Read users/{uid}
  FS-->>API: User doc { role }
  API->>API: Check role === requiredRole
  API-->>FE: Authorized response / 401
  FE->>FE: ClientLayout redirects<br/>by role dashboard
```

---

## 3. Role-Based Authorization

Three roles — **Executive** (admin/analytics), **Commander** (quiz creator/host), **Gladiator** (quiz participant). Enforcement happens at three layers: Client Layout route guards, API route token+role verification, and Firestore security rules.

```mermaid
graph TD
  subgraph Roles["Roles"]
    EX[Executive]
    CM[Commander]
    GL[Gladiator]
  end

  subgraph ClientLayer["Client Layout Guard"]
    CL[ClientLayout.tsx]
    CL -->|no user| R1[Redirect to /]
    CL -->|no role| R1
    CL -->|mustChangePassword| R2[Redirect to /force-password-change]
    CL -->|executive| D1[/executive/analytics]
    CL -->|commander| D2[/commander/dashboard]
    CL -->|gladiator| D3[/gladiator/dashboard]
  end

  subgraph APILayer["API Route Guard"]
    VF[verifyFirebaseTokenWithRole]
    VF -->|decode + check role| A1[Allow / 200]
    VF -->|fail| A2[401 Unauthorized]
  end

  subgraph FSRules["Firestore Security Rules"]
    SR[Security Rules]
    SR -->|executive| RW[Read/Write all]
    SR -->|commander| QW[Read/Write own quizzes]
    SR -->|gladiator| PR[Read/Write own participant data]
  end

  EX --> CL
  CM --> CL
  GL --> CL
  EX --> VF
  CM --> VF
  GL -.->|limited| VF
  EX --> SR
  CM --> SR
  GL --> SR
```

---

## 4. Messaging Architecture

Messages are exchanged between Executives and Commanders. Firestore transactions ensure atomicity when writing a message and updating the conversation's `lastMessage` and `unreadCount`. An audit log and notification are created after the transaction succeeds.

```mermaid
sequenceDiagram
  actor S as Sender
  participant FE as Client
  participant API as API Route<br/>/api/messaging/.../messages
  participant FS as Firestore
  participant AS as Audit Service
  participant NS as Notification Service

  S->>FE: Write message
  FE->>API: POST { text, attachments }
  API->>API: verifyParticipant<br/>(auth + conversation membership)
  API->>FS: Transaction start
  FS-->>API: Conversation doc
  API->>FS: Set messages/{msgId}
  API->>FS: Update conversation:<br/>lastMessage, unreadCount, lastActivity
  API->>FS: Transaction commit
  API->>AS: auditService.record(message_sent)
  API->>NS: notificationService.create(New Message)
  AS-->>FS: Write auditLog
  NS-->>FS: Write notification
  API-->>FE: { message }
  FE->>FE: Realtime snapshot updates<br/>conversation list
```

---

## 5. AI PDF Forge Pipeline

Executives and Commanders upload a PDF. The server action extracts text using `pdfreader`, sends it to Gemini (via Genkit with model fallback and retry logic), validates the structured output, and returns questions to be saved to Firestore.

```mermaid
flowchart TD
  U[User] -->|Upload PDF| FE[Client]
  FE -->|server action| SA[generateQuizFromPDF<br/>'use server']
  SA -->|1. Auth| VF[verifyFirebaseTokenWithRole<br/>executive | commander]
  VF -->|2. Rate Limit| RL[rateLimiter.check<br/>5 req/min]
  RL -->|3. Parse PDF| PR[PdfReader.parseBuffer]
  PR -->|4. Extract text| TX[Text extraction]
  TX -->|5. Build prompt| PM[Prompt with<br/>difficulty + questionCount]
  PM -->|6. Gemini call| GM[callGeminiWithFallback<br/>Retry up to 3x<br/>Model fallback chain]
  GM -->|7. Repair JSON| RJ[repairJson<br/>Fix markdown fences<br/>& single quotes]
  RJ -->|8. Parse output| PS[tryParseQuestions]
  PS -->|9. Return| SA
  SA -->|10. Save to Firestore| FS[(Firestore<br/>quizzes/{id}/questions)]
  SA -->|11. Return| FE
  FE -->|Display| U
```

---

## 6. Quiz / Arena Flow

A Commander creates a quiz (waiting state), publishes it, gladiators join with a room code, the Commander starts the game, questions advance one-by-one, gladiators submit answers (scored with time bonus), the Commander ends the arena, results are evaluated, and a leaderboard is displayed.

```mermaid
stateDiagram-v2
  [*] --> Draft: Commander creates quiz
  Draft --> Waiting: Commander publishes (sets room code)
  Waiting --> Live: Commander starts game
  Live --> Live: Advance question<br/>Gladiators submit answers<br/>Commander advances
  Live --> Finished: Commander ends arena
  Finished --> Waiting: Commander resets (replay)
  Finished --> [*]

  state Waiting {
    [*] --> JoinPhase
    JoinPhase --> JoinPhase: Gladiators join via room code
  }

  state Live {
    [*] --> Q1: Question 1
    Q1 --> Q2: Evaluate → advance
    Q2 --> Q3: Evaluate → advance
    Q3 --> QN: Evaluate → advance
    QN --> [*]
  }

  state Finished {
    [*] --> Results: Scoring complete
    Results --> Leaderboard: Display rankings
  }
```

**Scoring formula**: For each correct answer, `score = 500 + 500 × max(0, 1 − elapsed / timeLimit)` — a time bonus up to 500 points.

---

## 7. Firestore Data Model

The primary collections and their subcollection hierarchy. All quiz-scoped data lives under `quizzes/{quizId}` subcollections.

```mermaid
erDiagram
  users {
    string uid PK
    string email
    string role "executive | commander | gladiator"
    string displayName
    boolean disabled
    boolean mustChangePassword
  }

  quizzes {
    string id PK "6-char room code"
    string title
    string status "draft | waiting | live | finished"
    number question_count
    number current_question_index
    string created_by "user uid"
    number created_at "ms timestamp"
    timestamp question_start_at
    timestamp commanderLastSeen
    boolean archived
  }

  questions {
    string id PK "uuid"
    string text
    string[4] options
    number timer "seconds"
    number sort_index
    boolean scored
  }

  answerKeys {
    string id PK "matches question id"
    number correct_option_index "0-3"
  }

  submissions {
    string id PK "user uid"
    number selected_option
    timestamp submittedAt
    number clientTime
  }

  participants {
    string id PK "user uid"
    string user_id
    number score
    string status "playing | finished | blocked"
    number violations_count
    timestamp lastSeen
    string name
  }

  conversations {
    string id PK
    string[] participants
    map unreadCount
    object lastMessage
    number lastActivity
  }

  messages {
    string id PK
    string senderId
    string senderRole
    string text
    number timestamp
    attachment[] attachments
  }

  notifications {
    string id PK
    string type
    string title
    string description
    boolean read
    number createdAt
    string userId
    string link
    map metadata
  }

  audit_logs {
    string id PK
    number timestamp
    string actor
    string actorRole
    string action
    string target
    map metadata
  }

  announcements {
    string id PK
    string title
    string content
    string createdBy
    number createdAt
  }

  executive_requests {
    string id PK
    string requesterId
    string type
    string status
    map details
    number createdAt
  }

  quizzes ||--o{ questions : has
  quizzes ||--o{ answerKeys : has
  quizzes ||--o{ participants : has
  questions ||--o{ submissions : has
  questions ||--|| answerKeys : scored_by
  conversations ||--o{ messages : contains
  users ||--o{ notifications : receives
  users ||--o{ audit_logs : performs
```

---

## 8. Notification System

Events throughout the system (new message, battle completed, commander request, etc.) trigger notification creation via the admin SDK. Notifications are stored in a top-level `notifications` collection and queried client-side to display unread counts and badge indicators.

```mermaid
flowchart LR
  subgraph Events["Triggers"]
    NM[New Message]
    BC[Battle Completed]
    CR[Commander Request]
    AI[AI Import Done]
    AN[New Announcement]
    OF[Operation Failed]
    SW[System Warning]
  end

  subgraph Service["Notification Service"]
    NC[notificationService.create]
    NG[notificationService.getAll]
    NR[notificationService.markRead]
    NU[notificationService.getUnreadCount]
  end

  subgraph Store["Firestore"]
    NF[(notifications<br/>collection)]
  end

  subgraph Client["Client Display"]
    Q[Query notifications]
    B[Badge count]
    L[Notification list]
  end

  Events -->|Event occurs| NC
  NC -->|Add document| NF
  Q -->|onSnapshot / fetch| NF
  Q --> B
  Q --> L
  L -->|User taps| NR
  NR -->|Update read=true| NF
  NF -->|Realtime update| B
```

---

## 9. Deployment Architecture

The app is deployed on Vercel (serverless functions for API routes, edge-rendered pages). Firebase hosts Auth, Firestore, and optional Storage. Static analysis (lint + typecheck) runs pre-deploy. Genkit AI runs inline in serverless functions.

```mermaid
graph LR
  subgraph Source["Source Control"]
    GH[GitHub Repository]
  end

  subgraph CI["CI Pipeline"]
    LINT[npm run lint]
    TC[npm run typecheck]
    BUILD[npm run build]
  end

  subgraph Hosting["Vercel"]
    direction TB
    FE2[Next.js SSR/SSG]
    API2[Serverless Functions<br/>API Routes]
    SA2[Server Actions]
  end

  subgraph Firebase2["Firebase"]
    direction TB
    FA2[Firebase Auth]
    FS2[Cloud Firestore]
    ST2[Cloud Storage<br/>(optional)]
  end

  subgraph AI2["AI Services"]
    GK2[Genkit Plugin]
    GM2[Gemini 2.0 Flash<br/>(Google AI)]
  end

  GH -->|Push / PR| CI
  CI -->|Deploy| FE2
  CI -->|Deploy| API2
  FE2 -->|Client SDK| FA2
  FE2 -->|Client SDK| FS2
  API2 -->|Admin SDK| FA2
  API2 -->|Admin SDK| FS2
  SA2 --> GK2
  GK2 --> GM2
```

---

**Diagram count: 9** — System Architecture, Authentication Flow, Role-Based Authorization, Messaging Architecture, AI PDF Forge Pipeline, Quiz/Arena Flow, Firestore Data Model, Notification System, Deployment Architecture.
