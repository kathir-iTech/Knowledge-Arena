import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
  const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!executiveAuth && !commanderAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');

    let query = getAdminDb().collection('question_sets').orderBy('createdAt', 'desc');
    const snapshot = await query.get();

    let sets = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (search) {
      const lower = search.toLowerCase();
      sets = sets.filter((s: any) => {
        const nameMatch = s.name && s.name.toLowerCase().includes(lower);
        const catMatch = s.category && s.category.toLowerCase().includes(lower);
        const tagMatch = s.tags && Array.isArray(s.tags) && s.tags.some((t: string) => t.toLowerCase().includes(lower));
        const descMatch = s.description && s.description.toLowerCase().includes(lower);
        return nameMatch || catMatch || tagMatch || descMatch;
      });
    }

    return NextResponse.json({ sets });
  } catch (err: any) {
    console.error('[QuestionSets GET] error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, description, category, difficulty, tags, questionIds } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const docRef = getAdminDb().collection('question_sets').doc();
    await docRef.set({
      name: name.trim(),
      description: description || '',
      category: category || 'General',
      difficulty: difficulty || null,
      tags: tags || [],
      questionIds: questionIds || [],
      questionCount: (questionIds || []).length,
      createdBy: auth.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name, description, category, difficulty, tags, questionIds } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (tags !== undefined) updateData.tags = tags;
    if (questionIds !== undefined) {
      updateData.questionIds = questionIds;
      updateData.questionCount = questionIds.length;
    }

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await getAdminDb().collection('question_sets').doc(id).update(updateData);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    await getAdminDb().collection('question_sets').doc(id).delete();
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
