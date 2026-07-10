# Database Schema

Firestore collections and documents.

## Entities

### `users/{userId}`

User profile document.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name |
| `email` | `string` | Email address |
| `role` | `string` | `"teacher"` or `"student"` |
| `avatar` | `string` | Emoji avatar string |

### `quizzes/{quizId}`

Quiz room document.

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Quiz title |
| `status` | `string` | `"waiting"` / `"live"` / `"finished"` |
| `current_question_index` | `number` | Current question (0-based), -1 before start |
| `question_count` | `number` | Total questions |
| `question_start_at` | `number \| null` | Timestamp when question started (epoch ms) |
| `created_by` | `string` | Teacher's user ID |
| `created_at` | `number` | Creation timestamp (epoch ms) |
| `archived` | `boolean` | (optional) Archived state |

### `quizzes/{quizId}/questions/{questionId}`

Individual question.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Question text |
| `options` | `string[]` | 2-4 answer options |
| `timer` | `number` | Time limit in seconds |
| `sort_index` | `number` | Display order |
| `scored` | `boolean` | Whether this question has been scored (for idempotency) |

### `quizzes/{quizId}/questions/{questionId}/submissions/{userId}`

Student's answer for one question.

| Field | Type | Description |
|-------|------|-------------|
| `selected_option` | `number` | Index of selected option |
| `submitted_at` | `number` | Submission timestamp (epoch ms) |

### `quizzes/{quizId}/participants/{userId}`

Student's participation state.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name at time of joining |
| `avatar` | `string` | Emoji avatar |
| `role` | `string` | `"teacher"` or `"student"` |
| `score` | `number` | Current total score |
| `status` | `string` | `"playing"` / `"finished"` / `"blocked"` |
| `violations_count` | `number` | Number of malpractice violations |
| `user_id` | `string` | User's auth UID |

### `quizzes/{quizId}/answerKeys/{questionId}`

Correct answer (hidden from students).

| Field | Type | Description |
|-------|------|-------------|
| `correct_option_index` | `number` | Index of the correct option |

## Indexes

Required indexes defined in `firestore.indexes.json`:

| Collection | Fields | Type | Purpose |
|------------|--------|------|---------|
| `participants` (collection group) | `__name__` | CONTAINS | Student history lookup |

## Security Rules

Rules are in `firestore.rules`. Key policies:

- **Users**: Users can read/write their own profile
- **Quizzes**: Only teachers can create/update/delete quizzes
- **Questions**: Teachers manage; all signed-in can read
- **AnswerKeys**: Teachers only (hidden from students)
- **Participants**: Students can create their own, teachers can update all
- **Submissions**: Students can submit their own (if not blocked); teachers can read

## Common Queries

```typescript
// Get quizzes by teacher
query(collection(db, 'quizzes'), where('created_by', '==', userId))

// Get questions in order
query(collection(db, 'quizzes', quizId, 'questions'), orderBy('sort_index'))

// Get student history (collection group)
query(collectionGroup(db, 'participants'), where('__name__', '==', userId))

// Get recent quizzes for AI
query(collection(db, 'quizzes'), orderBy('created_at', 'desc'), limit(5))
```
