import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const executiveAuth = await verifyFirebaseTokenWithRole(req, 'executive');
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!executiveAuth && !commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = executiveAuth || commanderAuth!;

    const { id } = await params;
    const db = getAdminDb();
    const convRef = db.collection('conversations').doc(id);
    const conv = await convRef.get();
    if (!conv.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const convData = conv.data()!;
    if (!executiveAuth && !convData.participants?.includes(auth.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messagesSnap = await convRef.collection('messages').select().get();
    if (!messagesSnap.empty) {
      const batches: any[] = [];
      let batch = db.batch();
      let opCount = 0;
      for (const msgDoc of messagesSnap.docs) {
        batch.delete(msgDoc.ref);
        opCount++;
        if (opCount >= 500) {
          batches.push(batch.commit());
          batch = db.batch();
          opCount = 0;
        }
      }
      if (opCount > 0) batches.push(batch.commit());
      await Promise.all(batches);
    }

    await convRef.delete();

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: executiveAuth ? 'executive' : 'commander',
      action: 'conversation_deleted',
      target: id,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Conversation DELETE] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const commanderAuth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!commanderAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const db = getAdminDb();
    const convRef = db.collection('conversations').doc(id);
    const conv = await convRef.get();
    if (!conv.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const convData = conv.data()!;
    if (!convData.participants?.includes(commanderAuth.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updatedParticipants = (convData.participants as string[]).filter(
      (p: string) => p !== commanderAuth.uid
    );

    if (updatedParticipants.length === 0) {
      const messagesSnap = await convRef.collection('messages').select().get();
      if (!messagesSnap.empty) {
        const batch = db.batch();
        messagesSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      await convRef.delete();
    } else {
      await convRef.update({
        participants: updatedParticipants,
        lastActivity: Date.now(),
      });
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: commanderAuth.uid,
      actorRole: 'commander',
      action: 'conversation_left',
      target: id,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Conversation PATCH] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
