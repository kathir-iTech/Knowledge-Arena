import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

const validDifficulties = ['easy', 'medium', 'hard'];

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const search = searchParams.get('search');

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
    return NextResponse.json({ error: err?.message || 'Failed to list questions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { question, options, correctAnswer, explanation, category, difficulty, tags } = await req.json();

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json({ error: 'Question and at least 2 options are required' }, { status: 400 });
    }
    if (correctAnswer === undefined || correctAnswer < 0 || correctAnswer >= options.length) {
      return NextResponse.json({ error: 'Valid correctAnswer is required' }, { status: 400 });
    }
    if (difficulty && !validDifficulties.includes(difficulty)) {
      return NextResponse.json({ error: 'Invalid difficulty. Use easy, medium, or hard' }, { status: 400 });
    }

    const docRef = await getAdminDb().collection('question_bank').add({
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

    return NextResponse.json({ id: docRef.id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create question' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update question' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await getAdminDb().collection('question_bank').doc(id).delete();
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete question' }, { status: 500 });
  }
}
