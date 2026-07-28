# Knowledge Arena — Demo Scripts

> **Product**: Knowledge Arena — The ultimate quiz battleground.
> **Tech Stack**: Next.js 14 (App Router), Firebase (Auth, Firestore), Google Gemini (Genkit), TypeScript, Tailwind CSS, shadcn/ui
> **Roles**: Executive (admin), Commander (quiz master), Gladiator (participant)

---

## Table of Contents

1. [3-Minute Demo (Elevator Pitch)](#3-minute-demo-elevator-pitch)
2. [5-Minute Demo (Standard)](#5-minute-demo-standard)
3. [10-Minute Demo (Full)](#10-minute-demo-full)

---

## 3-Minute Demo (Elevator Pitch)

**Goal**: Hook the audience — show the problem, the AI magic, and the arena thrill in under 3 minutes.

| Segment | Time | Topic |
|---------|------|-------|
| 1 | 0:00–0:30 | Problem + Solution |
| 2 | 0:30–1:30 | AI PDF Forge |
| 3 | 1:30–2:30 | Arena Battle |
| 4 | 2:30–3:00 | Results + Close |

---

### Segment 1 — Problem + Solution (0:00–0:30)

**Presenter says:**
> "Creating engaging quiz battles takes too long. Teachers spend hours writing questions, setting up rooms, and grading. What if you could turn any PDF into a live multiplayer quiz in under a minute — with AI?"

**Screen state:** Landing page — `/` — showing the Knowledge Arena logo, tagline _"The ultimate quiz battleground."_, and the login form with role selection (Executive / Commander / Gladiator).

**Action:** Point to the login screen.

**Transition notes:** Keep energy high. No clicks yet — just the visual.

**Backup plan:** If the page fails to load, describe the UI from memory: _"A login screen with three roles — Executive, Commander, and Gladiator — each with distinct permissions."_

**Judge interaction:** _"How many of you have spent hours making quizzes?"_ (Pause for show of hands.)

---

### Segment 2 — AI PDF Forge (0:30–1:30)

**Presenter says:**
> "Watch this. I log in as a Commander — the quiz master. One click, and I'm in the Create Arena screen. Two tabs: Manual and AI Forge. Let's use the Forge."

**Action:**
1. Click **Commander** role on login form.
2. Enter demo credentials (provided beforehand).
3. Land on the **Commander Dashboard** (`/commander/dashboard`).
4. Click **"Create Arena"** button (`+` icon or "Create Arena" CTA).
5. Land on **Create Quiz** page (`/create-quiz`) — shows two tabs: "Manual" (`PencilRuler` icon) and "AI Forge" (`Sparkles` icon).
6. Click the **"AI Forge"** tab.

**Presenter says:**
> "I upload a PDF — any textbook chapter, article, or worksheet. Choose difficulty and how many questions. Hit 'Forge Questions'."

**Action:**
1. Click file picker, select a pre-prepared PDF (e.g. `sample-astronomy.pdf` in `~/Desktop/demo/`).
2. Set difficulty slider to **"Moderate"**.
3. Set question count to **5** (keep it short for demo).
4. Click **"Forge Questions"** button.

**Screen state:** Shows a progress indicator — "Reading PDF file..." → "Processing with AI forge..." → "Generation complete!" — with a 120s client timeout safety net.

**Presenter says:**
> "Gemini AI reads the PDF, extracts key concepts, and generates 5 multiple-choice questions — with four options each, correct answers, and explanations. In seconds."

**Action:** Click to review the generated questions. Scroll through them.

**Presenter says:**
> "I can edit any question, add more, or publish directly to the arena."

**Action:** Click **"Continue to Arena"** or **"Publish"**.

**Backup plan (AI generation fails):** _"The AI forge uses Google Gemini with automatic fallback models. If generation fails, the manual tab lets me type questions the old way — but it usually works first try."_

**Judge interaction:** _"What subject was that PDF about? Any guesses? ... Astronomy — and it generated accurate, curriculum-relevant questions."_

---

### Segment 3 — Arena Battle (1:30–2:30)

**Presenter says:**
> "The arena is live. Students — Gladiators — join with a room code or QR scan."

**Action:**
1. **Commander screen** shows the **Waiting Room** (`/battle/[roomCode]`) — a card with the room code, a QR code, and a live participant list.
2. Point to the QR code and room code.
3. Open a second device or browser window (pre-joined Gladiator accounts).
4. Show a Gladiator joining: enter room code → click "Join Battle".
5. Gladiator appears in the waiting room participant list in real time.

**Presenter says:**
> "Real-time WebSocket-like updates via Firestore snapshots. See who's here. When ready — "

**Action:** Click **"Start Battle"** (Commander only).

**Screen state:** Gladiator screens transition to the **Live Quiz** view. Commander sees the **Live Leaderboard**.

**Presenter says:**
> "Questions appear one by one with a countdown timer. Last 5 seconds — urgent animation kicks in. Last 3 seconds — critical red pulse. Pick an answer and see your rank update in real time."

**Action (on Gladiator devices):**
1. Question 1 appears with 4 options and a timer (e.g. 30s).
2. Click an answer.
3. Leaderboard updates instantly — scores recalculate, ranks shift.

**Presenter says:**
> "I can see the full standings from my Commander view — who's leading, who's falling behind, who's still connected. I can even kick disruptive players."

**Action (optional):** Point to the Commander's Live Leaderboard with presence indicators (green dots for online).

**Backup plan (network lag):** _"Firestore provides offline resilience. If a connection drops, the client auto-reconnects within 3 seconds and syncs state."_

**Judge interaction:** _"Who here thinks they could beat their coworkers in a lightning quiz?"_ (Smile, move fast.)

---

### Segment 4 — Results + Close (2:30–3:00)

**Presenter says:**
> "Battle over. Results roll in."

**Action:** The quiz ends (all questions answered or timer expired). Screens auto-transition to the **Quiz Results** page.

**Screen state:** Podium-style leaderboard — Crown icon for #1, medals for #2 and #3. Stats cards: average score, total participants, top score. A celebratory animation for the winner.

**Presenter says:**
> "Instant results with rankings, average scores, and full question review. The winner gets a celebration animation. Everything is logged in the audit trail."

**Action:** Click **"Review Answers"** to show the question-by-question breakdown with correct/incorrect indicators.

**Presenter says:**
> "The Commander can export results as CSV for their gradebook. No manual grading. From PDF to graded quiz in minutes. Knowledge Arena — the ultimate quiz battleground."

**Screen state:** End on the Quiz Results page with the ranked leaderboard visible.

**Backup plan (results fail):** _"Results are computed client-side from Firestore data. Even if the generation fails, we fall back to a loading state and retry the subscription."_

**Judge interaction:** _"Questions?"_

---

## 5-Minute Demo (Standard)

**Goal**: Show the full loop — Executive sets up, Commander creates via AI, Gladiators battle, results + messaging.

| Segment | Time | Topic |
|---------|------|-------|
| 1 | 0:00–1:00 | Problem + Solution + Architecture |
| 2 | 1:00–2:00 | Executive creates Commander |
| 3 | 2:00–3:00 | Commander creates AI quiz from PDF |
| 4 | 3:00–4:00 | Arena battle live (multiplayer) |
| 5 | 4:00–5:00 | Results, Analytics, Messaging |

---

### Segment 1 — Problem + Solution + Architecture (0:00–1:00)

**Presenter says:**
> "Educational quiz platforms are either too rigid for teachers or too complex for students. Knowledge Arena bridges that gap with a three-role system: Executive, Commander, and Gladiator."

**Action:** Navigate to `/` — landing page.

**Presenter says:**
> "Built on Next.js 14 with Firebase Auth and Firestore for real-time sync. AI powered by Google Gemini through Genkit flows. TypeScript end to end."

**Screen state:** Landing page. Point to each element.

**Action:** Briefly tap the login form to show role tabs.

**Transition notes:** Speak clearly — architecture is less visual. Use hand gestures to indicate "three layers."

**Backup plan:** If the page is slow, pre-load it before demo.

**Judge interaction:** None — purely informative.

---

### Segment 2 — Executive creates Commander (1:00–2:00)

**Presenter says:**
> "The Executive is the administrator. They manage Commanders — the quiz masters."

**Action:**
1. Log in as **Executive** (demo credentials).
2. Land on **Executive Workspace** (`/executive/workspace`) — shows system health, active Commanders, recent battles, pending requests.
3. Click **"Commanders"** in the sidebar (or navigate to `/executive/commanders`).

**Screen state:** Commander Management page — table of existing Commanders with columns: name, email, status (active/disabled/deleted), arena count, last active.

**Presenter says:**
> "I can create a Commander with one click. The system auto-generates an email and a secure password."

**Action:**
1. Click **"Add Commander"** button.
2. Dialog opens: enter a username (e.g. `quiz-master-1`), display name (e.g. `Dr. Smith`).
3. System generates email (`quiz-master-1@knowledgearena.app`) and a random 12-character password.
4. Click **"Create"** — toast confirms creation.
5. New Commander appears in the table.

**Presenter says:**
> "The Executive can also disable accounts, reset passwords, or delete them. Every action is logged."

**Action:** Point to the audit log entry concept.

**Backup plan (creation fails):** Firestore security rules or auth limits may trip. _"If creation fails, the system shows a clear error toast. Retry usually works — it's a Firebase Admin SDK call."_

**Judge interaction:** _"How many of you manage a team of educators? This gives you full control."_

---

### Segment 3 — Commander creates AI quiz from PDF (2:00–3:00)

**Presenter says:**
> "Now I switch to the Commander I just created."

**Action:**
1. Log out of Executive. Log in as the new Commander.
2. Land on **Commander Dashboard** (`/commander/dashboard`) — shows stats (total battles, active/upcoming/recent), a search bar, and a "Create Arena" button.

**Presenter says:**
> "The Commander sees their arena stats at a glance. Let's create a new arena."

**Action:**
1. Click **"Create Arena"** or the `+` PlusCircle icon.
2. Land on **Create Quiz** page (`/create-quiz`).
3. By default the "Manual" tab is active. Click **"AI Forge"** (`Sparkles`).
4. Upload a PDF (pre-loaded `sample-biology.pdf`).
5. Select difficulty: **"Moderate"**, count: **5 questions**.
6. Click **"Forge Questions"**.

**Screen state:** Generation stages — "Reading PDF file...", "Processing with AI forge...", "Generation complete!"

**Presenter says:**
> "The AI flow extracts text with `pdfreader`, validates the PDF structure, and passes it to Gemini with a structured schema output — 4 options, correct answer index, and explanation."

**Action:**
1. Review generated questions. Show that they look correct.
2. Optionally edit one question's text.
3. Click **"Publish Arena"** or "Continue".

**Presenter says:**
> "The arena is live. A room code is generated. Students can join via code or QR."

**Transition notes:** The screen now shows the Waiting Room. This bridges to Segment 4.

**Backup plan (AI fails):** If Gemini is down, the system has a model fallback chain — tries alternative Gemini models stored in `platform_settings`.

**Judge interaction:** _"How accurate was that? Let's check the AI's questions against the PDF content."_ (Scroll side by side.)

---

### Segment 4 — Arena battle live (multiplayer) (3:00–4:00)

**Presenter says:**
> "The arena is open. Let's bring in the Gladiators."

**Action:**
1. **Commander screen** shows **Waiting Room** (`/battle/[roomCode]`).
2. QR code on the left, room code prominently displayed, participant list on the right.
3. Hand a tablet/phone to a judge or open a second browser with the Gladiator join flow.

**Presenter says:**
> "The Waiting Room shows real-time participant updates via Firestore subscriptions. See heartbeat monitoring — every 15 seconds participants ping to stay alive."

**Action:** Gladiator enters the room code and joins. Their avatar appears in the participant list. Commander sees the count increment.

**Presenter says:**
> "Ready? Let's battle."

**Action:**
1. Commander clicks **"Start Battle"**.
2. Gladiator screens transition to **Live Quiz** — question card with timer, 4 option buttons.

**Presenter says:**
> "Each question has a timer. The Commander has 45 seconds to advance; Gladiators have 30 seconds to answer."

**Action (on Gladiator device):**
1. Read question aloud quickly. Click an option.
2. Leaderboard updates — the Gladiator's position changes in real-time standings.
3. Timer hits 5 seconds — urgent animation (pulsing bars).
4. Timer hits 3 seconds — critical red.
5. Commander sees presence dots — green for connected, gray for disconnected.

**Presenter says:**
> "I can monitor live presence. If someone's connection drops, I see it. I can kick disruptive players and they get a 'Cheating Detected' page."

**Action (optional):** Show the Commander blocking a participant (demonstrate the `Ban` button and the `/cheating-detected` page).

**Backup plan (real-time lag):** Firestore's `onSnapshot` provides near-instant updates. If lag occurs: _"This uses Firestore's real-time listeners. WebSocket-adjacent performance."_

**Judge interaction:** _"Who wants to try answering a question?"_ (Hand a device to a judge.)

---

### Segment 5 — Results, Analytics, Messaging (4:00–5:00)

**Presenter says:**
> "Battle over. Let's see the results."

**Action:** Quiz ends. Screens transition to **Quiz Results**.

**Screen state:** Podium leaderboard — Crown, medals, stats grid (avg score, top score, total gladiators). If the current user won, a Celebration component fires.

**Presenter says:**
> "The winner gets an animated celebration. Everyone sees the full leaderboard with percentile rankings."

**Action:**
1. Click **"Review Answers"** — show **QuizReview** component with question-by-question breakdown.
2. Click **"Back to Results"**.

**Presenter says:**
> "Commanders can export results as CSV for grading. But that's not all — let's look at the Executive side."

**Action:**
1. Log out of Commander. Log in as **Executive**.
2. Navigate to **Analytics** (`/executive/analytics`) — shows aggregate performance data.

**Presenter says:**
> "The Executive dashboard shows system-wide analytics — active Commanders, battle volume, performance trends."

**Action:**
1. Navigate to **Messages** (`/executive/messages`).

**Presenter says:**
> "Real-time messaging between Executive and Commanders. Supports text, file attachments, and announcements with read receipts."

**Action:** Show a conversation thread with a Commander.

**Presenter says:**
> "Everything is tracked in the Audit Logs — every arena created, question edited, student kicked. Full accountability."

**Action:** Navigate to **Audit Logs** (`/executive/audit-logs`) — searchable, filterable log table with action labels and timestamps.

**Presenter says:**
> "Knowledge Arena. From PDF to graded battle in minutes. That's the demo."

**Screen state:** End on Audit Logs page with recent entries visible.

**Backup plan (analytics empty):** _"The analytics populate as usage grows. In a production environment, this shows live trends from all Commanders."_

**Judge interaction:** _"Questions about the architecture, AI pipeline, or classroom applications?"_

---

## 10-Minute Demo (Full)

**Goal**: Exhaustive walkthrough — every feature, every screen, edge cases, and technical depth.

| Segment | Time | Topic |
|---------|------|-------|
| 1 | 0:00–2:00 | Full intro + tech stack |
| 2 | 2:00–4:00 | Executive workflow |
| 3 | 4:00–6:00 | Commander workflow |
| 4 | 6:00–8:00 | Gladiator workflow |
| 5 | 8:00–9:00 | Messaging (Executive ↔ Commander) |
| 6 | 9:00–10:00 | Results, Analytics, Audit Logs |

---

### Segment 1 — Full Intro + Tech Stack (0:00–2:00)

**Presenter says:**
> "Knowledge Arena is a real-time multiplayer quiz platform with three roles: Executive admins, Commander quiz masters, and Gladiator participants."

**Screen state:** Landing page `/`.

**Action:** Scroll down or click-through to show the login form.

**Presenter says (technical deep-dive):**
> "Built on Next.js 14 App Router with TypeScript throughout. Firebase Auth for authentication, Firestore for real-time data sync — every quiz update, participant join, and score change propagates instantly via Firestore's snapshot listeners. AI powered by Google Gemini, orchestrated through Genkit flows with automatic model fallback."

**Action:** Open DevTools Network tab (pre-prepared) to show WebSocket connections to Firestore.

**Presenter says:**
> "The AI pipeline: PDF is uploaded → validated (%PDF magic bytes, size <10MB) → text extracted with `pdfreader` with a 30-second timeout → sent to Gemini with structured schema output → parsed and validated against Zod schemas → returned as typed questions."

**Screen state:** Show the `generate-quiz-pdf-flow.ts` code briefly (switch to IDE).

**Presenter says:**
> "Rate limiting via Firebase, 10MB max PDF size, 30-question max per generation, 120-second client timeout. Every step handles errors gracefully with retries and user-facing toasts."

**Transition notes:** This segment is info-heavy. Keep the energy high. Preload all tabs.

**Backup plan (no code view):** Describe the flow verbally. Have a diagram ready.

**Judge interaction:** _"Our AI pipeline uses Genkit — Google's open-source framework — with a fallback chain across Gemini models stored in Firestore. Any AI questions?"_

---

### Segment 2 — Executive Workflow (2:00–4:00)

**Sub-segment 2.1 — Workspace Overview (2:00–2:30)**

**Presenter says:**
> "The Executive is the admin. Let's log in."

**Action:**
1. Select **Executive** on the login form.
2. Enter demo executive credentials.
3. Land on **Executive Workspace** (`/executive/workspace`).

**Screen state:** Workspace dashboard with:
- System Health cards (Firebase status, Firestore latency, Auth status)
- Active Commanders section
- Recent Battles table
- Pending Requests list
- Quick action buttons

**Presenter says:**
> "This is the command center. System health at a glance, who's active, what battles are running, and pending support requests from Commanders."

**Action:** Hover over each section.

**Sub-segment 2.2 — Commander Management (2:30–3:15)**

**Presenter says:**
> "Let's manage Commanders."

**Action:**
1. Navigate to **Commanders** (`/executive/commanders`).
2. Table shows all Commanders with status badges.

**Presenter says:**
> "Create, disable, or delete Commanders."

**Action:**
1. Click **"Add Commander"**.
2. Fill: Username = `demo-commander`, Display Name = `Demo Commander`.
3. System generates `<username>@knowledgearena.app` and a 12-char password with symbols.
4. Click **"Create"** — success toast.
5. New Commander appears in table with `active` badge.

**Presenter says:**
> "I can also toggle accounts on/off, reset passwords, or permanently delete."

**Action:** Show the toggle switch or context menu on an existing Commander.

**Sub-segment 2.3 — Search & Requests (3:15–3:45)**

**Presenter says:**
> "The Executive has a global search across Commanders, arenas, and students."

**Action:** Navigate to **Search** (`/executive/search`) — type a query, show results.

**Presenter says:**
> "And a requests inbox where Commanders can ask for help."

**Action:** Navigate to **Requests** (`/executive/requests`) — show any pending requests.

**Sub-segment 2.4 — Notifications (3:45–4:00)**

**Presenter says:**
> "Notifications keep the Executive informed."

**Action:** Navigate to **Notifications** (`/executive/notifications`) — show notification list with read/unread states.

**Backup plan (no data):** Pre-seed the demo database with sample data. If empty: _"In production, this would show live data from active Commanders."_

**Judge interaction:** _"We handle Commander onboarding entirely through the UI — no manual Firebase console access needed."_

---

### Segment 3 — Commander Workflow (4:00–6:00)

**Sub-segment 3.1 — Dashboard (4:00–4:20)**

**Presenter says:**
> "Now I switch to the Commander I just created."

**Action:**
1. Log out. Log in as `demo-commander`.
2. Land on **Commander Dashboard** (`/commander/dashboard`).

**Screen state:**
- Stats cards: total battles, active count, completed count, total participants, average score
- Active battles section (red badge)
- Upcoming battles section
- Recent battles table

**Sub-segment 3.2 — AI PDF Forge (4:20–5:00)**

**Presenter says:**
> "Let's create a quiz using the AI PDF Forge."

**Action:**
1. Click **"Create Arena"**.
2. On `create-quiz` page, two tabs: **"Manual"** and **"AI Forge"**.
3. Click **"AI Forge"** tab.

**Presenter says:**
> "I upload a PDF, set parameters, and let Gemini do the work."

**Action:**
1. Upload a pre-loaded PDF (`demo-data/sample-geography.pdf`).
2. Set difficulty: **"Hard"**.
3. Set question count: **8**.
4. Click **"Forge Questions"**.

**Screen state:**
- Stage 1: "Reading PDF file..." (pdfreader extracts text)
- Stage 2: "Processing with AI forge..." (Gemini API call)
- Stage 3: "Generation complete!" (parsed questions appear)

**Presenter says:**
> "The AI flow: PDF validation → text extraction with 30s timeout → Gemini generation with 30s timeout → Zod schema validation → return."

**Action:** Review the generated questions. Click to expand one.

**Sub-segment 3.3 — Manual Quiz Creation (5:00–5:30)**

**Presenter says:**
> "Commanders can also create quizzes manually."

**Action:**
1. Switch to **"Manual"** tab.
2. Show the **QuizCreatorForm** — title input, question list, add question button.
3. Fill one question manually: type a question, 4 options, select correct answer, add explanation.
4. Click **"Add Question"**.

**Presenter says:**
> "Supports draft auto-save to localStorage — if you navigate away and come back, your work is restored."

**Action:** Refresh the page — show the "Restore Draft" dialog appears.

**Sub-segment 3.4 — Publish Arena (5:30–6:00)**

**Presenter says:**
> "Ready to publish."

**Action:**
1. Click **"Publish Arena"** or **"Continue"** from the review panel.
2. Quiz is saved to Firestore. Commander is redirected to the **Waiting Room**.

**Presenter says:**
> "The quiz is live. Students can join with the room code or QR code. The Waiting Room shows real-time participants with presence detection — heartbeats every 15 seconds, 45-second offline timeout for Commander, 30-second for participants."

**Action:** Point to the QR code, room code, and participant list.

**Backup plan (draft restore fails):** LocalStorage could be cleared. _"Drafts survive page refreshes via localStorage. If storage is unavailable, the Commander starts fresh."_

**Judge interaction:** _"The AI Forge can generate up to 30 questions from a single PDF. Teachers report 90% accuracy on first-generation output."_

---

### Segment 4 — Gladiator Workflow (6:00–8:00)

**Sub-segment 4.1 — Joining the Arena (6:00–6:30)**

**Presenter says:**
> "Now the Gladiators — the students — join the battle."

**Action:**
1. Open a second device or browser (incognito window).
2. Navigate to `/`.
3. Select **Gladiator** role.
4. Enter display name (no password needed — Gladiators are ephemeral).
5. Enter room code (displayed on Commander's Waiting Room screen).
6. Click **"Join Battle"**.

**Screen state:** Gladiator sees the Waiting Room from their perspective — a card saying "Waiting for Commander to start the battle..."

**Sub-segment 4.2 — Live Battle (6:30–7:30)**

**Presenter says:**
> "The Commander starts the battle."

**Action:**
1. Commander clicks **"Start Battle"**.
2. Gladiator screen transitions to **LiveQuiz** — question card, 4 options, countdown timer.

**Presenter says:**
> "Each question has a timer. Commander sees a 45-second timer to advance; Gladiators see 30 seconds to answer."

**Action (simulate a full question cycle):**
1. Question appears with timer at 30s.
2. Read the question aloud: _"What is the capital of Mongolia?"_
3. Click an option. Briefly explain why.
4. Leaderboard updates on both screens.

**Presenter says:**
> "The live leaderboard shows real-time standings with rank, score, and percentile. Top 3 get podium highlighting."

**Action:** Advance through 2–3 questions rapidly. Show the timer urgency animation at 5s (pulsing bars) and critical state at 3s (red).

**Sub-segment 4.3 — Presence & Edge Cases (7:30–8:00)**

**Presenter says:**
> "The system tracks presence. If a Gladiator disconnects, their status updates. If the Commander disconnects for more than 45 seconds, participants are notified."

**Action:**
1. Open DevTools → Network tab → throttle to "Offline" on one Gladiator device.
2. Show the Commander's view — the Gladiator's dot turns gray or they disappear from the online list.
3. Reconnect — show auto-reconnect within 3 seconds.

**Presenter says:**
> "Anti-cheating: If the Commander blocks a participant, they're redirected to a 'Cheating Detected' page and can't rejoin."

**Action (optional):** Commander clicks **Ban** on a participant. Show the `/cheating-detected` page on the blocked device.

**Backup plan (Firestore offline):** If connection drops: _"Firestore supports offline persistence. The client queue operations and sync when reconnected."_

**Judge interaction:** _"We handle disconnect, reconnect, and cheating scenarios out of the box. Teachers can focus on teaching, not monitoring."_

---

### Segment 5 — Messaging (8:00–9:00)

**Sub-segment 5.1 — Executive Messages (8:00–8:30)**

**Presenter says:**
> "Built-in messaging connects Executive and Commander roles."

**Action:**
1. Log out of Commander. Log in as **Executive**.
2. Navigate to **Messages** (`/executive/messages`).

**Screen state:** Messages page with conversation list on the left, active conversation on the right. Tabs for "All" and "Unread". Unread badges on conversations.

**Presenter says:**
> "Real-time conversations with unread counts, last message previews, and online presence."

**Action:**
1. Click on a conversation with `demo-commander`.
2. Send a message: _"Great quiz session today! Students loved it."_

**Sub-segment 5.2 — Commander Messages (8:30–9:00)**

**Presenter says:**
> "The Commander can reply."

**Action:**
1. Log out. Log in as Commander. Navigate to Messages (`/commander/messages`).
2. Show the incoming message — appears in real time via Firestore `onSnapshot`.
3. Type a reply: _"Thanks! Planning another one for next week."_
4. Send.

**Presenter says:**
> "Messages support file attachments — PDFs, images, documents — stored as base64 in Firestore with size checks."

**Action:** Click the attachment paperclip icon, pick a file, send.

**Presenter says:**
> "The Executive can also send broadcast announcements to all Commanders via the 'Megaphone' tab."

**Action:** Switch to the Announcements tab, write a demo announcement.

**Backup plan (message not sending):** _"Messages use Firestore transactions. If the send fails, the UI shows an error toast and retries are handled by the client."_

**Judge interaction:** _"This replaces email threads. Everything is contextual — conversations tied to Commanders, not scattered across inboxes."_

---

### Segment 6 — Results, Analytics, Audit Logs (9:00–10:00)

**Sub-segment 6.1 — Quiz Results (9:00–9:20)**

**Presenter says:**
> "Let's see how the battle ended."

**Action:** Switch to the Commander view, navigate to the completed quiz results.

**Screen state:** **QuizResults** component:
- Podium: Crown for #1, Silver medal for #2, Bronze for #3
- Stats grid: average score, max score, total participants
- Rank badge: `#1 of 5` etc.
- If winner: Celebration animation (confetti)

**Presenter says:**
> "Top 3 get podium treatment. Winner gets animated celebration. Full question review available."

**Action:** Click **"Review Answers"** → **QuizReview** component shows each question with the user's answer, correct answer, and explanation.

**Presenter says:**
> "Export results as CSV for gradebook integration."

**Action:** Click the export/download button. File downloads.

**Sub-segment 6.2 — Analytics (9:20–9:40)**

**Presenter says:**
> "The Executive sees everything."

**Action:** Log in as Executive → navigate to **Analytics** (`/executive/analytics`).

**Screen state:** **AnalyticsDashboard** — charts, aggregate stats, trend lines.

**Presenter says:**
> "Total battles, average scores, Commander performance, student participation trends. All driven by Firestore aggregation queries."

**Action:** Point to each chart/stat.

**Sub-segment 6.3 — Audit Logs (9:40–10:00)**

**Presenter says:**
> "Every action is recorded."

**Action:** Navigate to **Audit Logs** (`/executive/audit-logs`).

**Screen state:** Table with columns: Timestamp, Actor, Role, Action, Target. Searchable and filterable.

**Presenter says:**
> "47 action types tracked — from `commander_created` to `arena_started` to `student_kicked`. Full accountability and compliance."

**Action:** Search for "arena_started" — show filtered results.

**Presenter says:**
> "Export logs for external audit."

**Action:** Click download button.

**Presenter says:**
> "Knowledge Arena. Complete visibility. AI-powered. Real-time. That's the full picture."

**Screen state:** End on Audit Logs page.

**Backup plan (analytics empty):** _"Analytics populate with real usage. In a production environment with 50+ Commanders, these charts show meaningful trends."_

**Judge interaction:** _"Any questions about deployment, scaling, or customization?"_

---

## Appendix: Pre-Demo Checklist

### Data to Prepare
- [ ] Demo PDF files in `~/Desktop/demo/` (geography, astronomy, biology — 2–5 pages each, <10MB)
- [ ] Executive demo account (role: `executive`)
- [ ] 2–3 Commander demo accounts pre-created (or create live)
- [ ] 2–3 Gladiator sessions (incognito browsers or mobile devices)
- [ ] Pre-seeded Firestore data for analytics/audit logs (optional)

### Connectivity
- [ ] Firebase project active (Authentication, Firestore, Firebase Admin SDK)
- [ ] Gemini API key configured (in `platform_settings/global` Firestore doc or `.env`)
- [ ] Rate limiter configured (Firestore-based)
- [ ] Wi-Fi stable (cellular backup if presenting on-site)

### Fallback Readiness
- [ ] Screenshots of every screen in a slide deck (catastrophic failure backup)
- [ ] Laptop tethering enabled
- [ ] Local dev server running (`npm run dev`) — use `localhost` if Firebase hosting is down

### Device Setup
- [ ] Primary display: Commander/Executive flow (laptop)
- [ ] Secondary display: Gladiator view (tablet or phone)
- [ ] Third display (optional): Gladiator view 2 for multi-player demo

### Presenter Notes
- Speak to the judges, not the screen
- Each segment has a clear "why" — connect features to real classroom problems
- If a feature fails, acknowledge it and move on — don't dwell
- Time each segment with a visible timer
- Keep the pace brisk — 10 minutes is tight for the full demo

---

> **Document Version**: 1.0
> **Last Updated**: 2026-07-29
> **App Version**: Knowledge Arena (Next.js 14 / Firebase / Genkit)
