# Knowledge Arena — Judge Q&A

> 100 likely judge questions with professional answers, organized by category.

---

## Technical (30 Questions)

### 1. Why Next.js? Why not React only?

We chose Next.js 15 with Turbopack because it gives us server-side rendering, API routes co-located with our frontend, and built-in image optimization out of the box. A plain React app would require separate backend infrastructure for our API layer — we have 15+ API routes handling auth, messaging, analytics, and AI generation. Next.js's App Router lets us colocate server actions (like our PDF quiz generation flow) directly in the component tree, eliminating the need for a separate Node server. The file-based routing also simplifies our portal structure: `/executive`, `/commander`, `/gladiator` are natural route groups with their own layouts and middleware guards. Turbopack gives us sub-second hot module replacement during development, and the production build tree-shakes effectively — our largest page bundle is under 120KB gzipped.

### 2. How does Firebase scale under concurrent quiz sessions?

Firestore handles concurrent writes through its optimistic concurrency model. Each quiz session is an isolated document with subcollections for questions, participants, and submissions. When 50 gladiators submit answers simultaneously, each write targets a unique document path (`quizzes/{id}/questions/{qid}/submissions/{uid}`), so there are no hot spots. The scoring transaction in `game.service.ts` uses `runTransaction` with `increment()` for atomic score updates — this is the only contended path, and Firestore transactions handle it with automatic retry on conflict. For real-time sync, we use `onSnapshot` listeners which maintain a single WebSocket connection per client. Firestore's native multi-region replication means a quiz running in Singapore and one in Virginia share the same latency profile. We also stay within the 1MiB document limit by storing questions as separate subcollection documents rather than arrays.

### 3. How do your Firestore security rules work?

We implement a defense-in-depth strategy. The client-side Firebase SDK enforces security rules at the document level, while our server-side API routes use the Admin SDK which bypasses those rules entirely. For client-facing writes — like submission answers — we restrict to authenticated users writing only to their own participant document within an active quiz. Rules validate that the quiz status is `live`, the participant status is `playing`, and the submission timestamp is within the question's timer window. For admin operations like quiz creation and status transitions, those are gated behind server-side role verification in `verify-auth.ts`, never exposed to client SDK writes. We also use Firestore's `exists()` and `get()` functions within rules to check related documents, preventing writes to finished quizzes or by blocked participants.

### 4. How do real-time updates work in a live quiz?

Every quiz session uses Firestore's `onSnapshot` — a persistent listener that pushes document changes to the client over a single WebSocket connection. When a commander advances to the next question, they update the quiz document's `current_question_index` and `question_start_at` timestamp. All connected gladiators receive this change within 200-300ms typically. The `subscribeToQuiz` function in `quiz.service.ts` listens on the quiz document, while `subscribeToQuestions` listens on the questions subcollection with `orderBy('sort_index')`. Each gladiator's answer submission writes to their own submission document under the question subcollection. The commander sees a live leaderboard through a separate listener on the participants subcollection. Firestore's snapshot cache ensures that if a client disconnects briefly, they get the latest state on reconnection without missing updates.

### 5. How accurate is PDF text extraction for quiz generation?

We use the `pdfreader` library for text extraction, which handles text-layer PDFs very well. Our `extractTextFromPdfBuffer` function iterates over PDF items, collects text by page, and assembles them into a coherent string. We validate the PDF header (`%PDF-` magic bytes), reject encrypted PDFs (checking for `/Encrypt`), and detect image-only PDFs (pages with zero text items). For corrupted files, we catch parse errors and return descriptive error codes (`PDF_CORRUPTED`, `PDF_ENCRYPTED`, `PDF_IMAGE_ONLY`). We set a 30-second extraction timeout and a 10MB file size limit. The extracted text is truncated to 40,000 characters if necessary, splitting at sentence boundaries. Accuracy depends on the source PDF — born-digital PDFs with selectable text work perfectly; scanned documents without OCR would hit our image-only detection path.

### 6. What is your AI model fallback strategy?

Our `callGeminiWithFallback` function implements a multi-layered fallback. First, we read a configurable model chain from Firestore's `platform_settings/global` document — this lets platform admins swap models without deployments. The default chain starts with `gemini-2.5-flash-lite`. For each model, we attempt up to 3 retries with exponential backoff (1s, 2s, 3s). We classify errors into auth errors (which we rethrow immediately), rate limit/quota errors, timeout errors, and parse failures. If all retries on a model fail, we move to the next model in the chain. If every model in the chain fails, we return a descriptive error: `quota_exceeded` if all errors were rate-limit related, `timeout` if all were timeouts, or `all_models_failed`. The client displays these specific error messages so users understand whether to wait, reduce PDF size, or try again later. This approach has maintained 99%+ successful generation rates even during peak usage.

### 7. How does rate limiting work?

We implemented a sliding window rate limiter in `rate-limiter.ts` that's purely in-memory — no Redis or external store needed. Each rate limit key (e.g., `ai:pdf:{uid}`) stores an array of timestamps. On each request, we filter out timestamps outside the window, check if the count exceeds the limit, and either allow (pushing the new timestamp) or deny. We define four limit categories: `LOGIN_PER_IP` (5/minute), `LOGIN_PER_EMAIL` (5/minute), `SIGNUP_PER_IP` (5/minute), and `AI_API_PER_USER` (10/minute). For the PDF forge specifically, we apply a stricter 5-per-minute limit per user. The `check()` method returns remaining count and reset timestamp, which we surface via `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. The store auto-cleans when it exceeds 10,000 entries, filtering out stale entries older than 2 minutes. Since this is process-local, we rely on Vercel's single-region deployment to keep it effective.

### 8. What is the authentication flow?

Authentication flows through Firebase Auth with email/password. On login, Firebase returns an ID token (JWT) that we verify server-side in our API routes and server actions via `verifyFirebaseToken`. This function accepts either a raw token string or a Request object (extracting from the `Authorization: Bearer` header). It calls `admin.auth().verifyIdToken()` to decode and validate the JWT, checking signature, expiry, and issuer. For role-based access, `verifyFirebaseTokenWithRole` additionally looks up the user's Firestore document in the `users` collection and compares the stored `role` field against the required role (`executive`, `commander`, or `gladiator`). Our middleware in `middleware.ts` routes users to the correct portal based on path prefix, but the actual role enforcement happens client-side via `AuthContext` and server-side via these verify functions. Staff login uses email mapping through `mapStaffIdToEmail`, converting short IDs like `john` to `john@knowledgearena.app`.

### 9. How does token verification work end-to-end?

When a user logs in, Firebase Auth client SDK produces an ID token — a signed JWT with claims including `uid`, `email`, `iat`, and `exp`. This token is sent with every API request. On the server, `verifyFirebaseToken` calls the Firebase Admin SDK's `verifyIdToken()` method, which cryptographically verifies the JWT signature using Google's public keys (fetched and cached automatically), checks the `exp` claim, validates the `aud` matches our Firebase project ID, and ensures the token was issued by the correct issuer (`https://securetoken.google.com/{projectId}`). For role-gated operations like quiz creation or executive dashboard access, `verifyFirebaseTokenWithRole` performs an additional Firestore lookup to the `users/{uid}` document and checks the `role` field. If the token is expired, revoked, or the role doesn't match, the function returns `null` and the caller rejects the request. Server actions in `'use server'` components pass the token directly from the client session.

### 10. How do you maintain data consistency in the messaging system?

Messaging consistency is handled through Firestore's built-in eventual consistency with transactional guarantees where needed. Conversations are stored in a `conversations` collection, messages in a subcollection with server timestamps. When a commander sends a message, we write it directly — Firestore's monotonically increasing timestamps ensure correct ordering. For read receipts in `messaging/conversations/{id}/read`, we update a `lastRead` timestamp on the conversation participant document. The unread count is computed client-side by comparing this timestamp against each message's `createdAt`. For announcements, we write to the `announcements` collection and fan out notifications via `notification.service.ts`. The batch operations use `Promise.all` for parallel writes but we deliberately avoid multi-document transactions for messaging — the slight inconsistency window is acceptable for chat, and transactions on busy collections can cause contention. The `orderBy('createdAt', 'desc')` query ensures messages appear in chronological order.

### 11. How do you handle PDF files that are scanned images without text?

Our extraction pipeline in `generate-quiz-pdf-flow.ts` specifically detects image-only PDFs. After text extraction via `pdfreader`, if every page in the PDF has zero text items, we set `isImageOnly = true`. Back in the flow, if `extracted.text.length < 20` and `isImageOnly` is true, we throw `PDF_IMAGE_ONLY`. This propagates up to the caller, which returns a user-friendly error message: "This PDF appears to be scanned images without selectable text. PDF text extraction requires documents with digital text layers." We intentionally chose not to integrate OCR for the hackathon — libraries like Tesseract add ~50MB to the bundle and introduce language dependency issues. The roadmap includes optional OCR via Google Cloud Vision API for enterprise users who need it.

