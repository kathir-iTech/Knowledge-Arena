import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_WORKERS } from '@/lib/rpl/rpl-collections';
import { allocateReferenceCode, isReferenceCode } from '@/lib/rpl/reference-code';

export const runtime = 'nodejs';

const ALLOWED_MARKS = new Set(['can-do', 'done', 'never']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function asRecord(value: unknown): AnyRecord {
  return typeof value === 'object' && value !== null ? (value as AnyRecord) : {};
}

export async function POST(req: NextRequest) {
  try {
    // Signed-in users only (any role — worker-facing declaration).
    const auth = await verifyFirebaseToken(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:declare:${auth.uid}`, {
      maxRequests: 15,
      windowMs: 60000,
      message: 'Declaration limit reached (15/min). Please wait.',
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => null)) as AnyRecord | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const nested = asRecord(body.declaration);

    // --- trade (required) ---
    const rawTrade =
      typeof body.trade === 'string'
        ? body.trade
        : typeof nested.trade === 'string'
          ? nested.trade
          : '';
    const trade = rawTrade.trim();
    if (!trade) {
      return NextResponse.json({ error: 'trade is required' }, { status: 400 });
    }

    // --- yearsExperience (0-60) ---
    const rawYears = body.yearsExperience ?? nested.yearsExperience;
    const yearsExperience =
      typeof rawYears === 'number'
        ? rawYears
        : typeof rawYears === 'string' && rawYears.trim() !== ''
          ? Number(rawYears)
          : NaN;
    if (!Number.isFinite(yearsExperience) || yearsExperience < 0 || yearsExperience > 60) {
      return NextResponse.json(
        { error: 'yearsExperience must be a number between 0 and 60' },
        { status: 400 },
      );
    }

    // --- declarationsByPack (optional, lightly validated) ---
    const rawDecls =
      body.declarationsByPack && typeof body.declarationsByPack === 'object'
        ? asRecord(body.declarationsByPack)
        : nested.declarationsByPack && typeof nested.declarationsByPack === 'object'
          ? asRecord(nested.declarationsByPack)
          : {};
    const declarationsByPack: Record<string, { unitId: string; status: string }[]> = {};
    for (const [packId, entries] of Object.entries(rawDecls)) {
      if (!Array.isArray(entries)) {
        return NextResponse.json(
          { error: `declarationsByPack["${packId}"] must be an array` },
          { status: 400 },
        );
      }
      declarationsByPack[packId] = entries.map((e) => {
        const item = asRecord(e);
        const status = typeof item.status === 'string' ? item.status : 'never';
        if (!ALLOWED_MARKS.has(status)) {
          throw new Response(JSON.stringify({ error: `Invalid mark "${status}"` }), {
            status: 400,
          });
        }
        return {
          unitId: typeof item.unitId === 'string' ? item.unitId : '',
          status,
        };
      });
    }

    // --- B1: at least one can-do/done skill is required ---
    // The wizard blocks Next on an empty claim set; this is the authoritative
    // guard so an offline replay or stale client can never persist an empty
    // declaration.
    const claimedSkillCount = Object.values(declarationsByPack)
      .flat()
      .filter((entry) => entry.status === 'can-do' || entry.status === 'done').length;
    if (claimedSkillCount === 0) {
      return NextResponse.json(
        {
          error: 'Mark at least one skill as can-do or done before submitting.',
          code: 'NO_SKILL_CLAIMED',
        },
        { status: 400 },
      );
    }

    // --- evidenceTextByPack (each <= 500 chars) ---
    const rawEvidence =
      body.evidenceTextByPack && typeof body.evidenceTextByPack === 'object'
        ? asRecord(body.evidenceTextByPack)
        : nested.evidenceTextByPack && typeof nested.evidenceTextByPack === 'object'
          ? asRecord(nested.evidenceTextByPack)
          : {};
    const evidenceTextByPack: Record<string, string> = {};
    for (const [packId, text] of Object.entries(rawEvidence)) {
      if (typeof text !== 'string') {
        return NextResponse.json(
          { error: `evidenceTextByPack["${packId}"] must be a string` },
          { status: 400 },
        );
      }
      if (text.length > 500) {
        return NextResponse.json(
          { error: `evidenceTextByPack["${packId}"] must be at most 500 characters` },
          { status: 400 },
        );
      }
      evidenceTextByPack[packId] = text;
    }

    // --- optional profile fields ---
    const sector =
      typeof body.sector === 'string'
        ? body.sector
        : typeof nested.sector === 'string'
          ? nested.sector
          : '';
    const location =
      typeof body.location === 'string'
        ? body.location
        : typeof nested.location === 'string'
          ? nested.location
          : '';
    const employerType =
      typeof body.employerType === 'string'
        ? body.employerType
        : typeof nested.employerType === 'string'
          ? nested.employerType
          : '';
    const name =
      typeof body.name === 'string'
        ? body.name
        : typeof nested.name === 'string'
          ? nested.name
          : undefined;
    const declarationText =
      typeof body.declarationText === 'string'
        ? body.declarationText
        : typeof nested.declarationText === 'string'
          ? nested.declarationText
          : '';

    // --- matchedPacks: string[] of pack ids ---
    const rawMatched = Array.isArray(body.matchedPacks)
      ? body.matchedPacks
      : Array.isArray(nested.matchedPacks)
        ? nested.matchedPacks
        : [];
    let matchedPacks: string[] = rawMatched.filter(
      (x): x is string => typeof x === 'string' && x.length > 0,
    );
    if (matchedPacks.length === 0) {
      matchedPacks = Object.keys(declarationsByPack);
    }

    const uid = auth.uid;
    const now = Date.now();
    const db = getAdminDb();
    const ref = db.collection(RPL_WORKERS).doc(uid);
    const existing = await ref.get().catch(() => null);
    const prevData = existing && existing.exists ? (existing.data() as AnyRecord) : null;

    // B2: the reference code is human-readable and NEVER the UID.
    //  - reuse a valid code already on the worker doc (idempotent re-declare
    //    and offline-queue replay must not churn the code);
    //  - accept a valid code supplied by the client (a client that already
    //    knows its code can keep it stable);
    //  - otherwise allocate a fresh unique code.
    const bodyCode =
      typeof body.referenceCode === 'string'
        ? body.referenceCode
        : typeof nested.referenceCode === 'string'
          ? nested.referenceCode
          : '';
    const existingCode = isReferenceCode(prevData?.assessmentReferenceCode)
      ? (prevData?.assessmentReferenceCode as string)
      : null;
    const referenceCode =
      existingCode ?? (isReferenceCode(bodyCode) ? bodyCode : await allocateReferenceCode(db));

    const profile = {
      uid,
      ...(typeof name === 'string' && name ? { name } : {}),
      trade,
      sector,
      yearsExperience,
      location,
      employerType,
    };
    const declaration = {
      workerId: uid,
      trade,
      sector,
      yearsExperience,
      location,
      employerType,
      declarationText,
      declarationsByPack,
      evidenceTextByPack,
      matchedPacks,
    };

    await ref.set(
      {
        ...profile,
        declaration,
        matchedPacks,
        assessmentReferenceCode: referenceCode,
        declarationSubmittedAt: now,
        createdAt: typeof prevData?.createdAt === 'number' ? prevData.createdAt : now,
        updatedAt: now,
      },
      { merge: true },
    );

    return NextResponse.json({ id: uid, referenceCode });
  } catch (err) {
    // Validation errors thrown as Response above.
    if (err instanceof Response) return err;
    console.error('[RPL Declare] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
