import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { notificationService } from '@/services/notification.service';

const validDifficulties = ['easy', 'medium', 'hard'];

export async function GET(req: NextRequest) {
  try {
    const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!executiveAuth && !commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[QuestionBank GET] auth:', executiveAuth?.uid || commanderAuth?.uid, 'role:', executiveAuth ? 'executive' : 'commander');
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const search = searchParams.get('search');
    const idsParam = searchParams.get('ids');
    const idsArr = searchParams.getAll('ids');

    let ids: string[] = [];
    if (idsParam) {
      ids = idsParam.split(',').filter(Boolean);
    } else if (idsArr.length > 0) {
      ids = idsArr.filter(Boolean);
    }

    let query = getAdminDb().collection('question_bank').orderBy('createdAt', 'desc');

    if (category) {
      query = query.where('category', '==', category);
    }
    if (difficulty && validDifficulties.includes(difficulty)) {
      query = query.where('difficulty', '==', difficulty);
    }

    const snapshot = await query.get();
    let questions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        const idSet = new Set(ids);
        questions = questions.filter((q: any) => idSet.has(q.id));
      }
    }

    if (search) {
      const lower = search.toLowerCase();
      questions = questions.filter(
        (q: any) =>
          (q.question && q.question.toLowerCase().includes(lower)) ||
          (q.tags && q.tags.some((t: string) => t.toLowerCase().includes(lower)))
      );
    }

    return NextResponse.json({ questions });
  } catch (err: any) {
    console.error('[QuestionBank GET] error:', err?.name, err?.code, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const questions = Array.isArray(body) ? body : [body];

    const batch = getAdminDb().batch();
    const results = {
      requested: questions.length,
      success: 0,
      failed: 0,
    };

    for (const q of questions) {
      const { question, options, correctAnswer, explanation, category, difficulty, tags } = q;
      if (!question || !options || !Array.isArray(options) || options.length < 2 || correctAnswer === undefined) {
        results.failed++;
        continue;
      }

      const docRef = getAdminDb().collection('question_bank').doc();
      batch.set(docRef, {
        question,
        options,
        correctAnswer,
        explanation: explanation || '',
        category: category || 'General',
        difficulty: difficulty || 'medium',
        tags: tags || [],
        createdBy: auth.uid,
        createdAt: Date.now(),
      });
      results.success++;
    }

    if (results.success > 0) {
      await batch.commit();
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_added',
      target: 'question_bank',
      metadata: { count: results.success, category: questions[0]?.category || 'General' },
    });
    if (results.success > 0) {
      await notificationService.create({
        type: 'ai_import_completed',
        title: 'Questions Added',
        description: `${results.success} question(s) added to the question bank.`,
        createdAt: Date.now(),
        link: '/executive/question-bank',
        metadata: { count: results.success },
      });
    }

    return NextResponse.json({ ...results, success: results.success > 0 });
  } catch (err: any) {
    console.error('[QuestionBank POST] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id, question, options, correctAnswer, explanation, category, difficulty, tags } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (question !== undefined) updateData.question = question;
    if (options !== undefined) {
      if (!Array.isArray(options) || options.length < 2) {
        return NextResponse.json({ error: 'At least 2 options are required' }, { status: 400 });
      }
      updateData.options = options;
    }
    if (correctAnswer !== undefined) updateData.correctAnswer = correctAnswer;
    if (explanation !== undefined) updateData.explanation = explanation;
    if (category !== undefined) updateData.category = category;
    if (difficulty !== undefined) {
      if (!validDifficulties.includes(difficulty)) {
        return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
      }
      updateData.difficulty = difficulty;
    }
    if (tags !== undefined) updateData.tags = tags;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await getAdminDb().collection('question_bank').doc(id).update(updateData);

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_edited',
      target: id,
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('[QuestionBank PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const questionDoc = getAdminDb().collection('question_bank').doc(id);
    await questionDoc.delete();

    const setsSnapshot = await getAdminDb().collection('question_sets')
      .where('questionIds', 'array-contains', id)
      .get();

    if (!setsSnapshot.empty) {
      const batch = getAdminDb().batch();
      setsSnapshot.forEach(doc => {
        const data = doc.data();
        const updatedIds = (data.questionIds || []).filter((qid: string) => qid !== id);
        batch.update(doc.ref, { questionIds: updatedIds, questionCount: updatedIds.length, updatedAt: Date.now() });
      });
      await batch.commit();
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'question_deleted',
      target: id,
      metadata: { affectedSets: setsSnapshot.docs.length },
    });
    await notificationService.create({
      type: 'operation_failed',
      title: 'Question Deleted',
      description: `A question was removed from the question bank.`,
      createdAt: Date.now(),
      link: '/executive/question-bank',
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
