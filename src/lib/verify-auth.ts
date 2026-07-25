import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

interface AuthResult {
  uid: string;
  email: string | null;
}

export async function verifyFirebaseToken(token: string): Promise<AuthResult | null>;
export async function verifyFirebaseToken(request: Request): Promise<AuthResult | null>;
export async function verifyFirebaseToken(tokenOrRequest: string | Request): Promise<AuthResult | null> {
  let idToken: string | null = null;

  if (typeof tokenOrRequest === 'string') {
    idToken = tokenOrRequest;
  } else {
    const authHeader = tokenOrRequest.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    idToken = authHeader.slice(7);
  }

  if (!idToken) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
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

  if (!idToken) return null;

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return null;
  }

  try {
    const userDoc = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return null;
    const role = userDoc.data()?.role;
    if (role !== requiredRole) return null;
  } catch {
    return null;
  }

  return { uid: decoded.uid, email: decoded.email ?? null };
}
