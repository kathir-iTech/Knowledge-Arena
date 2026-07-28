# Knowledge Arena — API Reference

All API endpoints return JSON responses unless otherwise noted. Authentication is via Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

---

## Rate Limiting

| Endpoint Group | Limit | Window |
|---|---|---|
| Login (per IP) | 5 | 60s |
| Login (per email) | 5 | 60s |
| Signup (per IP) | 5 | 60s |
| AI APIs (per user) | 10 | 60s |
| PDF Forge (per user) | 5 | 60s |

Rate-limited endpoints return `429 Too Many Requests` with `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.

---

## Rate Limit Check

### POST `/api/rate-limit/check`
Check if an action is rate-limited before attempting it.

**Auth:** None  
**Role:** None

**Request Body:**
```json
{
  "type": "login",       // "login" | "signup"
  "identifier": "user@example.com"  // email for login, optional
}
```

**Response `200`:**
```json
{ "allowed": true }
```

**Response `429`:**
```json
{
  "error": "Too many login attempts. Please wait 1 minute.",
  "retryAfter": 45
}
```

---

## Admin — User Management

### POST `/api/admin/users`
Create a new Commander user.

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{
  "email": "commander@example.com",
  "password": "securepass123",
  "displayName": "Commander Name"
}
```

**Response `200`:**
```json
{
  "uid": "abc123...",
  "email": "commander@example.com",
  "displayName": "Commander Name"
}
```

**Status codes:** `200` Success, `400` Invalid input, `401` Unauthorized, `409` Email exists, `429` Rate limited, `500` Server error

---

### GET `/api/admin/users`
List users filtered by role.

**Auth:** Required  
**Role:** Executive

**Query params:** `?role=commander` (one of: commander, gladiator, executive)

**Response `200`:**
```json
{
  "users": [
    {
      "uid": "abc123",
      "email": "user@example.com",
      "displayName": "User Name",
      "role": "commander",
      "disabled": false,
      "createdAt": 1700000000000,
      "arenaCount": 5,
      "lastActive": 1700000000000
    }
  ]
}
```

Commanders are enriched with arena count and last active timestamp. Gladiators are enriched with battle count and average score.

**Status codes:** `200` Success, `400` Invalid role filter, `401` Unauthorized

---

### PATCH `/api/admin/users`
Update or disable a user.

**Auth:** Required  
**Role:** Executive

**Request Body (disable/enable):**
```json
{ "uid": "abc123", "disabled": true }
```

**Request Body (reset password):**
```json
{ "uid": "abc123", "resetPassword": true, "password": "newpass123" }
```

**Status codes:** `200` Success, `400` Missing uid/invalid input, `401` Unauthorized, `403` Cannot modify executive accounts, `404` User not found

---

### DELETE `/api/admin/users`
Delete a user (soft-delete for commanders, hard-delete for gladiators). Cascades to conversations, notifications, requests, and participant data.

**Auth:** Required  
**Role:** Executive

**Query params:** `?uid=abc123` (or in JSON body)

**Status codes:** `200` Success, `400` Missing uid, `401` Unauthorized, `403` Cannot delete executive accounts, `404` User not found

---

## Executive — Workspace

### GET `/api/executive/workspace`
Main executive dashboard data including system health, user counts, battle statistics, recent activity, and platform metrics.

**Auth:** Required  
**Role:** Executive

**Response `200`:** Returns comprehensive platform overview:
```json
{
  "executives": 2,
  "commanders": 25,
  "activeCommanders": 20,
  "disabledCommanders": 3,
  "gladiators": 150,
  "activeGladiators": 120,
  "totalUsers": 177,
  "questionBank": 450,
  "battles": 80,
  "completedBattles": 55,
  "activeBattles": 3,
  "waitingBattles": 22,
  "battlesToday": 5,
  "battlesThisWeek": 15,
  "newUsersToday": 3,
  "newUsersThisWeek": 12,
  "questionsImported": 200,
  "aiGeneratedQuestions": 200,
  "mostActiveCommander": { "uid": "...", "name": "...", "arenaCount": 12 },
  "averageBattleScore": 650,
  "averageBattleDuration": 15,
  "messages": 1200,
  "conversations": 45,
  "announcements": 8,
  "unreadRequests": 3,
  "recentBattles": [],
  "activeCommandersList": [],
  "recentRequests": [],
  "recentActivity": [],
  "systemHealth": {
    "auth": { "status": "healthy", "latency": 42 },
    "firestore": { "status": "healthy", "latency": 35 },
    "messaging": { "status": "healthy", "latency": 28 },
    "ai": { "status": "healthy" },
    "storage": { "status": "warning" }
  }
}
```