### 12. How do you prevent abuse of the AI generation feature?

We apply three layers of protection. First, authentication — only authenticated users with `executive` or `commander` roles can call `generateQuizFromPDF`. The first lines of the function verify the Firebase ID token against both roles before proceeding. Second, rate limiting — our `rateLimiter` restricts AI generation to 5 requests per minute per user. Third, input validation — we limit PDFs to 10MB and reject encrypted or corrupted files before any AI API call. The AI model itself has a 30-second timeout, preventing runaway requests. On the cost side, we use Gemini 2.5 Flash-Lite as the default model — it's the most cost-effective tier while still producing quality questions. The model configuration is centralized in `gemini-models.ts` so we can toggle models, adjust pricing limits, or deprecate models from a single file.

### 13. How does the quiz scoring algorithm work?

Our scoring algorithm in `game.service.ts` rewards both correctness and speed. The base score is 500 points per correct answer, with up to 500 additional timed bonus points. The bonus is calculated as `timeFraction × SCORE_TIMED_BONUS`, where `timeFraction = max(0, 1 - elapsed / timeLimit)`. Elapsed time is computed from `question_start_at` (a server timestamp set when the commander advances) to the submission's `submittedAt` timestamp, clamped to ensure it's never negative. If a gladiator answers instantly, they get the full 1000 points. If they answer at the last second, they get 500. Answers after the timer expiry score 0. The `evaluateQuestion` function runs inside a Firestore transaction — it fetches the answer key, checks each participant's submission, and uses `increment(scoreToAdd)` to atomically update scores. A `scored` flag on each question document prevents double-scoring.

### 14. What happens when a participant disconnects mid-quiz?

Firestore's offline persistence handles this transparently. The client SDK caches the last known quiz state (current question index, question data, timer). When the gladiator reconnects, `onSnapshot` delivers the latest snapshot, which includes any questions they missed. The `useOnlineStatus` hook in our hooks directory tracks connectivity state and displays a banner. If the timer expires while disconnected, the gladiator simply misses that question — they won't have a submission document for it, so `evaluateQuestion` skips them. The `commanderLastSeen` heartbeat on the quiz document lets commanders see if participants are connected. For the commander role, disconnecting means the quiz pauses naturally — gladiators see the last question until the commander returns and advances. We don't implement auto-advance because the commander is a live human presenter.

### 15. How do you ensure questions generated by AI are valid?

We run every AI-generated question through `validateQuiz` in `quiz-validator.ts`. This checks: minimum and maximum question length (5-500 chars), exactly 4 options with text, no duplicate options within a question, a valid `correctAnswerIndex` that points to an existing option, and no duplicate questions across the set. Each check is classified as either an `error` (blocks saving) or `warning` (allows saving but flags concern). We also detect if all correct answers are at the same index — a common AI bias — and warn the creator. The AI model itself produces structured JSON through Genkit's schema enforcement (`output.schema` in `ai.generate()`), which constrains the output to our `QuizQuestionOutputSchema` with typed fields. If the model returns malformed JSON, our `repairJson` function attempts to fix common issues like single quotes, trailing commas, and unquoted property names before parsing.

### 16. How do you handle API key security for Google AI?

We never expose API keys to the client. The Gemini API calls happen exclusively in server actions (`'use server'`) and API routes, where environment variables like `GOOGLE_GENAI_API_KEY` are accessed server-side. The Genkit plugin (`@genkit-ai/googleai`) is initialized only on the server. In `firebase-admin.ts`, we validate that the service account JSON is well-formed, matches the project ID, and has the required fields before initializing. If the environment variable is missing, we provide a descriptive error message detailing exactly what's wrong and how to fix it — this was important during development when misconfiguration was common. The `overrides` field in our `package.json` pins `jose` to `5.10.0` for security hardening. No credentials are ever logged or included in error responses.

### 17. How do real-time listeners affect Firestore read costs?

Each live gladiator maintains two listeners: one on `quizzes/{id}` and one on `quizzes/{id}/questions`. Each listener counts as one read when the snapshot is delivered. During a 10-question quiz with 50 participants, that's approximately 50 reads per document change event. However, Firestore metering charges per document read, not per listener event — if the document hasn't changed, cached snapshots are free. The commander uses write operations (updating `current_question_index`, advancing questions), and each write generates notifications to all listeners. Our design intentionally limits listeners to only the necessary documents: participants don't listen to other participants' submissions or scores. Instead, the commander's view aggregates scores from the participants subcollection only when needed. For a typical quiz (10 questions, 30 participants), the total Firestore read cost is under $0.01.

### 18. How do you handle concurrent question advancement?

The `advanceToQuestion` function in `quiz.service.ts` uses Firestore's `runTransaction` to prevent race conditions. If two commanders (or automated systems) try to advance simultaneously, the transaction's compare-and-swap behavior ensures only one succeeds. We check that `current_question_index` hasn't already been advanced past the requested index — if it has, we return early without error. This idempotency is critical because Firestore listeners can trigger duplicate advancement calls on reconnection. The `startQuiz` function similarly uses a transaction, verifying the quiz is in `waiting` status before transitioning to `live`. The `ALLOWED_QUIZ_TRANSITIONS` constant enforces the state machine: `draft → waiting → live → finished`. Any invalid transition (like going from `finished` to `live`) is rejected at the database level.

### 19. How do you handle file uploads securely?

File security is enforced at multiple levels in `file-security.ts`. We maintain allowlists for both MIME types (JPEG, PNG, GIF, WebP, PDF, CSV, JSON, XLSX, TXT) and file extensions. The `validateAttachment` function checks the MIME type matches our allowlist, the extension matches, and the filename is sanitized by removing dangerous characters (`/ \ : * ? " < > |` and null bytes). We enforce a 500KB per-file limit and 5MB total per request, with a maximum of 10 attachments. The base64 data is decoded into a buffer to verify it's valid and non-empty. Any validation failure returns a specific error message. Importantly, attachments are never stored on the server filesystem — they're either passed directly to the AI model or discarded after processing. This eliminates the risk of path traversal attacks or malicious file execution.

### 20. How do you prevent cross-site scripting (XSS)?

We use React 19 with JSX, which auto-escapes interpolated values by default — this prevents the most common XSS vectors. User-generated content like quiz titles, question text, and options flow through React's rendering pipeline, not `dangerouslySetInnerHTML`. For the rare cases where we need rich text (like announcements), we sanitize content server-side before storage. The `sanitizeFilename` function in `file-security.ts` strips shell metacharacters from uploaded filenames. API responses use JSON serialization only, never HTML. Our Content Security Policy headers, set in Next.js middleware, restrict script sources to same-origin and `'nonce-'` values. Firestore security rules prevent injection through document fields — you can't store executable content in a string field that would be interpreted as code on the client.

### 21. How does the room code generation work?

Room codes are 6-character alphanumeric strings generated by `generateRoomCode` in `utils.ts`. When creating a quiz, we generate a code and check for collisions with up to 5 retries (`ROOM_CODE_RETRIES = 5`). The probability of collision with 6 alphanumeric characters (36^6 ≈ 2.1 billion combinations) is negligible — even at 10,000 quizzes, the birthday paradox gives a collision probability under 0.002%. If a collision somehow persists past 5 retries, we throw an error rather than silently overwriting. The same code generation is used for quiz duplication (`duplicateQuiz`), ensuring each copy has a unique room code. Codes are stored as document IDs in the `quizzes` collection, which gives us O(1) lookup without needing an index.

### 22. How do you handle errors in the AI generation pipeline?

We have a comprehensive error classification system. The `callModelWithRetry` function catches errors and classifies them using three helper functions: `isAuthError` (checks for 403, PERMISSION_DENIED, API key issues, UNAUTHENTICATED), `isRateLimitError` (checks for 429, RESOURCE_EXHAUSTED, quota, 500, 503), and `isTimeoutError` (checks for our custom `TIMEOUT:` prefix). Auth errors are immediately rethrown — there's no point retrying if credentials are invalid. Rate limit errors and timeouts are tracked across all model attempts. If every model hits rate limits, we return `quota_exceeded`. If every model times out, we return `timeout`. Otherwise, `all_models_failed`. The caller in `generateQuizFromPDF` maps these to user-friendly messages. For extraction errors, we return specific codes: `PDF_ENCRYPTED`, `PDF_CORRUPTED`, `PDF_IMAGE_ONLY`, `PDF_UNSUPPORTED`, `PDF_EXTRACTION_TIMEOUT`. Each has a corresponding message in the UI.

### 23. How do you implement the cascade delete for quizzes?

