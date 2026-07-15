import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, type, description } = await req.json();

    if (!title || !type) {
      return NextResponse.json({ error: 'Title and type are required' }, { status: 400 });
    }

    const validTypes = ['question_bank', 'student_report', 'arena_approval', 'other'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
    }

    const docRef = await getAdminDb().collection('executive_requests').add({
      title,
      type,
      description: description || '',
      status: 'pending',
      commanderId: auth.uid,
      commanderEmail: auth.email,
      createdAt: Date.now(),
      handledAt: null,
      handledBy: null,
      executiveComment: null,
    });

    return NextResponse.json({ id: docRef.id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create request' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'commander');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await getAdminDb()
      .collection('executive_requests')
      .where('commanderId', '==', auth.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ requests });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list requests' }, { status: 500 });
  }
}