System health checks: auth (Firebase Auth latency), firestore (read latency), messaging (conversations collection), ai (API key present), storage (bucket configured).

---

### GET `/api/executive/analytics-data`
Time-series analytics with daily/weekly battle counts, user registrations, commander activity, participation, category usage, and AI usage over the last 30 days.

**Auth:** Required  
**Role:** Executive

**Response `200`:**
```json
{
  "dailyBattles": [{ "date": "2026-07-01", "value": 5 }, ...],
  "weeklyBattles": [{ "date": "2026-06-28", "value": 12 }, ...],
  "monthlyUsers": [{ "date": "2026-07-01", "value": 3 }, ...],
  "commanderActivity": [{ "name": "Commander A", "value": 15 }, ...],
  "gladiatorParticipation": [{ "date": "2026-07-01", "value": 45 }, ...],
  "categoryUsage": [{ "name": "Science", "value": 120 }, ...],
  "aiUsage": [{ "date": "2026-07-01", "value": 8 }, ...],
  "messageActivity": [{ "date": "2026-07-01", "value": 60 }, ...],
  "summary": {
    "totalBattles": 80,
    "totalUsers": 177,
    "totalCommanders": 25,
    "totalGladiators": 150,
    "totalQuestions": 450,
    "totalConversations": 45
  }
}
```

---

### GET `/api/executive/profile`
Get the authenticated executive's profile with recent activity.

**Auth:** Required  
**Role:** Executive

**Response `200`:**
```json
{
  "profile": { "uid": "...", "name": "Admin", "email": "admin@example.com", "avatar": "🤖", "role": "executive", "lastLogin": "...", "createdAt": "...", "lastActivity": 1700000000000, "actionCount": 42 },
  "recentActivity": [{ "id": "...", "action": "profile_updated", "target": "...", "timestamp": 1700000000000 }]
}
```

---

### PATCH `/api/executive/profile`
Update profile (name, avatar, password).

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{
  "name": "New Name",
  "avatar": "🦸",
  "password": "newpassword123"
}
```

All fields are optional. Password must be at least 6 characters.

---

### GET `/api/executive/settings`
Get platform settings.

**Auth:** Required  
**Role:** Executive

**Response `200`:**
```json
{
  "settings": {
    "institutionName": "",
    "institutionLogo": "",
    "theme": "system",
    "workspaceName": "Knowledge Arena",
    "auth": { "allowCommanderSelfRegistration": false, "allowGladiatorRegistration": true },
    "battle": { "questionTimerDefault": 30, "maxQuestions": 50, "defaultDifficulty": "medium", "autoEndBattle": false, "leaderboardVisibility": "public" },
    "ai": { "enabled": true, "defaultModel": "gemini-2.5-flash-lite", "maxPdfSize": 10 },
    "messaging": { "enableAnnouncements": true, "enableChat": true },
    "exportPreferences": { "includeStudentNames": true, "includeScores": true, "includeTimestamps": true }
  }
}
```

---

### PUT `/api/executive/settings`
Update platform settings (merge with existing).

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{
  "settings": { "institutionName": "My School", "battle": { "defaultDifficulty": "hard" } }
}
```

---

### GET `/api/executive/search`
Global search across users, questions, battles, audit logs, conversations, and announcements.

**Auth:** Required  
**Role:** Executive

**Query params:** `?q=searchterm` (minimum 2 characters)

