import { firebaseConfig } from '@/firebase/config';

interface AuthResult {
  uid: string;
  email: string | null;
}

async function verifyTokenString(idToken: string): Promise<AuthResult | null> {
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

async function fetchUserRoleViaRest(idToken: string, uid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${uid}`,
      {
        headers: { 'Authorization': `Bearer ${idToken}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.fields?.role?.stringValue ?? null;
  } catch {
    return null;
  }
}

export async function verifyFirebaseToken(token: string): Promise<AuthResult | null>;
export async function verifyFirebaseToken(request: Request): Promise<AuthResult | null>;
export async function verifyFirebaseToken(tokenOrRequest: string | Request): Promise<AuthResult | null> {
  if (typeof tokenOrRequest === 'string') {
    return verifyTokenString(tokenOrRequest);
  }
  const authHeader = tokenOrRequest.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyTokenString(authHeader.slice(7));
}

export async function verifyFirebaseTokenWithRole(
  tokenOrRequest: string | Request,
  requiredRole: 'executive' | 'commander' | 'gladiator',
): Promise<AuthResult | null> {
  let idToken: string | null = null;

  if (typeof tokenOrRequest === 'string') {
    idToken = tokenOrRequest;
  } else {
    const authHeader = tokenOrRequest.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    idToken = authHeader.slice(7);
  }

  const auth = await verifyTokenString(idToken);
  if (!auth) return null;

  const role = await fetchUserRoleViaRest(idToken, auth.uid);
  if (role !== requiredRole) return null;

  return auth;
}
