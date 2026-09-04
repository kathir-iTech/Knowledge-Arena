import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  metadata?: Record<string, unknown>;
}

const MAX_PER_COLLECTION = 200;
const MAX_PER_TYPE = 8;
const MAX_TOTAL = 60;

function relevance(query: string, ...fields: (string | undefined | null)[]): number {
  let score = -1;
  for (const raw of fields) {
    const field = (raw || '').toLowerCase();
    if (!field) continue;
    if (field === query) score = Math.max(score, 4);
    else if (field.startsWith(query)) score = Math.max(score, 3);
    else if (field.includes(query)) score = Math.max(score, 2);
  }
  return score;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = await enforceRateLimit(`executive:search:${auth.uid}`, Limits.SEARCH_PER_USER);
    if (_rl) return _rl;

    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get('q')?.trim();
    if (!rawQuery || rawQuery.length < 2) {
      return NextResponse.json({ results: [], total: 0 });
    }

    const query = rawQuery.toLowerCase();
    const db = getAdminDb();
    const results: SearchHit[] = [];
    const seen = new Set<string>();

    const push = (hit: SearchHit, score: number) => {
      const key = `${hit.type}:${hit.id}`;
      if (seen.has(key)) return;
      const typeCount = results.filter(r => r.type === hit.type).length;
      if (typeCount >= MAX_PER_TYPE) return;
      seen.add(key);
      const titleLower = hit.title.toLowerCase();
      const matchIndex = titleLower.indexOf(query);
      const highlight = matchIndex >= 0
        ? { start: matchIndex, end: matchIndex + query.length }
        : null;
      results.push({ ...hit, metadata: { ...(hit.metadata || {}), score, highlight } });
    };

    const [
      usersSnap,
      questionsSnap,
      quizzesSnap,
      auditSnap,
      conversationsSnap,
      announcementsSnap,
      notificationsSnap,
      securitySnap,
      aiLogsSnap,
      requestsSnap,
    ] = await Promise.all([
      db.collection('users').select('name', 'displayName', 'email', 'role', 'deleted', 'avatar', 'disabled').limit(MAX_PER_COLLECTION).get(),
      db.collection('question_bank').select('question_text', 'text', 'subject', 'category', 'difficulty').limit(MAX_PER_COLLECTION).get(),
      db.collection('quizzes').select('title', 'name', 'status', 'participantCount', 'created_by', 'difficulty').limit(MAX_PER_COLLECTION).get(),
      db.collection('auditLogs').select('actor', 'target', 'action', 'timestamp', 'actorRole').orderBy('timestamp', 'desc').limit(100).get(),
      db.collection('conversations').select('participants', 'participantRoles', 'lastMessage', 'lastActivity', 'messageCount').limit(MAX_PER_COLLECTION).get(),
      db.collection('announcements').select('text', 'title', 'content', 'message', 'targetRole', 'targetId', 'senderId', 'createdAt', 'readBy').limit(MAX_PER_COLLECTION).get(),
      db.collection('notifications').select('title', 'description', 'type', 'userId', 'createdAt').where('userId', '==', auth.uid).limit(MAX_PER_COLLECTION).get(),
      db.collection('security_logs').select('event', 'actor', 'target', 'detail', 'createdAt').limit(MAX_PER_COLLECTION).get(),
      db.collection('ai_logs').select('model', 'userId', 'userRole', 'difficulty', 'error', 'success', 'createdAt').limit(MAX_PER_COLLECTION).get(),
      db.collection('executive_requests').select('title', 'type', 'status', 'commanderEmail', 'createdAt').limit(MAX_PER_COLLECTION).get(),
    ]);

    // Users (commanders, gladiators, executives)
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (data.deleted) continue;
      const name = (data.name || data.displayName || '') as string;
      const email = (data.email || '') as string;
      const score = relevance(query, name, email, doc.id);
      if (score < 0) continue;
      const role = (data.role as string) || 'user';
      const roleType = role === 'commander' ? 'Commander' : role === 'gladiator' ? 'Gladiator' : 'Executive';
      push({
        type: roleType,
        id: doc.id,
        title: name || doc.id,
        subtitle: `${role}${email ? ` · ${email}` : ''}${data.disabled ? ' · disabled' : ''}`,
        href: role === 'commander'
          ? `/executive/commanders/${doc.id}`
          : role === 'gladiator'
            ? `/executive/students/${doc.id}`
            : `/executive/users/${doc.id}`,
        metadata: { uid: doc.id, role, email, avatar: data.avatar },
      }, score);
    }

    // Question bank
    for (const doc of questionsSnap.docs) {
      const data = doc.data();
      const text = (data.question_text || data.text || '') as string;
      const category = (data.category || data.subject || '') as string;
      const difficulty = (data.difficulty || '') as string;
      const score = relevance(query, text, category, difficulty);
      if (score < 0) continue;
      push({
        type: 'Question',
        id: doc.id,
        title: text.slice(0, 80),
        subtitle: `Question Bank · ${category || 'General'}${difficulty ? ` · ${difficulty}` : ''}`,
        href: `/executive/question-bank/${doc.id}`,
        metadata: { category },
      }, score);
    }

    // Battles (title or battle code / id)
    for (const doc of quizzesSnap.docs) {
      const data = doc.data();
      const title = (data.title || data.name || '') as string;
      const creatorId = (data.created_by || '') as string;
      const score = relevance(query, title, doc.id, creatorId);
      if (score < 0) continue;
      push({
        type: 'Battle',
        id: doc.id,
        title: title || 'Untitled Battle',
        subtitle: `Status: ${data.status || 'unknown'} · ${data.participantCount || 0} participants · Code: ${doc.id}`,
        href: `/executive/battles/${doc.id}`,
        metadata: { status: data.status, roomCode: doc.id },
      }, score);
    }

    // Audit logs (action, actor uid, target)
    for (const doc of auditSnap.docs) {
      const data = doc.data();
      const action = (data.action || '') as string;
      const actor = (data.actor || '') as string;
      const target = (data.target || '') as string;
      const score = relevance(query, action, actor, target);
      if (score < 0) continue;
      push({
        type: 'Audit Log',
        id: doc.id,
        title: (action || '').replace(/_/g, ' '),
        subtitle: `by ${actor}${target ? ` → ${target}` : ''}`,
        href: '/executive/audit-logs',
        metadata: { timestamp: data.timestamp, actor, action, target },
      }, score);
    }

    // Security logs (event, actor, target)
    for (const doc of securitySnap.docs) {
      const data = doc.data();
      const event = (data.event || '') as string;
      const actor = (data.actor || '') as string;
      const target = (data.target || '') as string;
      const detail = (data.detail || '') as string;
      const score = relevance(query, event, actor, target, detail);
      if (score < 0) continue;
      push({
        type: 'Security Log',
        id: doc.id,
        title: (event || '').replace(/_/g, ' '),
        subtitle: `by ${actor}${target ? ` → ${target}` : ''}`,
        href: '/executive/security',
        metadata: { timestamp: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, event },
      }, score);
    }

    // AI logs (model, user id, difficulty, error)
    for (const doc of aiLogsSnap.docs) {
      const data = doc.data();
      const model = (data.model || '') as string;
      const userId = (data.userId || '') as string;
      const difficulty = (data.difficulty || '') as string;
      const error = (data.error || '') as string;
      const score = relevance(query, model, userId, difficulty, error);
      if (score < 0) continue;
      push({
        type: 'AI Log',
        id: doc.id,
        title: `${model || 'AI'} generation · ${data.success ? 'success' : 'failed'}`,
        subtitle: `by ${userId}${difficulty ? ` · ${difficulty}` : ''}`,
        href: '/executive/ai-logs',
        metadata: { createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, success: !!data.success },
      }, score);
    }

    // Conversations — match participant UIDs and last message text
    const userIds = usersSnap.docs.filter(d => {
      const data = d.data();
      return relevance(query, data.name, data.displayName, data.email) >= 0;
    }).map(d => d.id);
    const uidQuerySet = new Set(userIds);
    for (const doc of conversationsSnap.docs) {
      const data = doc.data();
      const participants = (data.participants || []) as string[];
      const lastMessage = (data.lastMessage || '') as string;
      const participantMatched = participants.some(uid => uidQuerySet.has(uid) || uid.toLowerCase().includes(query));
      const score = participantMatched || lastMessage.toLowerCase().includes(query)
        ? relevance(query, lastMessage) + (participantMatched ? 2 : 0)
        : -1;
      if (score < 0) continue;
      push({
        type: 'Conversation',
        id: doc.id,
        title: lastMessage || `Conversation with ${participants.length} participant${participants.length !== 1 ? 's' : ''}`,
        subtitle: `${participants.length} participants${lastMessage ? ` · ${lastMessage.slice(0, 60)}` : ''}`,
        href: '/executive/messages',
        metadata: { participants, lastActivity: data.lastActivity?.toMillis?.() ?? data.lastActivity ?? null },
      }, score);
    }

    // Announcements — text/title/content + sender
    for (const doc of announcementsSnap.docs) {
      const data = doc.data();
      const text = (data.text || data.title || data.content || data.message || '') as string;
      const targetRole = (data.targetRole || 'all') as string;
      const senderId = (data.senderId || '') as string;
      const score = relevance(query, text, targetRole, senderId);
      if (score < 0) continue;
      push({
        type: 'Announcement',
        id: doc.id,
        title: text.slice(0, 60),
        subtitle: `To: ${targetRole.replace(/_/g, ' ')} · ${(data.readBy || []).length} read`,
        href: `/executive/announcements/${doc.id}`,
        metadata: { createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, targetRole },
      }, score);
    }

    // Notifications (own only) — title/description
    for (const doc of notificationsSnap.docs) {
      const data = doc.data();
      const title = (data.title || '') as string;
      const description = (data.description || '') as string;
      const type = (data.type || '') as string;
      const score = relevance(query, title, description, type);
      if (score < 0) continue;
      push({
        type: 'Notification',
        id: doc.id,
        title: title || 'Notification',
        subtitle: description.slice(0, 80) || type.replace(/_/g, ' '),
        href: `/executive/notifications/${doc.id}`,
        metadata: { createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, type, read: !!data.read },
      }, score);
    }

    // Requests — title, type, commander email
    for (const doc of requestsSnap.docs) {
      const data = doc.data();
      const title = (data.title || '') as string;
      const type = (data.type || '') as string;
      const commanderEmail = (data.commanderEmail || '') as string;
      const status = (data.status || '') as string;
      const score = relevance(query, title, type, commanderEmail, status);
      if (score < 0) continue;
      push({
        type: 'Request',
        id: doc.id,
        title: title || 'Untitled Request',
        subtitle: `${type.replace(/_/g, ' ')} · ${commanderEmail} · ${status}`,
        href: '/executive/requests',
        metadata: { status, createdAt: data.createdAt },
      }, score);
    }

    results.sort((a, b) => {
      const sa = (a.metadata?.score as number) || 0;
      const sb = (b.metadata?.score as number) || 0;
      if (sb !== sa) return sb - sa;
      return a.title.localeCompare(b.title);
    });

    const limited = results.slice(0, MAX_TOTAL);
    return NextResponse.json({ results: limited, total: results.length });
  } catch (err: any) {
    console.error('[Search] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}