**Response `200`:**
```json
{
  "results": [
    { "type": "Commander", "id": "abc123", "title": "John Doe", "subtitle": "commander · john@example.com", "href": "/executive/commanders", "metadata": {} }
  ],
  "total": 12
}
```

---

### GET `/api/executive/requests`
List executive requests (optionally filtered by status).

**Auth:** Required  
**Role:** Executive

**Query params:** `?status=pending`

**Response `200`:**
```json
{
  "requests": [{ "id": "...", "title": "Request", "type": "question_bank", "status": "pending", "commanderId": "...", "createdAt": 1700000000000, ... }]
}
```

---

### PATCH `/api/executive/requests`
Handle a request (approve/reject/complete).

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{
  "id": "request-id",
  "status": "approved",
  "comment": "Looks good!",
  "replyAttachments": []
}
```

---

### DELETE `/api/executive/requests`
Delete a request. Cascades to related notifications.

**Auth:** Required  
**Role:** Executive

**Query params:** `?id=request-id`

---

### GET `/api/executive/notifications`
Get notifications with unread count.

**Auth:** Required  
**Role:** Executive

**Query params:** `?unreadOnly=true`

**Response `200`:**
```json
{
  "notifications": [{ "id": "...", "type": "new_message", "title": "New Message", "description": "...", "read": false, "createdAt": 1700000000000, "userId": "...", "link": "/executive/messages" }],
  "unreadCount": 5
}
```

---

### PATCH `/api/executive/notifications`
Mark notifications as read.

**Auth:** Required  
**Role:** Executive

**Request Body (individual):**
```json
{ "ids": ["notif1", "notif2"] }
```

**Request Body (all):**
```json
{ "markAllRead": true }
```

---

### DELETE `/api/executive/notifications/[id]`
Delete a single notification.

**Auth:** Required  
**Role:** Executive

---

### GET `/api/executive/audit-logs`
Paginated audit log listing with cursor.

**Auth:** Required  
**Role:** Executive

**Query params:** `?action=profile_updated&actorRole=executive&dateFrom=1700000000000&dateTo=1700000000000&cursor=doc-id`

**Response `200`:**
```json
{
  "logs": [{ "id": "...", "timestamp": 1700000000000, "actor": "...", "actorRole": "executive", "action": "profile_updated", "target": "...", "metadata": {} }],
  "nextCursor": "doc-id",
  "hasMore": false,
  "filters": { "actions": ["profile_updated"], "roles": ["executive"] }
}
```

---

### GET `/api/executive/export`
Export data in CSV or JSON format.

**Auth:** Required  
**Role:** Executive

**Query params:** `?type=users&format=csv`

**Types:** `users`, `questions`, `battles`, `audit-logs`, `analytics`

**Response:** File download with appropriate `Content-Disposition` header.

---

### POST `/api/executive/backup/export`
Create a full platform backup as JSON.

**Auth:** Required  
**Role:** Executive

**Response `200`:**
```json
{
  "metadata": { "id": "backup_1700000000000", "exportedAt": "2026-07-01T00:00:00.000Z", "exportedBy": "...", "version": "1.0", "collections": ["users", "question_bank", "quizzes", "auditLogs", "conversations", "announcements", "platform_settings", "executive_requests"] },
  "data": { "users": [{ "id": "...", "email": "..." }], ... }
}
```

---

### POST `/api/executive/backup/import`
Restore a platform backup.

**Auth:** Required  
**Role:** Executive

**Request Body:** Full backup JSON (as returned by export endpoint)

**Response `200`:**
```json
{ "success": true, "totalDocs": 2500, "collections": 8 }
```

---

## Commander

### GET `/api/commander/dashboard`
Commander dashboard with battle stats, active/upcoming/recent battles, and pending requests count.

**Auth:** Required  
**Role:** Commander

**Response `200`:**
```json
{
  "totalBattles": 15,
  "activeBattles": [{ "id": "ABC123", "title": "Science Quiz", "participantCount": 5, "createdAt": 1700000000000 }],
  "upcomingBattles": [],
  "recentBattles": [],
  "stats": { "totalBattles": 15, "activeCount": 1, "completedCount": 10, "totalParticipants": 45, "averageScore": 620 },
  "pendingRequestsCount": 2
}
```

---

### GET `/api/commander/requests`
List all requests made by the authenticated commander.

**Auth:** Required  
**Role:** Commander

**Response `200`:**
```json
{
  "requests": [{ "id": "...", "title": "Request Title", "type": "question_bank", "status": "pending", "commanderId": "...", "createdAt": 1700000000000, "handledAt": null, "handledBy": null, "executiveComment": null }]
}
```

---

### POST `/api/commander/requests`
Create a new request to the Executive.

**Auth:** Required  
**Role:** Commander

**Request Body:**
```json
{
  "title": "Need more questions",
  "type": "question_bank",
  "description": "Description of request",
  "attachments": []
}
```

**Types:** `question_bank`, `student_report`, `arena_approval`, `other`

**Response `201`:**
```json
{ "id": "request-id", "success": true }
```

---

## Gladiator

### GET `/api/gladiator/dashboard`
Gladiator profile with battle history, stats, and active battle info.

**Auth:** Required  
**Role:** Gladiator

**Response `200`:**
```json
{
  "stats": { "totalBattles": 25, "finishedCount": 20, "wins": 5, "averageScore": 580, "accuracy": 20 },
  "recentBattles": [{ "quizId": "ABC123", "title": "Science Quiz", "score": 750, "status": "finished", "created_at": 1700000000000 }],
  "activeBattle": { "id": "ABC456", "title": "Math Battle" }
}
```

---

## AI Endpoints

### GET `/api/knowledge/summary`
AI-generated knowledge summary for the commander.

**Auth:** Required  
**Role:** Commander  
**Rate limit:** 10/min per user

**Response `200`:**
```json
{
  "summary": "AI-generated text summary..."
}
```

---

### GET `/api/decision-support/summary`
AI-generated decision support summary.

**Auth:** Required  
**Role:** Commander  
**Rate limit:** 10/min per user

**Response `200`:**
```json
{
  "summary": "AI-generated decision support text..."
}
```

---

### GET `/api/predictions/summary`
AI-generated prediction summary.

**Auth:** Required  
**Role:** Commander  
**Rate limit:** 10/min per user

**Response `200`:**
```json
{
  "summary": "AI-generated prediction text..."
}
```

---

### POST `/api/debug-pdf`
Debug PDF parsing — validates base64 PDF data and returns extraction diagnostics.

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{
  "pdfDataUri": "data:application/pdf;base64,JVBERi0..."
}
```

