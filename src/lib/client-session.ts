// Phase A2 — client half of the session/role handshake.
//
// /api/auth/session can answer `claimsRefresh: true` when the server had to
// write the `role` custom claim: the cookie minted from the token sent in that
// request would carry no role, so the edge middleware would bounce the user
// straight back to /login. The token must be force-refreshed and the cookie
// re-minted exactly once.

export const SESSION_ENDPOINT = '/api/auth/session';

export interface MintSessionResult {
  ok: boolean;
  /** HTTP status, or 0 when the request never reached the server */
  status: number;
  errorCode: string;
  errorMessage: string;
  role: string | null;
  /** true when the server synced the role claim during this handshake */
  claimSynced: boolean;
}

interface SessionResponseBody {
  success?: boolean;
  claimsRefresh?: boolean;
  role?: string;
  error?: string;
  code?: string;
}

export async function mintSessionCookie(
  getIdToken: (forceRefresh: boolean) => Promise<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<MintSessionResult> {
  const post = async (forceRefresh: boolean) => {
    const idToken = await getIdToken(forceRefresh);
    const res = await fetchImpl(SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    let body: SessionResponseBody | null = null;
    try {
      body = (await res.json()) as SessionResponseBody;
    } catch {
      body = null;
    }
    return { res, body };
  };

  try {
    let claimSynced = false;
    let { res, body } = await post(false);

    if (res.ok && body?.claimsRefresh) {
      claimSynced = true;
      ({ res, body } = await post(true));
      // Never loop: if the server still reports the claim unsynced after a
      // forced refresh, fail loudly instead of hammering the endpoint.
      if (res.ok && body?.claimsRefresh) {
        return {
          ok: false,
          status: res.status,
          errorCode: 'CLAIM_SYNC_LOOP',
          errorMessage:
            'Your role could not be attached to this session. Please sign out and sign in again.',
          role: null,
          claimSynced: true,
        };
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorCode: body?.code || `HTTP_${res.status}`,
        errorMessage:
          body?.error || `Session creation failed (HTTP ${res.status}). Please try again.`,
        role: null,
        claimSynced,
      };
    }

    return {
      ok: true,
      status: res.status,
      errorCode: '',
      errorMessage: '',
      role: body?.role ?? null,
      claimSynced,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      errorCode: 'NETWORK_ERROR',
      errorMessage: `Could not reach the session service (${message}). Please try again.`,
      role: null,
      claimSynced: false,
    };
  }
}
