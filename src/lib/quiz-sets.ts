import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const SET_SCAN_LIMIT = 5000;

export interface QuizSetSummary {
  setId: string;
  title: string;
  category: string;
  source: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number | null;
  questionCount: number;
  difficulties: Record<string, number>;
  tags: string;
  status: 'published' | 'archived' | null;
  previewTexts: string[];
}

export interface QuizSetDoc {
  id: string;
  data: Record<string, any>;
}

export function docGroupKey(data: Record<string, any>): string | null {
  if (typeof data.importSessionId === 'string' && data.importSessionId.trim()) {
    return `i:${data.importSessionId.trim()}`;
  }
  const createdAtMs = data.createdAt?.toMillis?.() ?? (typeof data.createdAt === 'number' ? data.createdAt : null);
  if (createdAtMs == null) return null;
  return `g:${createdAtMs}|${data.createdBy || ''}|${data.source || ''}|${data.category || 'General'}`;
}

export function encodeSetId(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url');
}

export function decodeSetId(setId: string): string | null {
  try {
    const key = Buffer.from(setId, 'base64url').toString('utf8');
    if (!key.startsWith('i:') && !key.startsWith('g:')) return null;
    return key;
  } catch {
    return null;
  }
}

function normalizeDoc(data: Record<string, any>) {
  return {
    text: data.text || data.question_text || '',
    category: data.category || data.subject || 'General',
    difficulty: data.difficulty || 'medium',
    source: data.source || 'manual',
    title: typeof data.title === 'string' ? data.title : '',
    tags: typeof data.tags === 'string' ? data.tags : '',
    createdBy: data.createdBy || null,
    setStatus: data.setStatus === 'published' || data.setStatus === 'archived' ? data.setStatus : null,
    createdAtMs: data.createdAt?.toMillis?.() ?? data.createdAt ?? null,
    updatedAtMs: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? null,
  };
}

export function summarizeSet(key: string, docs: QuizSetDoc[]): QuizSetSummary | null {
  if (!docs.length) return null;

  const normalized = docs.map(d => ({ id: d.id, ...normalizeDoc(d.data) }));
  const first = normalized[0];

  const difficulties: Record<string, number> = { easy: 0, moderate: 0, medium: 0, hard: 0 };
  for (const q of normalized) {
    const d = difficulties[q.difficulty] !== undefined ? q.difficulty : 'medium';
    difficulties[d] = (difficulties[d] || 0) + 1;
  }

  const titles = new Set(normalized.map(q => q.title).filter(Boolean));
  const sharedTitle = titles.size === 1 ? [...titles][0] : '';
  const title = sharedTitle || first.title || `${first.category} · ${new Date(first.createdAtMs || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  let status: 'published' | 'archived' | null = null;
  for (const q of normalized) {
    if (q.setStatus) { status = q.setStatus; break; }
  }

  return {
    setId: encodeSetId(key),
    title,
    category: first.category,
    source: first.source,
    createdBy: first.createdBy || '',
    createdAt: first.createdAtMs ?? Date.now(),
    updatedAt: normalized.reduce<number | null>((max, q) => (q.updatedAtMs && (max === null || q.updatedAtMs > max) ? q.updatedAtMs : max), null),
    questionCount: normalized.length,
    difficulties,
    tags: first.tags || '',
    status,
    previewTexts: normalized.slice(0, 5).map(q => q.text.length > 100 ? `${q.text.slice(0, 100)}…` : q.text),
  };
}

export async function scanAllQuestionDocs(): Promise<QuizSetDoc[]> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.QUESTION_BANK).orderBy('createdAt', 'desc');
  const docs: QuizSetDoc[] = [];
  let last: FirebaseFirestore.DocumentSnapshot | null = null;

  while (docs.length < SET_SCAN_LIMIT) {
    let query = ref.limit(1000);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      docs.push({ id: doc.id, data: doc.data() as Record<string, any> });
      last = doc;
    }
    if (snap.docs.length < 1000) break;
  }

  return docs;
}

export async function fetchSetDocs(setId: string): Promise<QuizSetDoc[]> {
  const key = decodeSetId(setId);
  if (!key) return [];

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.QUESTION_BANK);

  if (key.startsWith('i:')) {
    const snap = await ref.where('importSessionId', '==', key.slice(2)).limit(1000).get();
    return snap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, any> }));
  }

  const parts = key.slice(2).split('|');
  if (parts.length !== 4) return [];
  const [createdAtMs, createdBy, source, category] = parts;
  const ts = Number(createdAtMs);
  if (!Number.isFinite(ts)) return [];

  const snap = await ref
    .where('createdAt', '==', Timestamp.fromMillis(ts))
    .where('createdBy', '==', createdBy)
    .where('source', '==', source)
    .where('category', '==', category)
    .limit(1000)
    .get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, any> }));
}

export async function fetchSetSummaries(): Promise<{ sets: QuizSetSummary[]; sources: string[] }> {
  const docs = await scanAllQuestionDocs();

  const groups = new Map<string, QuizSetDoc[]>();
  const sources = new Set<string>();
  for (const doc of docs) {
    const key = docGroupKey(doc.data);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
    if (typeof doc.data.source === 'string' && doc.data.source.trim()) sources.add(doc.data.source.trim());
  }

  const sets: QuizSetSummary[] = [];
  for (const [key, list] of groups) {
    const summary = summarizeSet(key, list);
    if (summary) sets.push(summary);
  }

  sets.sort((a, b) => b.createdAt - a.createdAt);
  return { sets, sources: Array.from(sources).sort() };
}
