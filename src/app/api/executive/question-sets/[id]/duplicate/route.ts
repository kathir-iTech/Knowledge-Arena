import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const setId = segments[segments.length - 2];

    if (!setId) {
      return NextResponse.json({ error: 'Set ID is required' }, { status: 400 });
    }

    const doc = await getAdminDb().collection('question_sets').doc(setId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Question set not found' }, { status: 404 });
    }

    const data = doc.data()!;
    const docRef = getAdminDb().collection('question_sets').doc();
    await docRef.set({
      name: `${data.name} (Copy)`,
      description: data.description || '',
      category: data.category || 'General',
      difficulty: data.difficulty || null,
      tags: data.tags || [],
      questionIds: data.questionIds || [],
      questionCount: (data.questionIds || []).length,
      createdBy: auth.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