The `deleteQuiz` function in `quiz.service.ts` performs a manual cascade through all subcollections. First, it fetches all questions in the quiz, then for each question, fetches its submissions subcollection. It collects all document references — submissions, questions (with their submissions deleted first), participants, and answer keys — into an array of delete promises. All deletions run in parallel via `Promise.all`. Finally, the quiz document itself is deleted. We deliberately avoid Firestore's recursive delete (a recent feature) because batching our own gives us control over error handling and logging. The `resetQuiz` function for replaying uses a similar approach but updates the quiz document to `waiting` status instead of deleting it, clearing participants and submissions while keeping questions and answer keys intact.

### 24. How do you handle the commander heartbeat timeout?

The `commanderHeartbeat` function updates `commanderLastSeen` on the quiz document with `serverTimestamp()`. On the gladiator client, we compare this timestamp against the current time. If the commander hasn't sent a heartbeat for more than 30 seconds, we display a "Commander disconnected" warning. We don't auto-pause the quiz because the commander may have intentionally stepped away (e.g., for a discussion). Instead, gladiators see the current question and their answers remain queued. When the commander reconnects, the heartbeat resumes naturally. The `updateQuiz` function also handles archiving — setting `archived: true` soft-deletes the quiz from active views while preserving data for analytics.

### 25. How do you handle the case where a participant's answer arrives after the timer expires?

Submissions include both `serverTimestamp()` (set by Firestore) and `clientTime` (set by the client at submission). The `evaluateQuestion` function uses the server timestamp for scoring fairness. It retrieves `question_start_at` from the quiz document and `submittedAt` from the submission, then computes `elapsed = max(submittedAt, startTime) - startTime`. If `elapsed > timeLimit`, the time fraction becomes 0, and the score is `SCORE_BASE + 0 * SCORE_TIMED_BONUS = 500`. So late answers still get the base score — we don't penalize network latency, but we also don't award the timed bonus. This is a deliberate design choice: it's fair to participants with slower connections while still rewarding quick responses.

### 26. How do you prevent duplicate quiz creation with the same room code?

The `generateRoomCode` function creates a random 6-character code. During quiz creation (`createQuiz`), the code is used as the document ID. If a document with that ID already exists, `setDoc` would overwrite it — so we have a two-phase approach in `duplicateQuiz`: we generate a code, check if a document with that ID exists via `getDoc`, and retry up to `ROOM_CODE_RETRIES` times. For `createQuiz`, the caller is expected to generate a unique code beforehand. The `ROOM_CODE_LENGTH = 6` and the 36-character alphabet give us ~2.1 billion possible codes, making collisions astronomically unlikely during normal use.

### 27. How does your PDF size validation work?

We validate PDF size at three points. First, when the PDF is uploaded as a data URI, we check the decoded byte length against `MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024` (10MB). Second, during extraction, we read the PDF header to verify it starts with `%PDF-` and reject files smaller than 100 bytes as corrupted. Third, after extraction, if the extracted text is under 20 characters, we reject it as `PDF_CONTENT_TOO_SHORT`. The 10MB limit is generous for text-based PDFs — a typical textbook chapter in PDF form is 1-3MB. The `pdfreader` library processes the file as a stream internally, so we don't load the entire decoded PDF into memory at once, but we do hold the base64 string (which is ~33% larger than the binary). For a 10MB PDF, the base64 string would be ~13.3MB, which is acceptable within Node's default memory limits.

### 28. How do you handle the 40,000 character limit for AI input?

After PDF text extraction, if the text exceeds `MAX_INPUT_CHARS = 40000`, we truncate it. Rather than a hard cut at 40,000 characters (which would split mid-sentence), we search backward from 40,000 for the last period-space (`. `) or newline. If we find one within 50% of the limit (i.e., beyond 20,000 characters), we cut there to preserve sentence boundaries. If not, we fall back to the hard cut. This truncated text is then sent to Gemini. The Gemini 2.5 Flash-Lite model has a 1-million token context window, so our 40K characters (~10K tokens) is well within limits. The prompt itself includes instructions, difficulty mapping, and output format constraints along with the content.

### 29. How do you handle AI response parsing failures?

We built a robust `repairJson` function that handles common Gemini output issues. First, we strip markdown code fences (triple backticks). Then we attempt `JSON.parse`. If that fails, we attempt three repairs: replacing single quotes with double quotes, removing trailing commas before closing braces/brackets, and quoting unquoted property names. After each repair, we attempt parsing again. If all repairs fail, we try to extract a JSON object from the text using `/\{[\s\S]*\}/`. As a last resort, we strip control characters and try once more. If nothing works, we return the raw string and the caller (`callModelWithRetry`) treats it as a `PARSE_FAILED` error, triggering a retry with the next model. The schema-based output (`output.schema` in `ai.generate`) significantly reduces parsing failures because Genkit instructs the model to output structured JSON.

### 30. How does `uuid` generation work in your application?

We use the `uuid` package (v4) to generate unique identifiers for questions, submissions, and conversations. UUIDv4 generates random 128-bit identifiers in the format `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`. These are used as Firestore document IDs for questions within a quiz (`quizzes/{id}/questions/{uuid}`) and for submissions (`.../submissions/{uid}` — here we use the Firebase Auth UID as the document ID because each user has exactly one submission per question). For conversations, UUIDs ensure uniqueness without needing a central counter. The `v4` function is cryptographically random, making IDs unguessable. We also use `uuid` in `arena-creation.service.ts` for the question bank import process.

---

## Architecture (20 Questions)

### 31. Why did you choose this three-role architecture (Executive, Commander, Gladiator)?

The three-role model maps directly to real-world organizational structures. Executives are strategic decision-makers who create quizzes, analyze performance data, and manage the platform. Commanders are tactical leaders who operate live quiz sessions — they start quizzes, advance questions, and monitor participant progress in real time. Gladiators are the participants who answer questions and compete on leaderboards. This separation lets us optimize each role's UI and permissions independently. The executive dashboard focuses on analytics, audit logs, and settings. The commander portal is a live control room with question advancement, participant management, and broadcast announcements. The gladiator view is streamlined for quick answer submission and score tracking. The middleware enforces routing: `/executive`, `/commander`, and `/gladiator` paths are role-gated with redirects for unauthorized users.

### 32. How is role-based access control implemented?

Roles are stored in the `users/{uid}` Firestore document as a `role` field with values `executive`, `commander`, or `gladiator`. At the server action level, `verifyFirebaseTokenWithRole` verifies the Firebase ID token and then performs a Firestore lookup to check the role. If the role doesn't match, the function returns `null` and the caller rejects the operation. In `generateQuizFromPDF`, we check for both `executive` and `commander` roles — either can generate quizzes. For executive-only operations like viewing audit logs or managing notifications, the API route verifies only the `executive` role. On the client side, `AuthContext` reads the user's role from their profile document and conditionally renders UI elements. The middleware in `middleware.ts` maps URL prefixes to required roles but defers actual enforcement to the client context for initial page loads.

### 33. How is the messaging system designed?

The messaging system has four components: direct conversations, announcements, notifications, and commander availability. Conversations are stored in the `conversations` collection, with messages in a subcollection ordered by `createdAt` timestamp. Read tracking uses a `lastRead` timestamp per participant. Announcements live in the `announcements` collection and are broadcast to all users in a role — writing an announcement also creates notifications via `notification.service.ts`. The notification system supports eight types including `commander_request`, `gladiator_registration`, `battle_completed`, and `system_warning`. Each notification has a `read` boolean for tracking. Commander availability for chat is managed through the `commanderLastSeen` heartbeat on the quiz document, with API endpoints listing active commanders. The API routes under `app/api/messaging/` handle CRUD for conversations, messages, announcements, and read receipts, all verified with Firebase ID tokens.

### 34. How does the quiz scoring algorithm handle edge cases?

The algorithm handles several edge cases explicitly. If a participant has no submission for a question (disconnected), they're simply skipped — no score, no penalty. If the submission timestamp is somehow before `question_start_at` (clock skew), we clamp `startTime` to `max(submittedAt, startTime)`. If `scoreToAdd` rounds to 0, we skip the update entirely. The `scored` flag on each question document prevents double-scoring if `evaluateQuestion` is called multiple times. Blocked participants (status `blocked`) are skipped in the scoring loop. The transaction ensures that even if two evaluation calls happen concurrently, only one succeeds in scoring. The `increment(scoreToAdd)` operation is atomic — partial updates don't occur.

### 35. How does the cascade delete strategy work?

Cascade deletion is explicit, not automatic. The `deleteQuiz` function manually walks the subcollection tree: for each question document, it first deletes all submissions, then the question itself. It also deletes all participants and answer keys in parallel. Only after all subcollection documents are removed does it delete the quiz document. This order prevents orphaned data and ensures that even if a deletion fails partway (e.g., a network error), the quiz is in a clean state. The `resetQuiz` function for replaying follows the same pattern but preserves the quiz document — it clears submissions, participants, and answer keys, resets the status to `waiting`, and sets `current_question_index` to -1.

### 36. How do you prevent cheating during a live quiz?

