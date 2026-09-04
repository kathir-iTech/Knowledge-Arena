import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { auditService } from '@/services/audit.service';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

const ALLOWED_ACTIONS = new Set([
  'commander_created',
  'commander_renamed',
  'commander_deleted',
  'commander_disabled',
  'commander_enabled',
  'gladiator_deleted',
  'password_reset',
  'conversation_created',
  'conversation_deleted',
  'conversation_left',
  'message_sent',
  'announcement_sent',
  'announcement_edited',
  'announcement_deleted',
  'request_created',
  'request_handled',
  'request_deleted',
  'question_bank_import',
  'settings_changed',
  'profile_updated',
  'backup_created',
  'backup_imported',
]);

const MAX_METADATA_KEYS = 20;

export async function POST(req: NextRequest) {
  try {
    const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!executiveAuth && !commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = executiveAuth || commanderAuth!;
    const role = executiveAuth ? 'executive' : 'commander';

    const rateLimitResponse = await enforceRateLimit(`audit:${auth.uid}`, Limits.AUDIT_WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    let action: unknown;
    let target: unknown;
    let metadata: unknown;
    try {
      const body = await req.json();
      action = body?.action;
      target = body?.target;
      metadata = body?.metadata;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof action !== 'string' || action.length === 0) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (target !== undefined && target !== null && typeof target !== 'string') {
      return NextResponse.json({ error: 'target must be a string' }, { status: 400 });
    }
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        return NextResponse.json({ error: 'metadata must be an object' }, { status: 400 });
      }
      const keys = Object.keys(metadata);
      if (keys.length > MAX_METADATA_KEYS) {
        return NextResponse.json({ error: 'metadata has too many keys' }, { status: 400 });
      }
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: role,
      action,
      target: typeof target === 'string' ? target : '',
      metadata: metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {},
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
