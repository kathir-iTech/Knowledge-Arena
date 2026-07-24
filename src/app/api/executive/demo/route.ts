import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

export const runtime = 'nodejs';

const topics = [
  'Algebra', 'Geometry', 'Calculus', 'Physics', 'Chemistry',
  'Biology', 'History', 'Geography', 'Literature', 'Computer Science',
  'Economics', 'Psychology', 'Philosophy', 'Art History', 'Music Theory',
  'Astronomy', 'Oceanography', 'Linguistics', 'Anthropology', 'Political Science',
];

const questionTemplates = [
  'What is the primary function of {topic}?',
  'Which of the following best describes {topic}?',
  'How does {topic} relate to modern science?',
  'What year was the concept of {topic} first documented?',
  'Who is considered the father of {topic}?',
  'Which principle is fundamental to understanding {topic}?',
  'What are the three main branches of {topic}?',
  'How has {topic} evolved over the past century?',
  'What tool is essential for studying {topic}?',
  'Which discovery had the greatest impact on {topic}?',
];

const correctAnswers = [
  'To provide foundational understanding and practical applications.',
  'A systematic framework for analysis and interpretation.',
  'It forms the basis for interdisciplinary research and innovation.',
  'Ancient civilizations first documented its core principles.',
  'The pioneer who established its foundational theories.',
  'The principle of empirical observation and verification.',
  'Theoretical, applied, and experimental branches.',
  'Through technological advancement and collaborative research.',
  'Advanced instrumentation and computational modeling.',
  'The discovery that revolutionized theoretical frameworks.',
];

const wrongAnswers = [
  'It has no real-world applications.',
  'An arbitrary collection of unrelated facts.',
  'It is completely unrelated to other fields.',
  'It was discovered last year.',
  'No single person is credited.',
  'Pure speculation without evidence.',
  'Only one branch exists.',
  'It has remained unchanged.',
  'Simple observation is sufficient.',
  'No major discoveries have been made.',
];

const arenaTitles = [
  'Python Basics', 'Data Structures', 'Web Development',
  'Machine Learning 101', 'Database Design',
];

const commanderNames = [
  'Commander Alpha', 'Commander Beta', 'Commander Gamma',
];

