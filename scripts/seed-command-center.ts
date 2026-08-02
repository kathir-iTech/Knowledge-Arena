import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PASSWORD = 'Test123456!';
const NOW = Date.now();

async function main() {
  if (!getApps().length) {
    initializeApp({ projectId: 'studio-4092189688-c74a7' });
  }
  const db = getFirestore();
  const auth = getAuth();

  async function ensureUser(email: string, name: string, role: string, avatar: string): Promise<string> {
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(email)).uid;
    } catch {
      uid = (await auth.createUser({ email, password: PASSWORD, displayName: name })).uid;
    }
    await db.collection('users').doc(uid).set({
      name: name ?? 'User',
      avatar: avatar ?? '⚔️',
      role: role ?? 'gladiator',
      disabled: false,
      createdAt: NOW,
    }, { merge: true });
    console.log('user:', email, '=>', uid);
    return uid;
  }

  const execUid = await ensureUser('exec@test.local', 'Executive Beta', 'executive', '🏛️');
  const commanderUid = await ensureUser('commander@test.local', 'Commander Kade', 'commander', '🎖️');
  const gladiators: Array<[string, string, string]> = [
    ['glad1@test.local', 'Ruby', '🦊'],
    ['glad2@test.local', 'Atlas', '🐺'],
    ['glad3@test.local', 'Lola', '🦁'],
  ];
  const gladiatorUids: Array<[string, string, string]> = [];
  for (const [email, name, avatar] of gladiators) {
    gladiatorUids.push([await ensureUser(email, name, 'gladiator', avatar), name, avatar]);
  }
  const glad4Uid = await ensureUser('glad4@test.local', 'Milo', 'gladiator', '🐸');

  // ── LIVE battle ──
  const liveId = 'CCAB8A';
  await db.collection('quizzes').doc(liveId).set({
    title: 'Midnight Clash',
    status: 'live',
    current_question_index: 2,
    question_count: 5,
    battle_mode: 'synchronized',
    created_by: commanderUid,
    created_at: NOW - 6 * 60 * 1000,
    started_at: NOW - 4 * 60 * 1000,
    question_start_at: FieldValue.serverTimestamp(),
    scoring_config: { score_max: 1000, score_min: 100, time_decay: true },
  });

  const qids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const q = `Q${liveId}${i}`;
    qids.push(q);
    await db.collection('quizzes').doc(liveId).collection('questions').doc(q).set({
      text: `Sample question ${i + 1}`,
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      timer: 30,
      sort_index: i,
    });
  }

  interface Part {
    uid: string; name: string; score: number; answered: string[]; timedOut: string[]; skipped: string[]; online: boolean;
  }
  const liveParts: Part[] = [
    { uid: gladiatorUids[0][0], name: gladiatorUids[0][1], score: 1240, answered: [qids[0], qids[1]], timedOut: [], skipped: [], online: true },
    { uid: gladiatorUids[1][0], name: gladiatorUids[1][1], score: 980, answered: [qids[0]], timedOut: [qids[1]], skipped: [], online: true },
    { uid: gladiatorUids[2][0], name: gladiatorUids[2][1], score: 360, answered: [], timedOut: [], skipped: [qids[0]], online: false },
  ];
  for (const p of liveParts) {
    await db.collection('quizzes').doc(liveId).collection('participants').doc(p.uid).set({
      user_id: p.uid,
      name: p.name,
      score: p.score,
      status: 'playing',
      violations_count: 0,
      ready: true,
      lastSeen: p.online ? Timestamp.fromMillis(NOW) : Timestamp.fromMillis(NOW - 90000),
      answered_question_ids: p.answered,
      timed_out_question_ids: p.timedOut,
      skipped_question_ids: p.skipped,
      current_question_index: 2,
    });
  }

  // ── Waiting battle ──
  const waitId = 'QQQQ9B';
  await db.collection('quizzes').doc(waitId).set({
    title: 'Waiting Arena',
    status: 'waiting',
    current_question_index: -1,
    question_count: 4,
    battle_mode: 'independent',
    created_by: commanderUid,
    created_at: NOW - 2 * 60 * 1000,
  });
  for (let i = 0; i < 4; i++) {
    await db.collection('quizzes').doc(waitId).collection('questions').doc(`Q${i}`).set({
      text: `Warmup ${i + 1}`, options: ['One', 'Two', 'Three', 'Four'], timer: 20, sort_index: i,
    });
  }
  const waitParts: Array<[string, string, boolean]> = [
    [glad4Uid, 'Milo', true],
    [gladiatorUids[0][0], gladiatorUids[0][1], true],
  ];
  for (const [uid, name, online] of waitParts) {
    await db.collection('quizzes').doc(waitId).collection('participants').doc(uid).set({
      user_id: uid, name, score: 0, status: 'playing', violations_count: 0, ready: true,
      lastSeen: Timestamp.fromMillis(online ? NOW : NOW - 90000),
      answered_question_ids: [], timed_out_question_ids: [], skipped_question_ids: [],
      current_question_index: -1,
    });
  }

  console.log('SEEDED exec=' + execUid + ' live=' + liveId + ' waiting=' + waitId);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });