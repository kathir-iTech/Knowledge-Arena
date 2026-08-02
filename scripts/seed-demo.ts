import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../src/lib/demo-accounts';

const PROJECT_ID = 'studio-4092189688-c74a7';
const NOW = Date.now();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

async function main() {
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID });
  }
  const db = getFirestore();
  const auth = getAuth();

  async function ensureUser(email: string, name: string, role: string, avatar: string): Promise<string> {
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(email)).uid;
    } catch {
      uid = (await auth.createUser({ email, password: DEMO_PASSWORD, displayName: name })).uid;
    }
    await db.collection('users').doc(uid).set({
      name: name ?? 'User',
      avatar: avatar ?? '⚔️',
      role: role ?? 'gladiator',
      disabled: false,
      createdAt: NOW - 20 * DAY,
    }, { merge: true });
    return uid;
  }

  // ── Users ──────────────────────────────────────────────────────────────
  const execUid = await ensureUser('exec@test.local', 'Executive Beta', 'executive', '🏛️');
  const commanderUid = await ensureUser('commander@test.local', 'Commander Kade', 'commander', '🎖️');
  const gladiators: Array<[string, string, string]> = [
    ['glad1@test.local', 'Ruby', '🦊'],
    ['glad2@test.local', 'Atlas', '🐺'],
    ['glad3@test.local', 'Lola', '🦁'],
    ['glad4@test.local', 'Milo', '🐸'],
    ['glad5@test.local', 'Nova', '🦉'],
    ['glad6@test.local', 'Kai', '🐯'],
    ['glad7@test.local', 'Aria', '🦋'],
    ['glad8@test.local', 'Sora', '🐬'],
  ];
  const uidByName = new Map<string, string>();
  const gladUids: Array<[string, string, string]> = [];
  for (const [email, name, avatar] of gladiators) {
    const uid = await ensureUser(email, name, 'gladiator', avatar);
    gladUids.push([uid, name, avatar]);
    uidByName.set(name, uid);
  }
  console.log('users:', DEMO_ACCOUNTS.map(a => a.email).join(', '), 'and', gladUids.length, 'gladiators');

  // ── LIVE battle (CCAB8A) ───────────────────────────────────────────────
  const liveId = 'CCAB8A';
  await db.collection('quizzes').doc(liveId).set({
    title: 'Midnight Clash',
    status: 'live',
    current_question_index: 2,
    question_count: 5,
    battle_mode: 'synchronized',
    category: 'Computer Science',
    difficulty: 'hard',
    participantCount: 3,
    created_by: commanderUid,
    created_at: NOW - 6 * MIN,
    started_at: NOW - 4 * MIN,
    question_start_at: FieldValue.serverTimestamp(),
    scoring_config: { score_max: 1000, score_min: 100, time_decay: true },
  }, { merge: true });

  const liveQids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const q = `Q${liveId}${i}`;
    liveQids.push(q);
    await db.collection('quizzes').doc(liveId).collection('questions').doc(q).set({
      text: [
        'Which data structure operates in FIFO order?',
        'What does the time complexity O(log n) describe?',
        'Which HTTP status code means "Not Found"?',
        'What does DNS stand for?',
        'Which sorting algorithm is O(n log n) on average?',
      ][i],
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      answer: i % 4,
      timer: 30,
      sort_index: i,
    });
  }

  const liveParts = [
    { name: 'Ruby', score: 1240, online: true, answered: [0, 1], timedOut: [], skipped: [] },
    { name: 'Atlas', score: 980, online: true, answered: [0], timedOut: [1], skipped: [] },
    { name: 'Lola', score: 360, online: false, answered: [], timedOut: [], skipped: [0] },
  ];
  for (const p of liveParts) {
    const uid = uidByName.get(p.name)!;
    await db.collection('quizzes').doc(liveId).collection('participants').doc(uid).set({
      user_id: uid,
      name: p.name,
      score: p.score,
      status: 'playing',
      violations_count: 0,
      ready: true,
      lastSeen: Timestamp.fromMillis(p.online ? NOW : NOW - 90000),
      answered_question_ids: p.answered.map(i => liveQids[i]),
      timed_out_question_ids: p.timedOut.map(i => liveQids[i]),
      skipped_question_ids: p.skipped.map(i => liveQids[i]),
      current_question_index: 2,
    }, { merge: true });
  }

  // ── WAITING battle (QQQQ9B) ────────────────────────────────────────────
  const waitId = 'QQQQ9B';
  await db.collection('quizzes').doc(waitId).set({
    title: 'Waiting Arena',
    status: 'waiting',
    current_question_index: -1,
    question_count: 4,
    battle_mode: 'independent',
    category: 'Mathematics',
    difficulty: 'medium',
    participantCount: 2,
    created_by: commanderUid,
    created_at: NOW - 2 * MIN,
  }, { merge: true });
  for (let i = 0; i < 4; i++) {
    await db.collection('quizzes').doc(waitId).collection('questions').doc(`Q${i}`).set({
      text: `Warmup ${i + 1}`, options: ['One', 'Two', 'Three', 'Four'], answer: i % 4, timer: 20, sort_index: i,
    });
  }
  for (const name of ['Milo', 'Ruby']) {
    const uid = uidByName.get(name)!;
    await db.collection('quizzes').doc(waitId).collection('participants').doc(uid).set({
      user_id: uid, name, score: 0, status: 'playing', violations_count: 0, ready: true,
      lastSeen: Timestamp.fromMillis(NOW),
      answered_question_ids: [], timed_out_question_ids: [], skipped_question_ids: [],
      current_question_index: -1,
    }, { merge: true });
  }

  // ── FINISHED battles (history, recommendations, analytics) ─────────────
  const finished: Array<{
    id: string; title: string; category: string; difficulty: string; createdDaysAgo: number;
    participants: Array<[string, number, number]>; // name, score, maxScore
  }> = [
    {
      id: 'EKK92M', title: 'History Smackdown', category: 'History', difficulty: 'medium', createdDaysAgo: 3,
      participants: [['Ruby', 820, 1000], ['Atlas', 640, 1000], ['Lola', 450, 1000], ['Milo', 910, 1000], ['Nova', 380, 1000]],
    },
    {
      id: 'V3X2T5', title: 'Math Sprint', category: 'Mathematics', difficulty: 'hard', createdDaysAgo: 1,
      participants: [['Ruby', 700, 1000], ['Kai', 850, 1000], ['Aria', 520, 1000]],
    },
    {
      id: 'X7W9QA', title: 'Science Trivia Night', category: 'Science', difficulty: 'medium', createdDaysAgo: 10,
      participants: [['Ruby', 900, 1000], ['Atlas', 610, 1000], ['Milo', 750, 1000], ['Sora', 470, 1000], ['Kai', 880, 1000]],
    },
    {
      id: 'P3T8KZ', title: 'Language Arts Arena', category: 'Language Arts', difficulty: 'easy', createdDaysAgo: 8,
      participants: [['Lola', 720, 1000], ['Aria', 690, 1000], ['Sora', 530, 1000]],
    },
    {
      id: 'M1N4QD', title: 'AI & Machine Learning Basics', category: 'Computer Science', difficulty: 'hard', createdDaysAgo: 5,
      participants: [['Kai', 940, 1000], ['Ruby', 760, 1000], ['Nova', 490, 1000]],
    },
  ];
  const extraFinished: Array<[string, string, string, string, number, number, number]> = [
    ['F8D2XC', 'Geography Dash', 'Geography', 'medium', 12, 9, 5],
    ['K2L9PW', 'Physics Friction Fest', 'Science', 'hard', 2, 8, 7],
    ['R5Y7UE', 'Algebra Assault', 'Mathematics', 'medium', 6, 10, 8],
    ['C4V8BS', 'Literature Lightning', 'Language Arts', 'hard', 4, 9, 4],
    ['Z1Q3AH', 'Chemistry Chaos', 'Science', 'medium', 15, 8, 6],
  ];
  for (const [id, title, category, difficulty, daysAgo, qCount, pc] of extraFinished) {
    finished.push({
      id, title, category, difficulty, createdDaysAgo: daysAgo,
      participants: [[pc > 4 ? 'Ruby' : 'Milo', 700, 1000]],
    });
  }

  for (const f of finished) {
    const created = NOW - f.createdDaysAgo * DAY;
    await db.collection('quizzes').doc(f.id).set({
      title: f.title,
      status: 'finished',
      current_question_index: -1,
      question_count: 10,
      battle_mode: 'synchronized',
      category: f.category,
      difficulty: f.difficulty,
      participantCount: f.participants.length,
      created_by: commanderUid,
      created_at: created,
      started_at: created + 2 * MIN,
      scoring_config: { score_max: 1000, score_min: 100, time_decay: true },
    }, { merge: true });
    for (let i = 0; i < 10; i++) {
      await db.collection('quizzes').doc(f.id).collection('questions').doc(`Q${f.id}${i}`).set({
        text: `${f.title} — question ${i + 1}`, options: ['A', 'B', 'C', 'D'], answer: i % 4, timer: 30, sort_index: i,
      });
    }
    for (const [name, score, maxScore] of f.participants) {
      const uid = uidByName.get(name)!;
      await db.collection('quizzes').doc(f.id).collection('participants').doc(uid).set({
        user_id: uid, name, score, max_score: maxScore, status: 'finished',
        violations_count: 0, ready: true,
        lastSeen: Timestamp.fromMillis(NOW - 60 * MIN),
        answered_question_ids: [], timed_out_question_ids: [], skipped_question_ids: [],
        current_question_index: -1,
      }, { merge: true });
    }
  }

  // ── Question bank (AI Forge showcase + analytics) ──────────────────────
  const bank: Array<[string, string, string, string, string, number]> = [
    ['Which data structure uses FIFO ordering?', 'Queue', 'Computer Science', 'easy', 'ai_pdf_forge', 1],
    ['What does HTTP stand for?', 'HyperText Transfer Protocol', 'Computer Science', 'easy', 'ai_pdf_forge', 2],
    ['What is the time complexity of binary search?', 'O(log n)', 'Computer Science', 'medium', 'ai_pdf_forge', 3],
    ['Which principle states each class should have one reason to change?', 'Single Responsibility', 'Computer Science', 'medium', 'ai_pdf_forge', 5],
    ['Explain the CAP theorem in distributed systems.', 'Consistency, Availability, Partition tolerance', 'Computer Science', 'hard', 'ai_pdf_forge', 6],
    ['What is the chemical symbol for gold?', 'Au', 'Science', 'easy', 'manual', 12],
    ['What is the powerhouse of the cell?', 'Mitochondria', 'Science', 'easy', 'manual', 14],
    ['Which law describes the relationship between force, mass, and acceleration?', 'Newton\u2019s Second Law', 'Science', 'medium', 'manual', 9],
    ['What is the SI unit of electric current?', 'Ampere', 'Science', 'medium', 'ai_pdf_forge', 8],
    ['What is the difference between DNA and RNA?', 'DNA is double-stranded, RNA is single-stranded', 'Science', 'hard', 'ai_pdf_forge', 10],
    ['What is the derivative of x\u00b2?', '2x', 'Mathematics', 'easy', 'ai_pdf_forge', 2],
    ['What is the value of \u03c0 to two decimal places?', '3.14', 'Mathematics', 'easy', 'ai_pdf_forge', 1],
    ['What is the quadratic formula?', 'x = (-b \u00b1 \u221a(b\u00b2-4ac)) / 2a', 'Mathematics', 'medium', 'ai_pdf_forge', 4],
    ['What is the integral of 1/x?', 'ln|x| + C', 'Mathematics', 'hard', 'ai_pdf_forge', 6],
    ['What is the probability of rolling a 6 on a fair die?', '1/6', 'Mathematics', 'medium', 'manual', 7],
    ['In which year did World War II end?', '1945', 'History', 'easy', 'ai_pdf_forge', 15],
    ['Who was the first president of the United States?', 'George Washington', 'History', 'easy', 'ai_pdf_forge', 18],
    ['What was the Renaissance?', 'A cultural rebirth in Europe', 'History', 'medium', 'ai_pdf_forge', 20],
    ['What is the difference between primary and secondary sources?', 'Primary is first-hand evidence', 'History', 'medium', 'manual', 22],
    ['What caused the fall of the Roman Empire?', 'Complex mix of internal decay and external pressure', 'History', 'hard', 'ai_pdf_forge', 25],
    ['What is a metaphor?', 'A figure of speech comparing without like/as', 'Language Arts', 'easy', 'ai_pdf_forge', 11],
    ['What is the theme of a story?', 'The central underlying idea', 'Language Arts', 'easy', 'manual', 13],
    ['What is foreshadowing?', 'Hints of what is to come', 'Language Arts', 'medium', 'ai_pdf_forge', 16],
    ['What is the difference between tone and mood?', 'Tone is author attitude, mood is reader feeling', 'Language Arts', 'hard', 'ai_pdf_forge', 19],
    ['What is alliteration?', 'Repetition of initial consonant sounds', 'Language Arts', 'medium', 'manual', 21],
  ];
  for (let i = 0; i < bank.length; i++) {
    const [text, answer, category, difficulty, source, daysAgo] = bank[i];
    const docId = `bank-${source}-${i}`;
    await db.collection('question_bank').doc(docId).set({
      text,
      answer,
      options: [answer, 'Option B', 'Option C', 'Option D'],
      category,
      difficulty,
      subject: category,
      source,
      createdBy: source === 'ai_pdf_forge' ? 'ai_import' : commanderUid,
      createdAt: Timestamp.fromMillis(NOW - daysAgo * DAY),
    }, { merge: true });
  }

  // ── Conversations (messaging demo + messageActivity chart) ─────────────
  const convDefs = [
    {
      id: 'conv-exec-commander',
      otherUid: execUid,
      otherRole: 'executive',
      otherName: 'Executive Beta',
      createdAtDaysAgo: 2,
      messages: [
        { from: 'commander', text: 'Morning! Midnight Clash goes live tonight.', ageHours: 46 },
        { from: 'exec', text: 'Nice. What is the expected turnout?', ageHours: 45 },
        { from: 'commander', text: 'About 3 gladiators confirmed, room CCAB8A.', ageHours: 44 },
        { from: 'exec', text: 'Send me the analytics once it wraps.', ageHours: 40 },
        { from: 'commander', text: 'Will do — command center will show it live.', ageHours: 39 },
        { from: 'commander', text: 'Demo link ready for Friday!', ageHours: 38 },
      ],
    },
    {
      id: 'conv-commander-ruby',
      otherUid: uidByName.get('Ruby')!,
      otherRole: 'gladiator',
      otherName: 'Ruby',
      createdAtDaysAgo: 1,
      messages: [
        { from: 'commander', text: 'Great battle tonight Ruby!', ageHours: 20 },
        { from: 'ruby', text: 'Thanks! History Smackdown was intense.', ageHours: 19 },
        { from: 'commander', text: 'You are at 820 — top 3 for sure.', ageHours: 18 },
        { from: 'ruby', text: 'Bringing my A-game to Midnight Clash!', ageHours: 2 },
      ],
    },
  ];
  for (const conv of convDefs) {
    const created = NOW - conv.createdAtDaysAgo * DAY;
    const others = [commanderUid, conv.otherUid];
    const names: Record<string, string> = { [commanderUid]: 'Commander Kade', [conv.otherUid]: conv.otherName };
    await db.collection('conversations').doc(conv.id).set({
      participants: others,
      participantRoles: { [commanderUid]: 'commander', [conv.otherUid]: conv.otherRole },
      lastMessage: conv.messages[conv.messages.length - 1].text,
      lastActivity: Timestamp.fromMillis(created),
      messageCount: conv.messages.length,
      createdAt: Timestamp.fromMillis(created),
    }, { merge: true });
    const senderUid = (sender: string) => sender === 'exec' ? execUid : sender === 'ruby' ? uidByName.get('Ruby')! : commanderUid;
    for (let i = 0; i < conv.messages.length; i++) {
      const m = conv.messages[i];
      await db.collection('conversations').doc(conv.id).collection('messages').doc(`m${i}`).set({
        senderId: senderUid(m.from),
        senderName: names[senderUid(m.from)] || conv.otherName,
        text: m.text,
        createdAt: Timestamp.fromMillis(NOW - m.ageHours * HOUR),
      }, { merge: true });
    }
  }

  // ── Notifications ──────────────────────────────────────────────────────
  const notifications: Array<[string, string, string, string, number, boolean]> = [
    [execUid, 'Live battle started', 'Midnight Clash (CCAB8A) is live with 3 gladiators.', 'battle_completed', NOW - 5 * MIN, false],
    [execUid, 'New gladiator registered', 'Sora joined the arena and is ready to battle.', 'gladiator_registration', NOW - 1 * DAY, false],
    [execUid, 'AI import completed', '42 questions forged from Computer-Science-101.pdf.', 'ai_import_completed', NOW - 2 * DAY, true],
    [execUid, 'Announcement published', 'HackVerse demo rehearsal this Friday at 10:00.', 'new_announcement', NOW - 3 * DAY, true],
    [commanderUid, 'New message from Ruby', 'Bringing my A-game to Midnight Clash!', 'new_message', NOW - 2 * HOUR, false],
    [uidByName.get('Ruby')!, 'Battle finished', 'History Smackdown finished — you placed 2nd with 820 points.', 'battle_completed', NOW - 3 * DAY, false],
    [uidByName.get('Ruby')!, 'Study tips unlocked', 'Your AI recommendations for Computer Science are ready.', 'new_announcement', NOW - 1 * DAY, false],
    [uidByName.get('Atlas')!, 'Battle finished', 'Math Sprint finished — you placed 2nd with 850 points.', 'battle_completed', NOW - 1 * DAY, false],
    [uidByName.get('Milo')!, 'Waiting room open', 'Waiting Arena (QQQQ9B) is ready for your squad.', 'battle_completed', NOW - 30 * MIN, false],
  ];
  for (let i = 0; i < notifications.length; i++) {
    const [userId, title, description, type, createdAt, read] = notifications[i];
    await db.collection('notifications').doc(`demo-notif-${i}`).set({
      userId, title, description, type, read, createdAt: Timestamp.fromMillis(createdAt),
    }, { merge: true });
  }

  console.log('SEEDED exec=' + execUid + ' commander=' + commanderUid + ' live=' + liveId + ' waiting=' + waitId);
  console.log('Login as any demo account: ' + DEMO_ACCOUNTS.map(a => a.email).join(', ') + ' (password: ' + DEMO_PASSWORD + ')');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
