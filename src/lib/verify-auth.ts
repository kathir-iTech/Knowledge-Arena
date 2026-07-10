import { firebaseConfig } from '@/firebase/config';

async function verifyTokenString(idToken: string): Promise<{ uid: string; email: string | null } | null> {
  if (!idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.users?.length) return null;
    const user = data.users[0];
    return { uid: user.localId, email: user.email ?? null };
  } catch {
    return null;
  }
}

export async function verifyFirebaseToken(token: string): Promise<{ uid: string; email: string | null } | null>;
export async function verifyFirebaseToken(request: Request): Promise<{ uid: string; email: string | null } | null>;
export async function verifyFirebaseToken(tokenOrRequest: string | Request): Promise<{ uid: string; email: string | null } | null> {
  if (typeof tokenOrRequest === 'string') {
    return verifyTokenString(tokenOrRequest);
  }
  const authHeader = tokenOrRequest.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyTokenString(authHeader.slice(7));
}