**Response `200`:**
```json
{
  "success": true,
  "pages": 3,
  "textLength": 4500,
  "pagesWithNoText": 0,
  "isImageOnly": false,
  "first300": "Extracted text first 300 chars...",
  "logs": ["[DEBUG] Data URI length: 12345", "..."]
}
```

---

## Audit Logging

### POST `/api/audit/log`
Record a custom audit log entry.

**Auth:** Required  
**Role:** Executive or Commander

**Request Body:**
```json
{
  "action": "custom_action",
  "target": "target-id",
  "metadata": { "key": "value" }
}
```

**Response `200`:**
```json
{ "success": true }
```

---

## Messaging — Conversations

### GET `/api/messaging/conversations`
List conversations the authenticated user is a participant in. Results sorted by last activity.

**Auth:** Required  
**Role:** Executive or Commander

**Response `200`:**
```json
{
  "conversations": [
    {
      "id": "conv-id",
      "participants": ["uid1", "uid2"],
      "participantNames": { "uid1": "Executive Name", "uid2": "Commander Name" },
      "unreadCount": { "uid1": 0, "uid2": 3 },
      "lastMessage": { "text": "Hello!", "senderId": "uid2", "senderRole": "commander", "timestamp": 1700000000000, "hasAttachments": false },
      "lastActivity": 1700000000000,
      "createdAt": 1700000000000
    }
  ]
}
```

---

