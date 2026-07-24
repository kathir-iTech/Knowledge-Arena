import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

const SETTINGS_DOC_ID = 'global';

const defaultSettings = {
  institutionName: '',
  institutionLogo: '',
  theme: 'system',
  workspaceName: 'Knowledge Arena',
  auth: {
    allowCommanderSelfRegistration: false,
    allowGladiatorRegistration: true,
  },
  battle: {
    questionTimerDefault: 30,
    maxQuestions: 50,
    defaultDifficulty: 'medium',
    autoEndBattle: false,
    leaderboardVisibility: 'public',
  },
  ai: {
    enabled: true,
    defaultModel: 'gemini-2.0-flash',
    maxPdfSize: 10,
  },
  messaging: {
    enableAnnouncements: true,
    enableChat: true,
  },
  exportPreferences: {
    includeStudentNames: true,
    includeScores: true,
    includeTimestamps: true,
  },
};

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const docRef = getAdminDb().collection('platform_settings').doc(SETTINGS_DOC_ID);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ settings: defaultSettings });
    }

    const data = docSnap.data()!;
    const merged = {
      ...defaultSettings,
      ...data,
      auth: { ...defaultSettings.auth, ...(data.auth || {}) },
      battle: { ...defaultSettings.battle, ...(data.battle || {}) },
      ai: { ...defaultSettings.ai, ...(data.ai || {}) },
      messaging: { ...defaultSettings.messaging, ...(data.messaging || {}) },
      exportPreferences: { ...defaultSettings.exportPreferences, ...(data.exportPreferences || {}) },
    };

    return NextResponse.json({ settings: merged });
  } catch (err: any) {
    console.error('[Settings GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { settings } = await req.json();
    if (!settings) {
      return NextResponse.json({ error: 'settings are required' }, { status: 400 });
    }

    await getAdminDb()
      .collection('platform_settings')
      .doc(SETTINGS_DOC_ID)
      .set(settings, { merge: true });

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'settings_changed',
      target: 'global',
      metadata: { updatedKeys: Object.keys(settings) },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Settings PUT] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