const gladiatorNames = [
  'Gladiator Akira', 'Gladiator Bella', 'Gladiator Chen',
  'Gladiator Diana', 'Gladiator Eros', 'Gladiator Freya',
  'Gladiator Goku', 'Gladiator Hera', 'Gladiator Ivan',
  'Gladiator Julia', 'Gladiator Kai', 'Gladiator Luna',
  'Gladiator Milo', 'Gladiator Nora', 'Gladiator Orion',
  'Gladiator Petra', 'Gladiator Quinn', 'Gladiator Rhea',
  'Gladiator Seth', 'Gladiator Tara', 'Gladiator Uma',
  'Gladiator Vega', 'Gladiator Wren', 'Gladiator Xena',
  'Gladiator Yuki',
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if demo data already exists
    const existingCommanders = await getAdminDb().collection('users')
      .where('role', '==', 'commander')
      .where('demo', '==', true)
      .limit(1)
      .get();

    if (!existingCommanders.empty) {
      return NextResponse.json({ error: 'Demo data already exists. Delete existing demo commanders to regenerate.' }, { status: 409 });
    }

    const now = Date.now();
    const demoDomain = 'demo.knowledgearena.app';
    const commanderIds: string[] = [];

    // 1. Create 3 Commanders
    for (let i = 0; i < 3; i++) {
      const email = `demo_commander_${i + 1}@${demoDomain}`;
      const displayName = commanderNames[i];
      const userRecord = await getAdminAuth().createUser({
        email,
        password: 'DemoPass123!',
        displayName,
      });
      await getAdminDb().collection('users').doc(userRecord.uid).set({
        email,
        displayName,
        role: 'commander',
        createdAt: now - randomInt(0, 7 * 86400000),
        disabled: false,
        demo: true,
      });
      commanderIds.push(userRecord.uid);
    }

    // 2. Create 25 Gladiators
    const gladiatorIds: string[] = [];
    for (let i = 0; i < 25; i++) {
      const email = `demo_gladiator_${i + 1}@${demoDomain}`;
      const displayName = gladiatorNames[i];
      const userRecord = await getAdminAuth().createUser({
        email,
        password: 'DemoPass123!',
        displayName,
      });
      await getAdminDb().collection('users').doc(userRecord.uid).set({
        email,
        displayName,
        role: 'gladiator',
        createdAt: now - randomInt(0, 14 * 86400000),
        disabled: false,
        demo: true,
      });
      gladiatorIds.push(userRecord.uid);
    }

    // 3. Create 500 Questions
    const questionIds: string[] = [];
    const batchSize = 500;
    let batch = getAdminDb().batch();
    let opCount = 0;

    for (let i = 0; i < 500; i++) {
      const topic = topics[i % topics.length];
      const template = questionTemplates[i % questionTemplates.length];
      const question = template.replace('{topic}', topic);
      const options = [
        correctAnswers[i % correctAnswers.length],
        wrongAnswers[randomInt(0, wrongAnswers.length - 1)],
        wrongAnswers[randomInt(0, wrongAnswers.length - 1)],
        wrongAnswers[randomInt(0, wrongAnswers.length - 1)],
      ];
      // Shuffle options
      const correctIdx = 0;
      for (let j = options.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [options[j], options[k]] = [options[k], options[j]];
      }
      const finalCorrectIdx = options.indexOf(correctAnswers[i % correctAnswers.length]);

      const docRef = getAdminDb().collection('question_bank').doc();
      questionIds.push(docRef.id);
      batch.set(docRef, {
        question,
        options,
        correctAnswer: finalCorrectIdx,
        explanation: `The correct answer is based on established ${topic} principles.`,
        category: topic,
        difficulty: randomItem(['easy', 'medium', 'hard']),
        tags: [topic.toLowerCase(), 'demo'],
        createdBy: 'ai_import',
        createdAt: now - randomInt(0, 30 * 86400000),
        source: 'demo',
      });
      opCount++;

      if (opCount >= 400) {
        await batch.commit();
        batch = getAdminDb().batch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();

    // 4. Create 10 Question Sets
    const setIdMap: string[] = [];
    for (let i = 0; i < 10; i++) {
      const startIdx = i * 50;
      const setQuestionIds = questionIds.slice(startIdx, startIdx + 50);
      const docRef = getAdminDb().collection('question_sets').doc();
      setIdMap.push(docRef.id);
      await docRef.set({
        name: `${topics[i]} Question Set`,
        description: `A comprehensive set of questions covering ${topics[i]}.`,
        category: topics[i],
        difficulty: randomItem(['easy', 'medium', 'hard']),
        tags: [topics[i].toLowerCase(), 'demo'],
        questionIds: setQuestionIds,
        questionCount: setQuestionIds.length,
        createdBy: auth.uid,
        createdAt: now - randomInt(0, 20 * 86400000),
        updatedAt: now - randomInt(0, 10 * 86400000),
      });
    }

    // 5. Create 5 Battles with participants
    for (let i = 0; i < 5; i++) {
      const roomCode = generateRoomCode();
      const commanderId = commanderIds[i % 3];
      const battleStart = now - randomInt(1, 14) * 86400000;
      const battleEnd = battleStart + randomInt(15, 45) * 60000;
      const isFinished = i < 4;

      await getAdminDb().collection('quizzes').doc(roomCode).set({
        title: arenaTitles[i],
        status: isFinished ? 'finished' : 'live',
        current_question_index: isFinished ? 9 : randomInt(0, 5),
        question_count: 10,
        created_by: commanderId,
        created_at: battleStart,
        finished_at: isFinished ? battleEnd : null,
      });

      // Add participants (random subset of gladiators)
      const participantsInBattle = gladiatorIds
        .sort(() => Math.random() - 0.5)
        .slice(0, randomInt(5, 15));

      for (const gladiatorId of participantsInBattle) {
        const gladiator = gladiatorNames[gladiatorIds.indexOf(gladiatorId)];
        await getAdminDb()
          .collection('quizzes')
          .doc(roomCode)
          .collection('participants')
          .doc(gladiatorId)
          .set({
            user_id: gladiatorId,
            name: gladiator,
            score: isFinished ? randomInt(0, 100) : randomInt(0, 50),
            status: isFinished ? 'finished' : 'playing',
            violations_count: 0,
            lastSeen: battleEnd || battleStart + randomInt(0, 30) * 60000,
          });
      }
    }

    // 6. Create 50 Audit Logs
    const auditActions = [
      'commander_created', 'commander_disabled', 'commander_enabled',
      'question_added', 'question_edited', 'question_deleted',
      'question_set_created', 'arena_created', 'arena_started',
      'arena_ended', 'student_joined', 'student_kicked',
      'message_sent', 'announcement_sent', 'settings_changed',
    ];

    batch = getAdminDb().batch();
    opCount = 0;
    for (let i = 0; i < 50; i++) {
      const action = randomItem(auditActions);
      const actor = i % 5 === 0 ? auth.uid : randomItem(commanderIds);
      const actorRole = i % 5 === 0 ? 'executive' : 'commander';
      const docRef = getAdminDb().collection('auditLogs').doc();
      batch.set(docRef, {
        timestamp: now - randomInt(0, 30) * 86400000,
        actor,
        actorRole,
        action,
        target: randomItem(questionIds.concat(commanderIds).concat(gladiatorIds)),
        metadata: { source: 'demo' },
        createdAt: new Date(),
      });
      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = getAdminDb().batch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();

    // 7. Create 5 Announcements
    const announcementTexts = [
      'Welcome to the Knowledge Arena demo! All commanders are encouraged to create their first arena.',
      'Platform maintenance scheduled for next Sunday. All battles will be paused during maintenance.',
      'New question bank categories added: AI, Machine Learning, and Data Science.',
      'Congratulations to Commander Alpha for reaching 10 arenas created!',
      'Reminder: All gladiators must complete profile setup before joining battles.',
    ];

    for (let i = 0; i < 5; i++) {
      await getAdminDb().collection('announcements').add({
        senderId: auth.uid,
        text: announcementTexts[i],
        targetRole: 'all_commanders',
        targetId: null,
        readBy: [],
        createdAt: now - randomInt(0, 14) * 86400000,
      });
    }

    // 8. Create some conversations and messages
    for (let i = 0; i < Math.min(3, commanderIds.length); i++) {
      const participants = [auth.uid, commanderIds[i]];
      const convRef = getAdminDb().collection('conversations').doc();
      await convRef.set({
        participants,
        participantRoles: { [auth.uid]: 'executive', [commanderIds[i]]: 'commander' },
        unreadCount: { [auth.uid]: 0, [commanderIds[i]]: randomInt(0, 2) },
        lastActivity: now - randomInt(0, 7) * 86400000,
        createdAt: now - randomInt(7, 14) * 86400000,
      });

      const msgCount = randomInt(2, 5);
      for (let j = 0; j < msgCount; j++) {
        await convRef.collection('messages').add({
          text: `Demo message ${j + 1} in conversation ${i + 1}. This is sample content for the workspace demo.`,
          senderId: j % 2 === 0 ? auth.uid : commanderIds[i],
          senderRole: j % 2 === 0 ? 'executive' : 'commander',
          timestamp: now - randomInt(0, 7) * 86400000,
        });
      }
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'demo_generated',
      target: 'workspace',
      metadata: { stats: { commanders: 3, gladiators: 25, questions: 500, questionSets: 10, battles: 5 } },
    });
    await notificationService.create({
      type: 'ai_import_completed',
      title: 'Demo Workspace Generated',
      description: 'Sample data has been created for the workspace.',
      createdAt: Date.now(),
      link: '/executive/workspace',
    });

    return NextResponse.json({
      success: true,
      stats: {
        commanders: 3,
        gladiators: 25,
        questions: 500,
        questionSets: 10,
        battles: 5,
        auditLogs: 50,
        announcements: 5,
        conversations: 3,
      },
    });
  } catch (err: any) {
    console.error('[Demo] Error:', err?.name, err?.code, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
