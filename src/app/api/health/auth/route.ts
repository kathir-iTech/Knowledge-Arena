import { NextResponse } from 'next/server';
import { firebaseConfig } from '@/firebase/config';

export const runtime = 'nodejs';

// Phase A3 — a read-only, secret-free diagnostic for the login chain:
//   GET /api/health/auth
// returns the project id the browser bundle talks to, the project id the Admin
// credentials belong to, and whether they match. "Unauthorized" errors in the
// wild were a service-account from a DIFFERENT Firebase project; this endpoint
// makes that visible in one request instead of a broken sign-in.
function serviceAccountProjectId(): { projectId: string | null; source: string } {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv) as { project_id?: unknown };
      const projectId = typeof parsed.project_id === 'string' ? parsed.project_id : null;
      return { projectId, source: 'FIREBASE_SERVICE_ACCOUNT_KEY' };
    } catch {
      return { projectId: null, source: 'FIREBASE_SERVICE_ACCOUNT_KEY (unparseable JSON)' };
    }
  }
  if (process.env.SERVICE_ACCOUNT_PATH) return { projectId: null, source: 'SERVICE_ACCOUNT_PATH (not read)' };
  return { projectId: null, source: 'none' };
}

export async function GET() {
  const emulator = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_DATABASE_EMULATOR_HOST,
  );
  const admin = serviceAccountProjectId();
  const clientProjectId = firebaseConfig.projectId;
  const match = emulator || (admin.projectId !== null && admin.projectId === clientProjectId);

  return NextResponse.json(
    {
      ok: match,
      mode: emulator ? 'emulator' : 'production',
      clientProjectId,
      authDomain: firebaseConfig.authDomain,
      adminProjectId: admin.projectId,
      adminSource: admin.source,
      match,
      checkedAt: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