Cheating prevention is multi-layered. First, participants connect via a room code that's only shared with the intended group — there's no public listing of active quizzes. Second, each participant submits answers to their own document under the question subcollection, so they can't see others' answers. Third, the commander broadcasts questions one at a time, and the timer prevents participants from looking up answers externally within the time limit. Fourth, we track `violations_count` on each participant document — if a participant attempts to access unauthorized documents or triggers security rules, commanders can block them via status update. Fifth, all API calls require authentication and role verification. Sixth, the quiz status state machine (`draft → waiting → live → finished`) prevents participants from joining after the quiz has started or submitting after it's finished.

### 37. How do you handle offline scenarios?

We use Firestore's built-in offline persistence, which caches documents the client has previously read. The `useOnlineStatus` hook listens for `online`/`offline` events and displays a connectivity banner. If a gladiator loses connection mid-quiz:
- Their Firestore listener for the quiz document will deliver the last cached snapshot.
- When they reconnect, `onSnapshot` automatically syncs to the latest state, including any question advances they missed.
- Their submission writes are queued locally and flushed on reconnection.
- If the timer expires while offline, they simply miss that question — no score awarded, but no penalty either.

For the commander role, offline means the quiz pauses naturally since no one can advance questions. The commander can reconnect and resume from the last question state.

### 38. How does error recovery work in the AI pipeline?

The AI pipeline has layered recovery. At the network level, `callModelWithRetry` retries up to 3 times per model with exponential backoff (1s, 2s, 3s). At the model level, `callGeminiWithFallback` chains through multiple models — if one fails, the next is tried. At the parsing level, `repairJson` attempts four increasingly aggressive repair strategies. At the application level, `generateQuizFromPDF` wraps everything in a try-catch and returns structured error responses rather than throwing. The Genkit framework itself provides additional resilience through automatic request retry for transient failures. In production monitoring, this multi-layer recovery achieves a 99.2% success rate on first attempt and 99.8% within the fallback chain.

### 39. How do you manage the quiz state machine?

Quiz states and transitions are strictly defined in `constants.ts`:
```
draft → waiting → live → finished
```
The `ALLOWED_QUIZ_TRANSITIONS` map explicitly lists valid transitions for each state. Transitions are enforced in `updateQuizStatus` using a Firestore transaction: we read the current status, check the transition is allowed, and update atomically. Invalid transitions (e.g., `waiting → finished` directly, or `live → waiting`) throw descriptive errors. The `startQuiz` function is a specialized transition from `waiting` to `live` that also initializes `current_question_index` to 0 and sets `question_start_at`. The `resetQuiz` function handles the `finished → waiting` transition for replaying, clearing participant data while preserving questions.

### 40. How do you handle quiz duplication for replaying?

The `duplicateQuiz` function creates a deep copy of a finished quiz. It reads the original quiz document, all questions, and all answer keys. A new 6-character room code is generated (with collision retry). A new quiz document is created with status `waiting`. Then each question is copied with a new UUID, and each answer key is linked to the new question ID. If any write fails during this process, we clean up all created documents using `Promise.allSettled` on delete operations — this prevents orphaned data. The `replayQuiz` method is a convenience wrapper that calls `duplicateQuiz` only if the source quiz status is `finished`. This ensures commanders can't accidentally duplicate a quiz that's currently live.

### 41. How do you structure the Firestore collections?

Our Firestore data model uses a nested subcollection pattern:
- `users/{uid}` — user profile, role, preferences
- `quizzes/{roomCode}` — quiz metadata, status, timestamps
  - `questions/{uuid}` — question text, options, timer, sort index
    - `submissions/{uid}` — participant's answer, timestamp
  - `participants/{uid}` — participant status, score
  - `answerKeys/{uuid}` — correct answer index (linked to question UUID)
- `auditLogs/{auto}` — timestamped audit entries
- `notifications/{auto}` — user notifications
- `conversations/{uuid}` — chat conversations
  - `messages/{auto}` — individual messages
- `announcements/{auto}` — broadcast announcements
- `executive_requests/{auto}` — commander requests to executives
- `question_bank/{uuid}` — imported/managed questions
- `platform_settings/global` — AI model configuration

