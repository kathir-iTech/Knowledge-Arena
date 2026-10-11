import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session-cookie';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveSessionRole, readRoleClaim } from '@/lib/session-role';
import { resolveEnvRole } from '@/lib/rpl-role-env';
import { firebaseConfig } from '@/firebase/config';

export const runtime = 'nodejs';

// Phase A3: never return a bare "Failed to create session" — name the actual
// misconfiguration (ids only, never key material) so the operator can fix it.
function projectMismatchResponse(message: string): NextResponse {
  console.error(
    `[Session] SERVICE_ACCOUNT_PROJECT_MISMATCH client=${firebaseConfig.projectId} detail=${message}`,
  );
  return NextResponse.json(
    {
      error:
        `Server session could not be created: the service account key does not belong to ` +
        `Firebase project "${firebaseConfig.projectId}". Set FIREBASE_SERVICE_ACCOUNT_KEY ` +
        `(Service accounts > Generate new private key) for THIS project in Vercel.`,
      code: 'SERVICE_ACCOUNT_PROJECT_MISMATCH',
    },
    { status: 500 },
  );
}

function credentialsErrorResponse(message: string): NextResponse {
  console.error(`[Session] ADMIN_CREDENTIALS_UNAVAILABLE: ${message}`);
  return NextResponse.json(
    {
      error:
        'Server session could not be created: the Firebase Admin credentials are missing or malformed. ' +
        `Target project "${firebaseConfig.projectId}".`,
      code: 'ADMIN_CREDENTIALS_UNAVAILABLE',
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const idToken = typeof body.idToken === 'string' ? body.idToken : null;
    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // Signup handshake: only 'candidate' may be client-asserted (the lowest
    // privilege, same class as the open Google -> gladiator self-signup).
    // admin/assessor/executive/commander can NEVER be self-asserted here.
    const signupRole = body.signupRole === 'candidate' ? ('candidate' as const) : null;
    const signupName =
      typeof body.signupName === 'string' ? body.signupName.trim().slice(0, 100) : '';

    // Phase A2: the cookie must carry the role claim — the edge middleware can
    // only read the token, it has no Firestore access.
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const claimRole = readRoleClaim(decoded);

    // RPL operator config: RPL_ADMIN_EMAILS / RPL_ASSESSOR_EMAILS assign the
    // admin/assessor roles without a Firestore write. Server-side only.
    const envRole = resolveEnvRole(decoded.email, {
      adminEmails: process.env.RPL_ADMIN_EMAILS,
      assessorEmails: process.env.RPL_ASSESSOR_EMAILS,
    });

    let docRole: unknown = null;
    let lookupFailed = false;
    let docExists: boolean | null = null;
    let needDocEnsure = false;
    // Read the user doc whenever claim resolution cannot settle the role on
    // its own (no claim) or an authoritative source must be reconciled with
    // it (env-assigned role, signup handshake).
    if (typeof claimRole !== 'string' || envRole || signupRole) {
      try {
        const userRef = getAdminDb().collection('users').doc(decoded.uid);
        const snap = await userRef.get();
        docExists = snap.exists;
        if (snap.exists) {
          docRole = snap.data()?.role ?? null;
          // Doc exists but may disagree with the authoritative source (env
          // list or a claim that wins below) — reconcile after the decision.
          needDocEnsure = envRole != null;
        } else if (signupRole) {
          // Email/password signup: Firestore rules only allow client
          // self-create with role 'gladiator', so the candidate doc is
          // created here (Admin SDK bypasses rules) and the normal claims
          // handshake assigns the role.
          const email = decoded.email ?? '';
          const name = signupName || decoded.name || email.split('@')[0] || 'Candidate';
          await userRef.set({
            name,
            email,
            avatar: '🧑‍🎓',
            role: signupRole,
          });
          docRole = signupRole;
          console.warn(`[Session] candidate user doc created uid=${decoded.uid}`);
        } else {
          // Doc missing with no signup intent: create it with the resolved
          // role after the decision (env-assigned admin/assessor first login,
          // or a valid claim whose doc was deleted).
          needDocEnsure = true;
        }
      } catch (err) {
        if (typeof claimRole !== 'string') {
          lookupFailed = true;
          console.error(
            `[Session] role lookup failed uid=${decoded.uid} project=${firebaseConfig.projectId}`,
            (err as Error)?.message,
          );
        } else {
          // Valid claim already settles the role; a doc read failure here is
          // non-fatal (the ensure below is skipped, profile fetch reports it).
          console.error(
            `[Session] user doc read failed uid=${decoded.uid} project=${firebaseConfig.projectId}`,
            (err as Error)?.message,
          );
        }
      }
    }

    const decision = resolveSessionRole({ claimRole, docRole, lookupFailed, envRole });

    if (decision.action === 'role-missing') {
      console.error(
        `[Session] ROLE_MISSING uid=${decoded.uid} email=${decoded.email ?? 'n/a'} ` +
          `project=${firebaseConfig.projectId} hasClaim=${claimRole !== undefined} hasUserDoc=${docExists === true}`,
      );
      return NextResponse.json(
        {
          error:
            'This account has no role yet, so it cannot be given a session. ' +
            'Ask your Executive to assign you a role, or use a different account.',
          code: 'ROLE_MISSING',
        },
        { status: 409 },
      );
    }

    if (decision.action === 'lookup-failed') {
      return NextResponse.json(
        {
          error:
            'Could not read your profile to confirm your role (Firestore unavailable). Please try again in a moment.',
          code: 'ROLE_LOOKUP_FAILED',
        },
        { status: 503 },
      );
    }

    // Reconcile the user doc with the authoritative role. The client profile
    // fetch (ensureGladiatorProfile) reads this doc to build local state, so a
    // doc that disagrees with the cookie/claim would route the user to the
    // wrong home. Env-assigned roles (RPL_ADMIN_EMAILS / RPL_ASSESSOR_EMAILS)
    // are operator config and always win.
    if (needDocEnsure && decision.role) {
      try {
        const userRef = getAdminDb().collection('users').doc(decoded.uid);
        const snap = await userRef.get();
        if (!snap.exists) {
          const email = decoded.email ?? '';
          await userRef.set({
            name: decoded.name || email.split('@')[0] || 'User',
            email,
            avatar: '🧑‍🎓',
            role: decision.role,
          });
          console.warn(
            `[Session] user doc created uid=${decoded.uid} role=${decision.role} (doc was missing)`,
          );
        } else if ((snap.data()?.role ?? null) !== decision.role) {
          await userRef.update({ role: decision.role });
          console.warn(
            `[Session] user doc role reconciled uid=${decoded.uid} role=${decision.role}`,
          );
        }
      } catch (err) {
        // Non-fatal: the cookie/claim below is already correct; the client
        // profile fetch surfaces any profile problem on its own.
        console.error(
          `[Session] user doc role sync failed uid=${decoded.uid}`,
          (err as Error)?.message,
        );
      }
    }

    if (decision.action === 'refresh-claims') {
      try {
        // setCustomUserClaims REPLACES the entire claim set. `role` is the only
        // custom claim this app ever writes, so there is nothing else to carry
        // over from the (top-level) decoded token.
        await getAdminAuth().setCustomUserClaims(decoded.uid, { role: decision.role });
      } catch (err) {
        console.error(`[Session] CLAIM_SYNC_FAILED uid=${decoded.uid}`, (err as Error)?.message);
        return NextResponse.json(
          {
            error: `Your role could not be saved to your account (${(err as Error)?.message ?? 'unknown error'}). Please try again.`,
            code: 'CLAIM_SYNC_FAILED',
          },
          { status: 500 },
        );
      }
      console.warn(
        `[Session] role claim synced uid=${decoded.uid} role=${decision.role} ` +
          `project=${firebaseConfig.projectId} (client must refresh the token and re-mint)`,
      );
      return NextResponse.json({ success: true, claimsRefresh: true, role: decision.role });
    }

    const sessionCookie = await createSessionCookie(idToken);

    const response = NextResponse.json({ success: true, role: decision.role });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions());
    return response;
  } catch (err) {
    const e = err as { message?: string; name?: string };
    console.error('[Session] Error:', e?.name, e?.message);
    const message = String(e?.message ?? '');
    if (message.includes('does not match client project')) return projectMismatchResponse(message);
    if (message.includes('id-token-expired') || message.includes('session-cookie-expired')) {
      return NextResponse.json(
        { error: 'Your sign-in token expired. Please sign in again.', code: 'TOKEN_EXPIRED' },
        { status: 401 },
      );
    }
    if (
      message.includes('FIREBASE_SERVICE_ACCOUNT_KEY') ||
      message.includes('invalid JSON') ||
      message.includes('missing required fields') ||
      message.includes('Application Default Credentials') ||
      message.includes('default credentials')
    ) {
      return credentialsErrorResponse(message);
    }
    return NextResponse.json({ error: 'Failed to create session', code: 'SESSION_FAILED' }, { status: 500 });
  }
}
