import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!executiveAuth && !commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = executiveAuth || commanderAuth!;
    const role = executiveAuth ? 'executive' : 'commander';

    const { action, target, metadata } = await req.json();
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: role,
      action,
      target: target || '',
      metadata: metadata || {},
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
