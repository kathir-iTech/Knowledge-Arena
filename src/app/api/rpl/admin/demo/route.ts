import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  RPL_ASSESSMENTS,
  RPL_CERTIFICATIONS,
  RPL_CONSISTENCY,
  RPL_FORGE_CACHE,
  RPL_WORKERS,
  sanitizeRplDocId,
} from '@/lib/rpl/rpl-collections';
import { recomputePackConsistency } from '@/lib/rpl/recompute-consistency';
import {
  DEMO_ASSESSOR_EMAILS,
  DEMO_BATCH_ID,
  DEMO_CANDIDATE_EMAIL,
  DEMO_ID_FALLBACK,
  DEMO_PACK_IDS,
  buildDemoWritePlan,
  type DemoIdentity,
} from '@/lib/rpl/demo-data';

export const runtime = 'nodejs';

// Part C1: admin-only in-app demo data. The role is always taken from the
// VERIFIED token (never a client-supplied field), the endpoint is rate limited,
// every written doc carries isDemoData + demoBatchId, and Remove deletes ONLY
// docs flagged isDemoData so real records are never touched.

const DEMO_COLLECTIONS = [
  RPL_WORKERS,
  RPL_ASSESSMENTS,
  RPL_CONSISTENCY,
  RPL_CERTIFICATIONS,
  RPL_FORGE_CACHE,
] as const;

/** Resolve a demo account's uid by email; fall back to a synthetic id. */
async function resolveUid(email: string, fallback: string): Promise<string> {
  try {
    const user = await getAdminAuth().getUserByEmail(email);
    return user.uid;
  } catch {
    return fallback;
  }
}

async function resolveIdentity(adminUid: string): Promise<DemoIdentity> {
  const [assessor1Id, assessor2Id, candidate1Id] = await Promise.all([
    resolveUid(DEMO_ASSESSOR_EMAILS[0], DEMO_ID_FALLBACK.assessor1Id),
    resolveUid(DEMO_ASSESSOR_EMAILS[1], DEMO_ID_FALLBACK.assessor2Id),
    resolveUid(DEMO_CANDIDATE_EMAIL, DEMO_ID_FALLBACK.candidate1Id),
  ]);
  return { adminUid, assessor1Id, assessor2Id, candidate1Id };
}

// POST /api/rpl/admin/demo — load (idempotent) the demo dataset.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['admin']);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:admin-demo:${auth.uid}`, {
      maxRequests: 5,
      windowMs: 60000,
      message: 'Demo loads are limited to 5/min. Please wait.',
    });
    if (rl) return rl;

    const db = getAdminDb();
    const identity = await resolveIdentity(auth.uid);
    const writes = buildDemoWritePlan(identity);

    // ONE logical load, committed in 500-op chunks with set-merge (idempotent).
    for (let i = 0; i < writes.length; i += 500) {
      const batch = db.batch();
      for (const w of writes.slice(i, i + 500)) {
        let ref = db.collection(w.collection).doc(w.docId);
        if (w.subcollection && w.subDocId) {
          ref = ref.collection(w.subcollection).doc(w.subDocId);
        }
        batch.set(ref, w.data, { merge: true });
      }
      await batch.commit();
    }

    // Kappa is computed by the app's own recompute (computeKappa), never typed.
    // Then tag the stored consistency doc so the consistency page and Remove
    // both recognise it as demo data.
    const packs: Array<{ packId: string; kappa: number | null; interpretation: string }> = [];
    for (const packId of DEMO_PACK_IDS) {
      try {
        const report = await recomputePackConsistency(packId);
        await db
          .collection(RPL_CONSISTENCY)
          .doc(sanitizeRplDocId(packId))
          .set({ isDemoData: true, demoBatchId: DEMO_BATCH_ID }, { merge: true });
        packs.push({
          packId,
          kappa: report.overallKappa,
          interpretation: report.interpretation,
        });
      } catch (err) {
        console.warn(
          `[RPL Admin Demo] consistency recompute failed for ${packId}:`,
          err instanceof Error ? err.message : String(err),
        );
        packs.push({ packId, kappa: null, interpretation: 'No data' });
      }
    }

    const byCollection: Record<string, number> = {};
    for (const w of writes) {
      byCollection[w.collection] = (byCollection[w.collection] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      demoBatchId: DEMO_BATCH_ID,
      totalWrites: writes.length,
      byCollection,
      resolved: {
        assessor1Id: identity.assessor1Id,
        assessor2Id: identity.assessor2Id,
        candidate1Id: identity.candidate1Id,
      },
      packs,
    });
  } catch (err) {
    console.error('[RPL Admin Demo POST] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/rpl/admin/demo — remove ONLY docs flagged isDemoData.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['admin']);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:admin-demo-remove:${auth.uid}`, {
      maxRequests: 5,
      windowMs: 60000,
      message: 'Demo removals are limited to 5/min. Please wait.',
    });
    if (rl) return rl;

    const db = getAdminDb();
    let removed = 0;
    const byCollection: Record<string, number> = {};

    for (const collection of DEMO_COLLECTIONS) {
      // Single-field where() (no composite index). recursiveDelete also clears
      // the items/evidence subcollections under demo assessments.
      const snap = await db.collection(collection).where('isDemoData', '==', true).get();
      if (snap.empty) continue;
      byCollection[collection] = snap.size;
      for (const doc of snap.docs) {
        await db.recursiveDelete(doc.ref);
        removed += 1;
      }
    }

    return NextResponse.json({ ok: true, removed, byCollection, demoBatchId: DEMO_BATCH_ID });
  } catch (err) {
    console.error('[RPL Admin Demo DELETE] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
