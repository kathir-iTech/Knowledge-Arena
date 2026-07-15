import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

const SETTINGS_DOC_ID = 'global';

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const docRef = getAdminDb().collection('platform_settings').doc(SETTINGS_DOC_ID);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({
        settings: {
          institutionName: '',
          institutionLogo: '',
          battleDefaults: {
            questionTimerDefault: 30,
            maxQuestions: 50,
            defaultDifficulty: 'medium',
          },
          exportPreferences: {
            includeStudentNames: true,
            includeScores: true,
            includeTimestamps: true,
          },
        },
      });
    }

    return NextResponse.json({ settings: docSnap.data() });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { settings } = await req.json();

    if (!settings) {
      return NextResponse.json({ error: 'settings are required' }, { status: 400 });
    }

    await getAdminDb()
      .collection('platform_settings')
      .doc(SETTINGS_DOC_ID)
      .set(settings, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save settings' }, { status: 500 });
  }
}