### POST `/api/messaging/conversations`
Create a new conversation with a commander.

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{ "commanderId": "commander-uid" }
```

**Response `200`:**
```json
{
  "conversation": { "id": "conv-id", "participants": ["exec-uid", "commander-uid"], "participantRoles": {}, "unreadCount": {}, "lastActivity": 1700000000000, "createdAt": 1700000000000 }
}
```

Duplicates are prevented (checks both participant orderings in a transaction).

---

### DELETE `/api/messaging/conversations/[id]`
Delete a conversation and all its messages.

**Auth:** Required  
**Role:** Executive or Commander

---

### PATCH `/api/messaging/conversations/[id]`
Leave a conversation (Commander only). If no participants remain, the conversation is deleted.

**Auth:** Required  
**Role:** Commander

---

### POST `/api/messaging/conversations/[id]/read`
Mark conversation as read (reset unread count for the authenticated user).

**Auth:** Required  
**Role:** Executive or Commander

---

### GET `/api/messaging/conversations/[id]/messages`
Get messages in a conversation (cursor-based pagination).

**Auth:** Required (must be participant)  
**Role:** Executive or Commander

**Query params:** `?cursor=msg-id&limit=100`

**Response `200`:**
```json
{
  "messages": [{ "id": "msg-id", "text": "Hello", "senderId": "...", "senderRole": "executive", "timestamp": 1700000000000, "attachments": [] }],
  "nextCursor": "last-msg-id"
}
```

---

### POST `/api/messaging/conversations/[id]/messages`
Send a message in a conversation.

**Auth:** Required (must be participant)  
**Role:** Executive or Commander

**Request Body:**
```json
{
  "text": "Message content",
  "attachments": [{ "name": "file.pdf", "type": "application/pdf", "data": "base64data" }],
  "idempotencyKey": "client-generated-uuid"
}
```

Attachments validated: max 10 per message, 500KB per file, 5MB total, restricted MIME types.

**Response `200`:**
```json
{
  "message": { "id": "msg-id", "text": "Message content", "senderId": "...", "senderRole": "executive", "timestamp": 1700000000000 }
}
```

---

### DELETE `/api/messaging/conversations/[id]/messages/[messageId]`
Delete a single message.

**Auth:** Required  
**Role:** Executive or Commander (Executive can delete any message; Commander can only delete their own)

---

## Messaging — Announcements

### GET `/api/messaging/announcements`
List announcements. Commanders only see announcements targeting them (all_commanders or specific).

**Auth:** Required  
**Role:** Executive or Commander

**Response `200`:**
```json
{
  "announcements": [{ "id": "...", "text": "Announcement content", "senderId": "...", "targetRole": "all_commanders", "targetId": null, "readBy": ["uid1"], "createdAt": 1700000000000 }]
}
```

---

### POST `/api/messaging/announcements`
Create an announcement.

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{
  "text": "Announcement content",
  "targetCommanderId": "optional-specific-uid"
}
```

Omitting `targetCommanderId` sends to all Commanders.

---

### PUT `/api/messaging/announcements`
Edit an announcement.

**Auth:** Required  
**Role:** Executive

**Request Body:**
```json
{ "id": "announcement-id", "text": "Updated content" }
```

---

### DELETE `/api/messaging/announcements`
Delete an announcement.

**Auth:** Required  
**Role:** Executive

**Query params:** `?id=announcement-id`

---

### POST `/api/messaging/announcements/[id]/read`
Mark an announcement as read by the authenticated Commander.

**Auth:** Required  
**Role:** Commander

---

## Messaging — Commanders

### GET `/api/messaging/commanders`
List active commanders for initiating conversations (with optional search).

**Auth:** Required  
**Role:** Executive

**Query params:** `?search=name`

**Response `200`:**
```json
{
  "commanders": [{ "id": "uid", "name": "Commander Name", "email": "commander@example.com", "avatar": "🤖", "lastActive": 1700000000000 }]
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Human-readable error message"
}
```

| Status Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (invalid input, missing fields) |
| `401` | Unauthorized (missing/invalid auth token) |
| `403` | Forbidden (insufficient role) |
| `404` | Resource not found |
| `409` | Conflict (e.g., email already exists) |
| `429` | Rate limited (check `Retry-After` header) |
| `500` | Internal server error |
