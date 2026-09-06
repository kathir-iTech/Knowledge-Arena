import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import {
  SEARCH_RECENCY_LAMBDA,
  tokenizeQuery,
  tokenizeDocText,
  baseRelevance,
  docCreatedAtMs,
  computeDf,
  tfidfRecencyScore,
  passesResidualFilter,
} from '@/lib/search';

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
// Recency decay weight for Score(d,q) = sum TF*log(N/DF) * e^{-lambda*dt}.
const RECENCY_LAMBDA = SEARCH_RECENCY_LAMBDA; // 0.05

function relevance(query: string, ...fields: (string | undefined | null)[]): number {
  return baseRelevance(query, ...fields);
}

/**
 * Base score with residual token fallback.
 * Legacy phrase match passes through; multi-term queries also pass when every
 * token appears (order-independent), scored by the best single-token match.
 */
function baseWithResidual(
  query: string,
  queryTokens: string[],
  searchableLower: string,
  fields: Array<string | undefined | null>,
): number {
  const direct = baseRelevance(query, ...fields);
  if (!queryTokens.length) return direct;
  if (passesResidualFilter(searchableLower, queryTokens)) {
    let best = direct;
    for (const t of queryTokens) {
      const s = baseRelevance(t, ...fields);
      if (s > best) best = s;
    }
    return Math.max(best, 2);
  }
  return direct;
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
    const queryTokens = tokenizeQuery(rawQuery);
    const firstTerm = queryTokens[0];
    const nowMs = Date.now();
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

    // question_bank: server-side narrowing via searchTokens array-contains
    // first-term, with in-memory residual for remaining terms. Falls back to a
    // plain select() scan when the token path is unavailable or yields nothing
    // (legacy docs without tokens + substring queries must still recall).
    const questionSelect = () =>
      db.collection('question_bank').select('question_text', 'text', 'subject', 'category', 'difficulty', 'createdAt', 'created_at', 'searchTokens');
    let questionsSnap;
    try {
      if (firstTerm) {
        const tokenSnap = await questionSelect()
          .where('searchTokens', 'array-contains', firstTerm)
          .limit(MAX_PER_COLLECTION)
          .get();
        questionsSnap = tokenSnap.empty
          ? await questionSelect().limit(MAX_PER_COLLECTION).get()
          : tokenSnap;
      } else {
        questionsSnap = await questionSelect().limit(MAX_PER_COLLECTION).get();
      }
    } catch {
      questionsSnap = await questionSelect().limit(MAX_PER_COLLECTION).get();
    }

    const [
      usersSnap,
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
      db.collection('quizzes').select('title', 'name', 'status', 'participantCount', 'created_by', 'difficulty', 'created_at').limit(MAX_PER_COLLECTION).get(),
      db.collection('auditLogs').select('actor', 'target', 'action', 'timestamp', 'actorRole').orderBy('timestamp', 'desc').limit(100).get(),
      db.collection('conversations').select('participants', 'participantRoles', 'lastMessage', 'lastActivity', 'messageCount').limit(MAX_PER_COLLECTION).get(),
      db.collection('announcements').select('text', 'title', 'content', 'message', 'targetRole', 'targetId', 'senderId', 'createdAt', 'readBy').limit(MAX_PER_COLLECTION).get(),
      // Scoped to the caller — never leak other users' notifications.
      db.collection('notifications').select('title', 'description', 'type', 'userId', 'createdAt').where('userId', '==', auth.uid).limit(MAX_PER_COLLECTION).get(),
      db.collection('security_logs').select('event', 'actor', 'target', 'detail', 'createdAt').limit(MAX_PER_COLLECTION).get(),
      db.collection('ai_logs').select('model', 'userId', 'userRole', 'difficulty', 'error', 'success', 'createdAt').limit(MAX_PER_COLLECTION).get(),
      db.collection('executive_requests').select('title', 'type', 'status', 'commanderEmail', 'createdAt').limit(MAX_PER_COLLECTION).get(),
    ]);

    // Generic per-collection TF-IDF + recency scorer.
    // DF is computed in-memory from the fetched docs (no new collection).
    // Final Score(d,q) = base(4/3/2) + sum TF*log(N/DF) * e^{-lambda*dt}.
    const scoreCollection = (
      docs: FirebaseFirestore.QueryDocumentSnapshot[],
      searchableOf: (data: Record<string, unknown>, id: string) => { text: string; fields: Array<string | undefined | null>; createdMs: number | null },
    ) => {
      const searchables = docs.map(d => {
        const data = d.data() as Record<string, unknown>;
        const s = searchableOf(data, d.id);
        const lower = s.text.toLowerCase();
        return { id: d.id, data, lower, tokens: tokenizeDocText(lower), createdMs: s.createdMs, fields: s.fields };
      });
      const df = computeDf(searchables.map(s => s.tokens), queryTokens);
      const n = searchables.length;
      const out = new Map<string, { base: number; combined: number }>();
      for (const s of searchables) {
        const base = baseWithResidual(query, queryTokens, s.lower, s.fields);
        if (base < 0) continue;
        const boost = queryTokens.length
          ? tfidfRecencyScore(s.tokens, queryTokens, df, n, s.createdMs, nowMs)
          : 0;
        void RECENCY_LAMBDA;
        out.set(s.id, { base, combined: base + boost });
      }
      return out;
    };

    // Users (commanders, gladiators, executives)
    {
      const scores = scoreCollection(usersSnap.docs, (data, id) => {
        if ((data as Record<string, unknown>).deleted) return { text: '', fields: [], createdMs: null };
        const name = String(data.name || data.displayName || '');
        const email = String(data.email || '');
        return {
          text: [name, email, id].join(' '),
          fields: [name, email, id],
          createdMs: docCreatedAtMs(data as Record<string, unknown>),
        };
      });
      for (const doc of usersSnap.docs) {
        const data = doc.data();
        if (data.deleted) continue;
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const name = (data.name || data.displayName || '') as string;
        const email = (data.email || '') as string;
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
        }, hit.combined);
      }
    }

    // Question bank (server-narrowed by searchTokens first-term above)
    {
      const scores = scoreCollection(questionsSnap.docs, (data) => {
        const text = String(data.question_text || data.text || '');
        const category = String(data.category || data.subject || '');
        const difficulty = String(data.difficulty || '');
        return {
          text: [text, category, difficulty].join(' '),
          fields: [text, category, difficulty],
          createdMs: docCreatedAtMs(data as Record<string, unknown>),
        };
      });
      for (const doc of questionsSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const text = (data.question_text || data.text || '') as string;
        const category = (data.category || data.subject || '') as string;
        const difficulty = (data.difficulty || '') as string;
        push({
          type: 'Question',
          id: doc.id,
          title: text.slice(0, 80),
          subtitle: `Question Bank · ${category || 'General'}${difficulty ? ` · ${difficulty}` : ''}`,
          href: `/executive/question-bank/${doc.id}`,
          metadata: { category },
        }, hit.combined);
      }
    }

    // Battles (title or battle code / id)
    {
      const scores = scoreCollection(quizzesSnap.docs, (data, id) => {
        const title = String(data.title || data.name || '');
        const creatorId = String(data.created_by || '');
        return {
          text: [title, id, creatorId].join(' '),
          fields: [title, id, creatorId],
          createdMs: docCreatedAtMs(data as Record<string, unknown>),
        };
      });
      for (const doc of quizzesSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const title = (data.title || data.name || '') as string;
        push({
          type: 'Battle',
          id: doc.id,
          title: title || 'Untitled Battle',
          subtitle: `Status: ${data.status || 'unknown'} · ${data.participantCount || 0} participants · Code: ${doc.id}`,
          href: `/executive/battles/${doc.id}`,
          metadata: { status: data.status, roomCode: doc.id },
        }, hit.combined);
      }
    }

    // Audit logs (action, actor uid, target)
    {
      const scores = scoreCollection(auditSnap.docs, (data) => {
        const action = String(data.action || '');
        const actor = String(data.actor || '');
        const target = String(data.target || '');
        return { text: [action, actor, target].join(' '), fields: [action, actor, target], createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      for (const doc of auditSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const action = (data.action || '') as string;
        const actor = (data.actor || '') as string;
        const target = (data.target || '') as string;
        push({
          type: 'Audit Log',
          id: doc.id,
          title: (action || '').replace(/_/g, ' '),
          subtitle: `by ${actor}${target ? ` → ${target}` : ''}`,
          href: '/executive/audit-logs',
          metadata: { timestamp: data.timestamp, actor, action, target },
        }, hit.combined);
      }
    }

    // Security logs (event, actor, target)
    {
      const scores = scoreCollection(securitySnap.docs, (data) => {
        const event = String(data.event || '');
        const actor = String(data.actor || '');
        const target = String(data.target || '');
        const detail = String(data.detail || '');
        return { text: [event, actor, target, detail].join(' '), fields: [event, actor, target, detail], createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      for (const doc of securitySnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const event = (data.event || '') as string;
        const actor = (data.actor || '') as string;
        const target = (data.target || '') as string;
        push({
          type: 'Security Log',
          id: doc.id,
          title: (event || '').replace(/_/g, ' '),
          subtitle: `by ${actor}${target ? ` → ${target}` : ''}`,
          href: '/executive/security',
          metadata: { timestamp: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, event },
        }, hit.combined);
      }
    }

    // AI logs (model, user id, difficulty, error)
    {
      const scores = scoreCollection(aiLogsSnap.docs, (data) => {
        const model = String(data.model || '');
        const userId = String(data.userId || '');
        const difficulty = String(data.difficulty || '');
        const error = String(data.error || '');
        return { text: [model, userId, difficulty, error].join(' '), fields: [model, userId, difficulty, error], createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      for (const doc of aiLogsSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const model = (data.model || '') as string;
        const userId = (data.userId || '') as string;
        const difficulty = (data.difficulty || '') as string;
        push({
          type: 'AI Log',
          id: doc.id,
          title: `${model || 'AI'} generation · ${data.success ? 'success' : 'failed'}`,
          subtitle: `by ${userId}${difficulty ? ` · ${difficulty}` : ''}`,
          href: '/executive/ai-logs',
          metadata: { createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, success: !!data.success },
        }, hit.combined);
      }
    }

    // Conversations — match participant UIDs and last message text
    const userIds = usersSnap.docs.filter(d => {
      const data = d.data();
      return relevance(query, data.name, data.displayName, data.email) >= 0
        || (queryTokens.length > 0 && passesResidualFilter(
          [String(data.name || ''), String(data.displayName || ''), String(data.email || '')].join(' ').toLowerCase(),
          queryTokens,
        ));
    }).map(d => d.id);
    const uidQuerySet = new Set(userIds);
    {
      const searchables = conversationsSnap.docs.map(d => {
        const data = d.data();
        const lastMessage = String(data.lastMessage || '');
        const lower = lastMessage.toLowerCase();
        return { id: d.id, data, lower, tokens: tokenizeDocText(lower), createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      const df = computeDf(searchables.map(s => s.tokens), queryTokens);
      const n = searchables.length;
      for (const s of searchables) {
        const data = s.data;
        const participants = (data.participants || []) as string[];
        const lastMessage = (data.lastMessage || '') as string;
        const participantMatched = participants.some(uid => uidQuerySet.has(uid) || uid.toLowerCase().includes(query));
        let base = -1;
        if (participantMatched || lastMessage.toLowerCase().includes(query)) {
          base = relevance(query, lastMessage) + (participantMatched ? 2 : 0);
        }
        if (base < 0 && queryTokens.length > 0 && passesResidualFilter(s.lower, queryTokens)) {
          base = Math.max(baseRelevance(queryTokens[0], lastMessage), 2) + (participantMatched ? 2 : 0);
        }
        if (base < 0) continue;
        const boost = queryTokens.length ? tfidfRecencyScore(s.tokens, queryTokens, df, n, s.createdMs, nowMs) : 0;
        push({
          type: 'Conversation',
          id: s.id,
          title: lastMessage || `Conversation with ${participants.length} participant${participants.length !== 1 ? 's' : ''}`,
          subtitle: `${participants.length} participants${lastMessage ? ` · ${lastMessage.slice(0, 60)}` : ''}`,
          href: '/executive/messages',
          metadata: { participants, lastActivity: data.lastActivity?.toMillis?.() ?? data.lastActivity ?? null },
        }, base + boost);
      }
    }

    // Announcements — text/title/content + sender
    {
      const scores = scoreCollection(announcementsSnap.docs, (data) => {
        const text = String(data.text || data.title || data.content || data.message || '');
        const targetRole = String(data.targetRole || 'all');
        const senderId = String(data.senderId || '');
        return { text: [text, targetRole, senderId].join(' '), fields: [text, targetRole, senderId], createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      for (const doc of announcementsSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const text = (data.text || data.title || data.content || data.message || '') as string;
        const targetRole = (data.targetRole || 'all') as string;
        push({
          type: 'Announcement',
          id: doc.id,
          title: text.slice(0, 60),
          subtitle: `To: ${targetRole.replace(/_/g, ' ')} · ${(data.readBy || []).length} read`,
          href: `/executive/announcements/${doc.id}`,
          metadata: { createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, targetRole },
        }, hit.combined);
      }
    }

    // Notifications (own only) — title/description
    {
      const scores = scoreCollection(notificationsSnap.docs, (data) => {
        const title = String(data.title || '');
        const description = String(data.description || '');
        const type = String(data.type || '');
        return { text: [title, description, type].join(' '), fields: [title, description, type], createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      for (const doc of notificationsSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const title = (data.title || '') as string;
        const description = (data.description || '') as string;
        const type = (data.type || '') as string;
        push({
          type: 'Notification',
          id: doc.id,
          title: title || 'Notification',
          subtitle: description.slice(0, 80) || type.replace(/_/g, ' '),
          href: `/executive/notifications/${doc.id}`,
          metadata: { createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? null, type, read: !!data.read },
        }, hit.combined);
      }
    }

    // Requests — title, type, commander email
    {
      const scores = scoreCollection(requestsSnap.docs, (data) => {
        const title = String(data.title || '');
        const type = String(data.type || '');
        const commanderEmail = String(data.commanderEmail || '');
        const status = String(data.status || '');
        return { text: [title, type, commanderEmail, status].join(' '), fields: [title, type, commanderEmail, status], createdMs: docCreatedAtMs(data as Record<string, unknown>) };
      });
      for (const doc of requestsSnap.docs) {
        const hit = scores.get(doc.id);
        if (!hit) continue;
        const data = doc.data();
        const title = (data.title || '') as string;
        const type = (data.type || '') as string;
        const commanderEmail = (data.commanderEmail || '') as string;
        const status = (data.status || '') as string;
        push({
          type: 'Request',
          id: doc.id,
          title: title || 'Untitled Request',
          subtitle: `${type.replace(/_/g, ' ')} · ${commanderEmail} · ${status}`,
          href: '/executive/requests',
          metadata: { status, createdAt: data.createdAt },
        }, hit.combined);
      }
    }

    results.sort((a, b) => {
      const sa = (a.metadata?.score as number) || 0;
      const sb = (b.metadata?.score as number) || 0;
      if (sb !== sa) return sb - sa;
      return a.title.localeCompare(b.title);
    });

    const limited = results.slice(0, MAX_TOTAL);
    return NextResponse.json({ results: limited, total: results.length });
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.error('[Search] Error:', e?.name, e?.message);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}