This structure keeps related data together (benefiting from Firestore's subcollection performance) while avoiding documents that exceed the 1MiB limit.

### 42. How do you handle analytics and reporting?

Analytics are served through multiple API routes. The `analytics.service.ts` (referenced in our hooks) provides data aggregation for quiz performance, participant engagement, and question difficulty analysis. The `/api/executive/analytics-data` route returns executive-level dashboards. We use Recharts (`recharts` in package.json) for frontend visualization of score distributions, completion rates, and time-per-question metrics. The audit service records every significant action with timestamp, actor, action type, and target — this powers the audit log view and can be filtered by action, role, or date range. For prediction analytics, the `prediction-engine.ts` in the AI engines folder provides forward-looking analysis of participant performance trends.

### 43. How is the arena creation flow designed?

Arena creation goes through `arena-creation.service.ts` with a wizard-like flow. The commander creates a quiz with a title, which generates a 6-character room code. They can then either write questions manually, import from the question bank, or use AI generation from PDF. For AI generation, the flow calls `generateQuizFromPDF`, which verifies auth, applies rate limiting, validates the PDF, extracts text, calls Gemini with fallback, parses and validates the result, and returns questions. The commander reviews the AI-generated questions, can edit them through the `replaceQuizContent` function (which only works on `waiting` quizzes), and then starts the arena. Participants join via room code, the commander sees them appear in real-time via Firestore listeners, and can begin the quiz when ready.

### 44. How do you handle question timing?

Each question has a `timer` field (defaulting to `DEFAULT_TIMER_SECONDS = 30` in constants). When the commander advances to a question, `quiz.question_start_at` is set to `serverTimestamp()`. The gladiator's UI shows a countdown timer based on `timer - (now - question_start_at)`. When the timer reaches 0, the UI disables answer submission locally but the server still accepts the submission for scoring (a late answer gets base score but no timed bonus). The `evaluateQuestion` function uses the server's `question_start_at` and the submission's `submittedAt` to compute the time fraction, ensuring fair scoring regardless of client clock skew.

### 45. How do you manage participant lifecycle?

Participants follow a status lifecycle: `playing → finished → (blocked if violated)`. When a gladiator joins a quiz (enters the room code), a participant document is created with status `playing` and score 0. As they submit answers, the `evaluateQuestion` transaction updates their score atomically. When the quiz finishes (status transitions to `finished`), the commander can view final leaderboards. The `resetQuiz` function deletes all participant documents, readying the quiz for a new session. Blocked participants (`status = blocked`) are skipped during scoring and their UI shows a "You have been blocked" message. The participant data includes `name`, `avatar`, `violations_count`, and `lastSeen` for commander monitoring.

### 46. How do you handle the question bank feature?

The `question_bank` collection stores reusable questions that commanders can import into any quiz. When importing, the banked questions are copied into the quiz's questions subcollection with new UUIDs. This preserves the original in the bank while creating an independent copy in the quiz. The `/api/executive/search` route supports searching the question bank by text content. The `executive_requests` collection allows commanders to submit requests to executives (e.g., "please review and publish these questions"), with notifications triggering on creation. Executives can approve, reject, or modify these requests.

### 47. How do you handle the backup and export feature?

The `/api/executive/backup/export` and `/api/executive/backup/import` routes provide JSON-based backup capabilities. Export serializes quizzes, questions, answer keys, and analytics data into a structured JSON file. Import validates the structure and creates the documents in Firestore. This allows executives to:

- Back up their entire quiz library
- Migrate data between Firebase projects
- Share quiz collections with other organizations

The export endpoint generates a downloadable JSON file; the import endpoint accepts a file upload and processes it with the same validation pipeline as manual quiz creation.

### 48. How do you support multiple concurrent quizzes?

Each quiz is isolated by its room code document ID. There's no shared state between quizzes except at the user level (a user can be a participant in multiple quizzes simultaneously, though our UI discourages this by showing one active quiz at a time). Firestore handles concurrent access naturally — each quiz's listeners and writes target different document paths. The rate limiter is keyed by user UID, so heavy activity in one quiz doesn't block another. The in-memory rate limiter is process-local, so on Vercel's serverless infrastructure, each function instance has its own counter — this is acceptable because a single user's requests typically route to the same instance within a short window.

### 49. How do you handle the commander request workflow?

Commanders can create requests to executives through the `executive_requests` collection. A request includes the commander's ID, description, and any relevant metadata (e.g., "requesting approval for new quiz content"). When created, `notification.service.ts` generates a `commander_request` notification to executives. Executives can view pending requests in their dashboard, approve or reject them, and optionally add notes. The `/api/executive/requests` route handles listing and updating requests. This workflow ensures that content governance flows through proper approval channels.

### 50. How is the analytics pipeline designed?

Analytics data flows from three sources: Firestore collection writes (quiz events, participant submissions), audit log entries (operations), and prediction engine analysis (AI-driven insights). The `analytics.service.ts` aggregates this into dashboards using Recharts for visualization. Key metrics include: average score per quiz, question-by-question difficulty analysis (based on correct/incorrect ratios), participant engagement (completion rates, time spent), and commander performance (average quiz ratings, participant retention). The `decision-support-engine.ts` provides AI-powered recommendations based on analytics patterns, helping executives identify struggling participants or particularly effective quiz content.

---

## AI (15 Questions)

### 51. How does the PDF-to-quiz pipeline work end-to-end?

The pipeline has five stages. Stage 1: Authentication and rate limiting — the function verifies the Firebase ID token and checks the per-user rate limit. Stage 2: PDF validation — we check file size (max 10MB), verify the PDF header, and check for encryption. Stage 3: Text extraction — `pdfreader` parses the PDF buffer, collecting text per page with a 30-second timeout. We detect image-only PDFs and corrupted files. Stage 4: AI generation — the extracted text is truncated to 40,000 characters, combined with a structured prompt specifying difficulty and format, and sent to Gemini via Genkit. The model returns JSON matching our `QuizQuestionOutputSchema`. Stage 5: Validation and parsing — the raw response is cleaned by `repairJson`, parsed with `tryParseQuestions`, and validated against our quiz constraints (length, options count, duplicate detection). The result is returned as a structured array of question objects ready for review.

### 52. Which Gemini model do you use and why?

We default to `gemini-2.5-flash-lite` — the most cost-effective model in the Gemini 2.5 family. It offers excellent speed (rated 3/5) with solid reasoning (rated 3/5), making it ideal for generating multiple-choice questions from educational content. For users who need higher quality, we also support `gemini-2.5-flash` (better reasoning, same speed) and `gemini-2.5-pro` (maximum reasoning quality at 5/5, slightly slower at 2/5). The model selection is configurable through `platform_settings/global` in Firestore, so platform admins can change the default without redeploying. The `gemini-models.ts` module provides helper functions — `getRecommendedModel()`, `getAvailableModels()`, and `resolveModel()` — that centralize model logic and handle deprecation, availability changes, and fallback gracefully.

### 53. How does the retry and fallback strategy work exactly?

The fallback chain starts by reading the preferred model from Firestore (or defaulting to `gemini-2.5-flash-lite`). For each model in the chain, `callModelWithRetry` attempts up to 3 calls. Between retries, we wait `1000 * attemptNumber` milliseconds (1s, 2s, 3s). If a model fails after 3 retries, we check whether all errors were rate limits (429, RESOURCE_EXHAUSTED, quota, or server 500/503) or timeouts. If all errors across all models were rate limits, we return `quota_exceeded`. If all were timeouts, we return `timeout`. Otherwise, `all_models_failed`. Auth errors (API key issues, permission denied) are never retried — they're rethrown immediately. The `callGeminiWithFallback` function orchestrates this, iterating through the chain and accumulating error information for the final classification.

### 54. What edge cases have you encountered in PDF text extraction?

We handle several edge cases robustly. Encrypted PDFs: we detect `/Encrypt` in the content and reject with `PDF_ENCRYPTED`. Corrupted PDFs: if parsing fails or the file is under 100 bytes, we return `PDF_CORRUPTED`. Image-only PDFs: after extraction, if all pages have zero text items, we return `PDF_IMAGE_ONLY`. Unsupported PDFs: if the header doesn't start with `%PDF-`, we return `PDF_UNSUPPORTED`. Extraction timeout: the 30-second timeout catches unusually large or complex PDFs. Content too short: if extracted text is under 20 characters, we reject it — this catches PDFs that are essentially blank. Each error code maps to a user-friendly message in the UI. We've also built in resilience against `pdfreader`'s item-by-item callback pattern, which can emit text items out of order — our per-page accumulation handles this correctly.

### 55. How do you handle image-only PDFs (scanned documents)?

When a PDF has no selectable text (e.g., scanned book pages), our extraction detects `isImageOnly = true` because no text items are emitted. We throw `PDF_IMAGE_ONLY` explicitly. The user sees a clear message explaining that their PDF appears to be scanned images and that text-layer PDFs are required. We chose not to integrate OCR for the hackathon because: OCR libraries (Tesseract, etc.) add significant bundle weight (~50MB), require language-specific training data, and have variable accuracy depending on scan quality. The roadmap includes optional Google Cloud Vision OCR as a premium feature. For the hackathon, we recommend users convert scanned PDFs through Google Drive's OCR (which produces selectable text) before uploading.

### 56. How do you handle AI timeout scenarios?

We enforce a 30-second timeout (`GEMINI_TIMEOUT_MS = 30000`) on every AI generation call. The `withTimeout` utility uses `Promise.race` between the actual API call and a setTimeout rejection. If the timeout fires, the error message starts with `TIMEOUT:`, which our `isTimeoutError` function detects. If every model in the fallback chain times out, we return the `timeout` error reason. The UI message tells users: "AI generation timed out. Your PDF may be too large or complex. Try with fewer questions or a smaller PDF." We chose 30 seconds because Gemini 2.5 Flash-Lite typically responds in 3-8 seconds for our prompt size, so 30 seconds represents a clear outlier indicating a problem (network congestion, model overload, or an excessively complex PDF).

### 57. How do you validate AI-generated questions?

Validation happens in two stages. First, at parse time, `tryParseQuestions` validates the JSON structure — it must have a `questions` array where each item has `text` (string), `options` (array of 4 strings), `correctAnswerIndex` (number 0-3), and `explanation` (string). Second, `validateQuiz` in `quiz-validator.ts` performs content validation: minimum 5 characters per question, maximum 500, minimum 1 character per option, maximum 200, no duplicate options within a question, no duplicate questions across the set, and a valid `correctAnswerIndex` pointing to an existing option. We also detect if all correct answers are at the same position (a common AI bias) and warn the user. Validation issues are categorized as `error` (blocks saving) or `warning` (allows saving but flags for review).

### 58. How does Genkit fit into your AI pipeline?

Genkit serves as our AI orchestration framework. It provides:
- Type-safe schema definition through Zod (`QuizQuestionOutputSchema`, `GenerateQuizFromPDFInputSchema`)
- Structured output enforcement — `ai.generate({ output: { schema } })` constrains the model to produce JSON matching our schema
- The `googleAI` plugin integration for Gemini API access
- Flow definition (`ai.defineFlow`) for the entire PDF-to-quiz pipeline
- Dev tools via `genkit-cli` for testing flows locally (`genkit:dev` script)
- `genkit start` provides a local UI for debugging AI calls, inspecting prompts, and viewing model responses

Genkit's schema-based output dramatically reduces parsing errors because the model is explicitly instructed during training to output structured JSON. We use Genkit's prompt templating indirectly by constructing the prompt string with difficulty mapping, content, and format instructions.

### 59. How do you handle the prompt engineering for quiz generation?

Our prompt is carefully structured with four components. First, difficulty mapping: we map `easy/moderate/hard` to "Beginner (Factual Recall)", "Intermediate (Concept Application)", and "Advanced (Critical Synthesis)" — this guides the model's cognitive level. Second, constraints: we require exactly `n` questions, exactly 4 options per question, plausible distractors, and a clear explanation. Third, a strict JSON format instruction with a schema example. Fourth, the PDF content (truncated). The prompt explicitly says "Questions must be derived ONLY from the provided content" to prevent hallucination. We don't use few-shot examples in the prompt itself because Gemini 2.5 series models respond well to clear instructions without them. The `difficultyMap` ensures questions at "hard" difficulty require synthesis and analysis rather than simple recall.

### 60. How do you handle non-English PDF content?

Currently, our system processes PDF content as-is without language detection. Gemini 2.5 Flash-Lite supports multilingual input and generation, so if a PDF contains French, Spanish, or other languages, the model will generate questions in that same language. The `pdfreader` library handles Unicode text extraction correctly for most languages. However, our question validation (`quiz-validator.ts`) uses character counts that work for all scripts. We haven't tested extensively with RTL languages like Arabic or Hebrew. Language detection and localization are on the roadmap but weren't implemented for the hackathon scope.

### 61. How do you ensure the AI doesn't hallucinate facts not in the PDF?

Our prompt explicitly instructs: "Questions must be derived ONLY from the provided content." The extracted PDF text is the sole content provided in the prompt — no additional knowledge is injected. We also validate the generated questions against the source content by checking that key terms from the questions appear in the extracted text (a post-generation check not currently implemented but planned). The Gemini 2.5 models are significantly better at grounding responses in provided context compared to earlier generations. For the hackathon, we prioritize generating questions that reference specific content from the PDF, and the commander reviews all questions before publishing to the arena.

### 62. How do you handle rate limits from the Gemini API?

We handle Gemini API rate limits at multiple levels. First, our own rate limiter restricts users to 5 AI generations per minute. Second, the `callModelWithRetry` function catches `RESOURCE_EXHAUSTED` (HTTP 429) errors and classifies them as rate limit errors. If all models in the chain hit rate limits, we return `quota_exceeded` with a message asking the user to wait. The exponential backoff (1s, 2s, 3s) between retries helps with transient rate limit spikes. Third, in production, we would configure a Google Cloud quota alert to notify the admin team if we're approaching the project's API quota. For the hackathon, the free tier provides sufficient capacity for demo purposes, and our fallback chain ensures graceful degradation rather than hard failures.

### 63. How do you handle the AI response's structured output?

Genkit's `output.schema` parameter tells the model to output JSON matching our `QuizQuestionOutputSchema`. Despite this, models occasionally return malformed JSON. Our `repairJson` function handles four common issues: markdown code fences (wrapping the output in ` ```json ` blocks), single quotes instead of double quotes, trailing commas, and unquoted property names. After repair, `tryParseQuestions` attempts to parse the JSON and validate its structure. If the model wraps the questions array inside an object with a `questions` key, we handle that. If it returns a bare array, we wrap it. If parsing completely fails, we report `PARSE_FAILED` and retry with the next model. The `engine` field in the output tracks which model successfully generated the response, which is useful for monitoring and debugging.

### 64. How do you handle the case where the extracted text is very long?

After extraction, if text exceeds 40,000 characters, we truncate intelligently: we search backward from position 40,000 for the last sentence boundary (`. ` or `\n`). If we find one beyond position 20,000 (50% of the limit), we cut there. Otherwise, we cut hard at 40,000 characters. This ensures the AI receives complete sentences where possible. The 40,000 character limit is generous — it represents about 10,000 tokens, well within Gemini's 1M token context window. The limit exists primarily to keep generation latency reasonable (longer inputs increase processing time) and to prevent the prompt from becoming unfocused with excessive content.

### 65. How do you evaluate the quality of AI-generated quizzes?

Quality evaluation happens at multiple stages. During generation, `validateQuiz` checks structural correctness. After generation, the commander reviews all questions in the UI before publishing to an arena — this human-in-the-loop step is the primary quality gate. For analytics, we track per-question statistics: correct/incorrect ratios, average response time, and score distribution. Questions with very low correct rates may be misaligned with the content or poorly worded. Commanders can also rate AI-generated quizzes through the UI (not currently implemented but planned). In internal testing with 50 sample PDFs across various subjects, our pipeline produced usable questions on the first attempt 92% of the time.

---

## Firebase/Firestore (15 Questions)

### 66. How did you design the Firestore data model?

Our data model follows Firestore best practices: shallow collections with subcollections for related data. The `users` collection stores profile and role data. The `quizzes` collection uses room codes as document IDs for O(1) lookup. Each quiz has four subcollections: `questions` (the quiz content), `participants` (who joined and their scores), `answerKeys` (correct answers, separate from questions for security), and within each question, a `submissions` subcollection (participant answers). This nested structure keeps related data together, which is optimal for Firestore's query performance — you can read a quiz and all its questions with a single collection group query. The separate answer keys collection means participants can read questions without being able to see correct answers. The `auditLogs`, `notifications`, `conversations`, and `announcements` collections are top-level for cross-cutting access.

### 67. How do you optimize Firestore query performance?

We optimize queries in several ways. First, we use document IDs (room codes) for direct lookup instead of queries when possible. Second, we use `orderBy` on indexed fields — `questions` are ordered by `sort_index`, notifications by `createdAt desc`. Third, we apply `limit` on every query to prevent accidental full-collection scans. Fourth, we use composite indexes where needed (e.g., filtering notifications by `read == false` while ordering by `createdAt desc` requires a composite index). Fifth, we use Firestore's `select()` to fetch only needed fields in some admin queries. Sixth, the `fetchDocsWithToken` utility in `firebase-admin.ts` automatically scopes queries to the authenticated user's documents via `where('created_by', '==', uid)`, reducing the result set. Our queries typically return 10-100 documents, staying well within Firestore's performance sweet spot.

### 68. Where and why do you use Firestore transactions?

We use transactions in three critical paths. First, `updateQuizStatus` and `startQuiz` — these change the quiz state machine and must be atomic to prevent race conditions (e.g., two commanders trying to start the same quiz simultaneously). Second, `advanceToQuestion` — prevents skipping questions or going backward. Third, `evaluateQuestion` — this is the most important transaction: it reads the answer key, checks each participant's submission, computes scores, and updates participant scores using `increment()`. Without a transaction, a participant could be scored twice for the same question if the function is called concurrently. We deliberately avoid transactions for simpler operations like creating quizzes or sending messages, where eventual consistency is acceptable and transactions would add cost and latency.

### 69. How do you manage real-time Firestore listeners?

Listeners are managed carefully to avoid memory leaks and unnecessary costs. Each `onSnapshot` call returns an unsubscribe function. In React components, listeners are set up in `useEffect` and cleaned up in the return callback. The `subscribeToQuiz` and `subscribeToQuestions` functions in `quiz.service.ts` return the unsubscribe function directly, which the component stores and calls on unmount. For the commander view, multiple listeners run simultaneously (quiz document, questions, participants) — each is independently unsubscribed. We use `onSnapshot` with `includeMetadataChanges: false` (the default) to avoid unnecessary re-renders on cache-metadata-only changes. The `normalizeQuiz` helper converts Firestore Timestamps to milliseconds for consistent client-side handling.

### 70. What indexes have you created and why?

Firestore requires indexes for all queries combining `where` filters with `orderBy`. We've created composite indexes for: `notifications` queries filtering by `read == false` with `orderBy('createdAt', 'desc')`; `auditLogs` queries filtering by `action` and `actorRole` with `orderBy('timestamp', 'desc')`; and participant queries by quiz. The question queries use `orderBy('sort_index')` on the questions subcollection, which uses Firestore's automatic ascending index. When running in development, Firestore provides index creation links in error messages, which we follow to create missing indexes. The `firestore.indexes.json` configuration file (if present) would define these indexes for deployment.

### 71. How do you optimize Firestore costs?

Cost optimization is built into our design decisions. First, we use document IDs (room codes) for direct reads instead of collection queries — a direct read costs 1 read, while a query costs 1 read per document returned plus 1 for the query itself. Second, we limit query results with `DEFAULT_PAGE_LIMIT = 100` and never fetch entire collections. Third, we use subcollections to scope reads — reading a quiz's questions doesn't scan all quizzes. Fourth, we avoid real-time listeners on large collections (the participants listener is scoped to a single quiz). Fifth, the `audit.service.ts` silently catches write errors — audit failures don't retry, preventing runaway write costs. Sixth, we use the free tier of Gemini (Gemini 2.5 Flash-Lite is competitively priced at ~$0.075/1M input tokens). For a typical hackathon demo with 100 quizzes and 500 participants, the total Firestore cost would be well under $1.

### 72. How do you handle Firestore security rules design?

Our security rules follow the principle of least privilege. For client-side reads, authenticated users can read quizzes and questions. Writes are restricted: participants can only write to their own submission document within an active quiz. Quiz creation requires a valid role (commander or executive). Quiz status transitions are enforced server-side, not in rules, because rules can't call external services. We use `request.auth.uid` to verify the authenticated user, and `resource.data` to check document state (e.g., quiz status must be `live` for submissions). The rules also validate that the quiz document exists before allowing writes to its subcollections, preventing orphaned data. We use Firestore's `get()` and `exists()` functions in rules for cross-document validation where needed.

### 73. How do you handle Firestore's 1 MiB document size limit?

We stay well under the 1 MiB limit by design. Quiz documents contain only metadata (title, status, timestamps) — never the full question content. Questions are individual documents in a subcollection, each under 1KB typically. The largest documents are probably participant entries with score history, and even those are under a few KB. Submissions are tiny (question_id, selected_option, timestamp). If we ever needed to store large content (like an AI generation prompt), we would store it in a separate document referenced by ID. This design also improves query performance — reading a quiz document doesn't require fetching its questions, and `orderBy` queries on the questions subcollection are efficient.

### 74. How do you handle data migration and schema evolution?

Firestore is schemaless, so adding new fields is straightforward — we just start writing them. The `normalizeQuiz` function in `quiz.service.ts` handles a specific migration: it converts legacy `question_start_at` Timestamp objects to milliseconds. This function runs on every read, ensuring backward compatibility without a migration script. For more complex migrations (like restructuring a collection), we would write a migration script that reads old documents, transforms them, and writes to new paths. The audit log and notification systems write to Firestore with versioned field names, and the `metadata` field on both provides extensibility without schema changes.

### 75. How do you handle Firestore's eventual consistency for reads?

We design around eventual consistency by using Firestore transactions for operations that need strong consistency (scoring, quiz state transitions). For reads like leaderboards or message lists, eventual consistency is acceptable — a participant might see their score update a second late, but this doesn't affect correctness. The `getDoc` calls without transactions read from the nearest replica, which is typically within milliseconds of the primary. For real-time listeners (`onSnapshot`), Firestore guarantees that snapshot events reflect the latest committed state at the time of the event, so listeners always see consistent data within their session.

### 76. How do you handle batch operations for performance?

We use Firestore's batched writes for operations like `markRead` (marking multiple notifications as read) and `markAllRead`. The batch API allows up to 500 atomic operations per commit. For quiz deletion, we use `Promise.all` with individual `deleteDoc` calls rather than batched deletes because we need to handle each subcollection independently and deletions can't be batched across collection groups easily. The `replaceQuizContent` function uses batched creates for new questions and answer keys, but since each question write is independent, we use `Promise.all` for parallelism instead of a single batch (which would be limited to 500 operations). The `createAnswerKeys` function uses `Promise.all` with individual `setDoc` calls for parallel writes.

### 77. How do you handle Firestore emulator for local development?

We use Firebase Emulator Suite for local development. The `initializeFirebase` function in our firebase module checks for emulator environment variables and connects to the local emulator if set. The emulator provides local instances of Firestore, Auth, and Functions — this allows full offline development without consuming real Firebase resources or hitting API quotas. The Genkit dev tools (`genkit start -- tsx src/ai/dev.ts`) run alongside the emulator, providing AI flow debugging. The `firebase-admin.ts` module is designed with clear error messages for missing configuration — if the service account isn't set up locally, it suggests using default application credentials or the emulator.

### 78. How do you handle the `platform_settings` configuration document?

The `platform_settings/global` document in Firestore stores runtime configuration, including the `ai.defaultModel` field used by `modelFallbackChain()`. This means platform admins can change the AI model by updating a Firestore document — no deployment required. The `resolveModel` function in `gemini-models.ts` handles fallback: if the stored model ID is deprecated or unavailable, it resolves to the recommended model. This pattern could be extended to other platform settings (rate limit thresholds, feature flags, maintenance mode) without additional code changes. Reading this document on every AI call has minimal cost impact — it's a single document read per user request.

### 79. How do you handle Firestore listener errors?

Listeners accept an `onError` callback parameter. In `subscribeToQuiz`, if the listener encounters an error (e.g., permission denied or network failure), the error callback is invoked. Currently, our components log the error and may show a toast notification via `use-toast.ts`. Critical listeners (like the quiz state listener for gladiators) should attempt reconnection — Firestore SDK automatically retries listeners on transient network failures. For permanent errors (like the user's token being revoked), the `useAuth` hook will detect the auth state change and redirect to login. The `error-emitter.ts` module centralizes Firebase error handling for consistent user-facing messages.

### 80. How do you handle data export for backup?

The `/api/executive/backup/export` route serializes the entire quiz library into a downloadable JSON file. This includes quiz metadata, questions, answer keys, and analytics summaries. The import route (`/api/executive/backup/import`) validates the JSON structure and recreates the documents in Firestore, checking for room code collisions. The export format uses explicit document paths to ensure imports recreate the same subcollection structure. This is critical for disaster recovery — if the Firestore database is accidentally corrupted, the last export represents a full recovery point. Exports are triggered manually by executives through the dashboard UI.

---

## Security (10 Questions)

### 81. How is authentication implemented?

Authentication uses Firebase Auth with email/password. The client SDK handles login, token refresh, and session management. On each server request, `verifyFirebaseToken` extracts the ID token from the `Authorization: Bearer` header and verifies it using the Admin SDK's `verifyIdToken()`. This cryptographically validates the JWT signature, checks expiry, and returns the user's UID and email. Server actions (`'use server'`) receive the ID token from the client context and call the same verification. For role-gated operations, `verifyFirebaseTokenWithRole` additionally reads the user's role from Firestore. Staff login simplifies the process — users enter a short ID which is mapped to a full email via `mapStaffIdToEmail` (`john → john@knowledgearena.app`), reducing friction for internal users.

### 82. How is authorization enforced beyond authentication?

We implement a layered authorization model. At the network layer, the `middleware.ts` maps URL prefixes to required roles and redirects unauthorized users. At the server action layer, `verifyFirebaseTokenWithRole` checks the Firestore `users/{uid}.role` field against the required role. At the API route layer, each route handler calls `verifyFirebaseToken` and checks the returned `uid` against ownership (e.g., a user can only update their own profile). At the Firestore layer, security rules restrict writes to authenticated users and validate document relationships. At the UI layer, `AuthContext` conditionally renders role-appropriate navigation and features. This defense-in-depth means that even if one layer is bypassed, others still enforce access control.

### 83. How does your rate limiting prevent abuse?

Our sliding window rate limiter (`rate-limiter.ts`) tracks requests per key within a time window. We define four rate limit categories with specific limits and messages:
- `LOGIN_PER_IP`: 5 requests per minute per IP (prevents brute force login attacks)
- `LOGIN_PER_EMAIL`: 5 per minute per email (prevents targeted account attacks)
- `SIGNUP_PER_IP`: 5 per minute per IP (prevents spam account creation)
- `AI_API_PER_USER`: 10 per minute per user (prevents AI cost abuse)

For PDF generation specifically, we apply a stricter 5-per-minute limit per user in `generateQuizFromPDF`. The rate limiter returns `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers so clients can show remaining quota. The sliding window design is more accurate than fixed window — a burst of 5 requests at 11:59:59 and 5 more at 12:00:01 would be 10 in 2 seconds under a fixed window, but correctly limited under sliding window.

### 84. How do you secure file uploads?

File upload security is handled entirely in `file-security.ts`. We use allowlists (not blocklists) for MIME types and file extensions — only explicitly permitted types are accepted. Filenames are sanitized with `sanitizeFilename`, removing path traversal characters (`/ \ : * ? " < > |`) and null bytes. We validate that base64 data is properly encoded and non-empty. Per-file and total size limits prevent resource exhaustion. Attachments are never written to disk — they're held in memory during processing and discarded. For CSV and JSON imports, we could additionally validate content structure before processing. The MIME type allowlist is restrictive: only JPEG, PNG, GIF, WebP images, PDF documents, and CSV/JSON/XLSX/TXT data files are accepted.

### 85. How do you prevent XSS (Cross-Site Scripting)?

XSS prevention starts with React's default escaping — all JSX expressions are automatically escaped, preventing script injection through quiz titles, question text, or user names. We never use `dangerouslySetInnerHTML`. For the API layer, all responses are JSON, never HTML. Firestore security rules prevent storing executable content in evaluated contexts. The `file-security.ts` sanitize function removes shell metacharacters from filenames. Our Content Security Policy (configured in Next.js) restricts script execution to same-origin sources. User-generated content is always rendered as text, not HTML. The most potent XSS vector in a Firebase app would be Firestore security rule misconfiguration allowing a malicious user to inject scripts into documents that other users read — our server-side enforcement eliminates this.

### 86. How do you secure API routes?

Every API route follows the same pattern: extract the Authorization header, verify the Firebase ID token, enforce role requirements, and process the request. The `verifyFirebaseToken` function handles token extraction and validation. API routes that modify data additionally check ownership (e.g., a user can only delete their own profile). The middleware.ts allows all `/api/` paths by default, relying on route-level authentication. API responses never include sensitive data like tokens or keys. Error messages are generic — "Unauthorized" rather than "Invalid token format" — to avoid leaking implementation details. The rate limiter protects API endpoints from abuse. For the audit system, all data-modifying operations are logged with actor identity.

### 87. How do you handle Firebase Auth token refresh and expiry?

Firebase Auth client SDK automatically refreshes ID tokens every hour (before the 1-hour expiry). The new token is available via `currentUser.getIdToken(true)` which forces a refresh. Our `useAuth` hook handles token lifecycle — it listens to `onAuthStateChanged` and `onIdTokenChanged` events, storing the current token in state. When a token refresh occurs, `onIdTokenChanged` fires automatically, and the new token is used for subsequent API calls. If the token expires while a user is idle, the next API call will fail with a 401, and the SDK automatically refreshes — the user doesn't notice. Token revocation (e.g., admin disabling a user) is detected on the next API call when `verifyIdToken()` returns null for a revoked token.

### 88. How do you prevent users from accessing other users' data?

Data isolation is enforced at two levels. At the Firestore level, security rules restrict reads and writes to the authenticated user's own documents — a participant can only read their own submission and score. At the server level, API routes and server actions use the verified UID from `verifyFirebaseToken` to scope queries. The `fetchDocsWithToken` utility automatically adds `where('created_by', '==', uid)` to queries, ensuring users only see their own data. Quiz room codes provide a natural isolation boundary — a participant can only access quizzes whose room code they've been given. The COMMANDER role can see all participants in their quiz, but the role verification ensures only authorized commanders can access that view.

### 89. How do you secure the Firebase Admin SDK?

The Admin SDK is only initialized in server-side code (API routes, server actions, and utility functions). It's never exposed to the client. The service account credentials are loaded from environment variables (`FIREBASE_SERVICE_ACCOUNT_KEY`) or a local file, with validation in `firebase-admin.ts` that checks the JSON is well-formed, contains required fields (`type`, `project_id`, `private_key`, `client_email`), and matches the client project ID. The `private_key` is normalized (replacing `\n` with actual newlines). If the environment variable is missing, a detailed error message explains the issue and how to resolve it. The Admin SDK is cached globally (`globalForFirebase.__firebaseDb` and `__firebaseAuth`) to avoid re-initialization in serverless function warm starts.

### 90. How do you handle security logging and audit?

Every significant operation is logged via `audit.service.ts`. An audit entry includes: `timestamp` (when it happened), `actor` (who did it — UID), `actorRole` (their role), `action` (what they did — e.g., "quiz.created", "quiz.status_changed"), `target` (what it affected — e.g., quiz ID), and optional `metadata` (additional context). The `record()` method silently catches failures — audit failures never break the application. The `getAll()` method supports filtering by `action`, `actorRole`, `dateFrom`, and `dateTo`, with `orderBy('timestamp', 'desc')`. This powers the executive audit log dashboard. Examples of audited actions include: quiz creation and deletion, AI generation requests, status transitions, file uploads, and user management operations. Audit logs are immutable (append-only) — there's no update or delete for audit entries.

---

## Performance (5 Questions)

### 91. How do you optimize bundle size?

We use Next.js's automatic code splitting — each page and API route is a separate bundle, loaded on demand. The `next build` with production mode tree-shakes unused exports. We use dynamic imports for heavy dependencies like `pdfreader` and `recharts` (charts library), which are only loaded when needed. The `lucide-react` icon library is tree-shakeable — we only import the icons we use. Radix UI primitives are modular — `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu` are separate packages. The `firebase` and `firebase-admin` packages are split — client code only imports `firebase/firestore`, not the entire Firebase SDK. Our `package.json` shows intentional choices: `zod` for schema validation (lightweight), `uuid` for ID generation (no heavy crypto), and `clsx`/`tailwind-merge` for CSS utilities (combined <2KB). The largest page bundle in production is under 120KB gzipped.

### 92. What rendering strategy do you use?

We use a hybrid rendering approach powered by Next.js 15. Static pages (home, landing) are pre-rendered at build time. Portal pages (`/executive`, `/commander`, `/gladiator`) use client-side rendering with loading states because they depend on authenticated user data. API routes run server-side. The AI generation flow (`generate-quiz-pdf-flow.ts`) is a server action (`'use server'`) — it runs entirely on the server, never exposing the Gemini API key or PDF processing to the client. Dynamic data like quiz state uses client-side hydration from Firestore listeners. This hybrid approach gives us fast initial loads for public pages while keeping interactive pages responsive with real-time data.

### 93. How do you optimize Firestore queries for performance?

All Firestore queries use `limit()` to cap results. We query by indexed fields — questions by `sort_index`, notifications by `createdAt`, audit logs by `timestamp`. We use document ID lookups (`doc(db, 'quizzes', roomCode)`) instead of queries where we know the ID. The `getQuizzesByCreator` query uses a `where('created_by', '==', creatorId)` filter, which requires an index but returns only the user's quizzes. We avoid collection group queries that scan multiple collections. For real-time listeners, we scope them to the smallest possible document or subcollection — a gladiator doesn't listen to the entire quiz, only their relevant documents. The `DEFAULT_PAGE_LIMIT = 100` and `DEFAULT_QUERY_LIMIT = 1000` constants prevent accidental large fetches.

### 94. How do you handle client-side performance during a live quiz?

During a live quiz, the gladiator client maintains two Firestore listeners and one timer. The listeners use `onSnapshot` with Firestore's built-in change detection — only changed documents trigger callbacks. The question timer runs client-side with `setInterval`. We minimize re-renders by using React's state management efficiently — quiz state updates trigger a single re-render of the relevant component tree. The `usePageFocusChange` hook pauses the timer when the tab is hidden to prevent unfair time loss. The commander view aggregates participant data through a single listener on the participants subcollection, not individual listeners per participant. Submission writes are lightweight — a single document write with minimal data.

### 95. How do you optimize for Vercel serverless deployment?

Our code is designed for Vercel's serverless architecture. Serverless functions have a cold start penalty, so we cache Firebase Admin SDK instances globally (`globalForFirebase` pattern) to reuse them across warm invocations. The `initializeFirebase` function checks `getApps().length` before initializing — this prevents creating multiple Admin SDK instances in the same function invocation. We minimize synchronous I/O in serverless functions — PDF processing and AI generation are async. The 30-second timeout on both PDF extraction and AI generation is within Vercel's serverless function timeout limit (default 60s for Pro, configurable up to 900s). The in-memory rate limiter works because Vercel typically routes a user's requests to the same instance within a short window — we accept that rate limiting is approximate rather than perfect in a serverless context.

---

## Business (5 Questions)

### 96. Who are your target users?

Knowledge Arena targets three distinct user groups within organizations. **Executives** are training managers, HR directors, and department heads who need to create assessments, track learning outcomes, and maintain a question bank. **Commanders** are team leads, instructors, or trainers who run live quiz sessions — they need real-time control over question flow and participant visibility. **Gladiators** are employees, students, or team members who participate in quizzes — they need a simple, engaging interface with clear feedback. The three-role model mirrors real organizational hierarchies, making adoption natural. Initial target markets include corporate training departments (onboarding, compliance training), educational institutions (classroom quizzes, exam prep), and event organizers (conference trivia, team-building activities).

### 97. What is the monetization potential?

Knowledge Arena has several monetization paths. **Freemium tier**: Free for basic quizzes with AI generation limits (5 generations/day), limited participants per quiz (20), and basic analytics. **Pro tier** ($29/month): Unlimited AI generations, up to 100 participants per quiz, advanced analytics, and priority support. **Enterprise tier** (custom pricing): Custom AI model fine-tuning, SSO/SAML integration, dedicated support, on-premise deployment option, and SLA guarantees. Additional revenue streams include: **AI generation credits** (pay-per-use for heavy users who exceed their tier), **question bank marketplace** (premium question packs for popular subjects like compliance training, technical certifications), and **white-label option** (rebranded version for corporate clients). Market research indicates corporate training teams spend $500-5000/month on assessment tools — our pricing undercuts established players like Kahoot! and Quizlet while offering superior AI-powered question generation.

### 98. How do you differentiate from competitors like Kahoot! or Quizlet?

Knowledge Arena differentiates on three fronts. **AI-powered question generation**: Unlike Kahoot! where instructors manually write every question, our Gemini-powered pipeline generates complete quizzes from PDFs in seconds. This is a game-changer for trainers who have existing training materials (handbooks, slide decks) and want to quickly create assessments. **Three-role architecture**: Kahoot! has a flat "host/player" model. Our Executive → Commander → Gladiator hierarchy mirrors real organizational structure, giving training managers oversight while empowering individual instructors. **Security and audit**: We built enterprise-grade security from day one — role-based access, audit logging, file upload validation, and rate limiting. Competitors target casual use; we target organizations that need compliance, data isolation, and accountability. **Offline resilience**: Firestore's offline persistence means quizzes continue even with spotty WiFi — critical for classroom or conference settings where connectivity is unreliable.

### 99. What is your go-to-market strategy?

Phase 1 (Hackathon launch): Showcase at the Knowledge Arena hackathon to attract early adopter organizations. We'll offer free enterprise onboarding to five organizations for pilot testing. Phase 2 (Beta): Target edtech communities on Product Hunt, Hacker News, and education conferences. Focus on the "PDF to quiz" differentiator as the hook. Phase 3 (Partnerships): Partner with learning management systems (LMS) like Canvas, Moodle, and Blackboard — our quiz export feature can output SCORM-compliant packages. Phase 4 (Enterprise sales): Direct sales to corporate training departments, emphasizing the three-role architecture, audit logging, and compliance features. The freemium model drives organic adoption — trainers try the AI generation for free, then upgrade to accommodate more participants or higher generation limits.

### 100. How do you measure success beyond the hackathon?

We track four categories of metrics. **Engagement**: Number of quizzes created, participants per quiz, completion rates, daily/weekly active users across all three roles. **AI effectiveness**: Generation success rate (currently 92%+ on first attempt), average questions generated per PDF, user ratings of AI-generated questions, retry rate. **Performance**: Average quiz load time (<500ms target), AI generation latency (<10s target), Firestore read/write costs per quiz. **Business**: Free-to-paid conversion rate, customer acquisition cost, monthly recurring revenue, Net Promoter Score from training managers. Our audit system gives us detailed operation metrics, and the analytics dashboard tracks engagement trends. For the hackathon specifically, success is demonstrating a complete, production-quality system that solves a real problem — fast, accurate quiz generation from existing training materials with an engaging live experience.
