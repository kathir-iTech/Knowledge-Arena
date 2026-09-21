// Isolates the deliverable of this sweep: whether the Admin SDK validates
// tokens minted by the LOCAL Auth emulator. The submit route's auth seam is
//   verifyFirebaseTokenWithAnyRole(token, ['gladiator','commander'])
// which after verifyIdToken ALSO requires the `gladiator`/`commander` role
// claim to survive into the ID token. So this probe walks the FULL path:
//   1. create user on the Auth emulator
//   2. set custom claim role:gladiator  (exactly the harness's mint step)
//   3. mint a REAL ID token via the client SDK against the auth emulator
//   4. Admin verifyIdToken on it   (binding seam)
//   5. decode the ID token's `role` claim  (role seam — the 0/50 suspect)
//   6. Admin getUser().customClaims          (emulator-side state)
//
// Usage: set FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST first.
import { initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as clientInit } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';

const PROJECT_ID = 'demo-quorena';

const adminApp = initializeApp({ projectId: PROJECT_ID });
const adminAuth = getAdminAuth(adminApp);

const uid = `probe-${Date.now()}`;
await adminAuth.createUser({ uid });
await adminAuth.setCustomUserClaims(uid, { role: 'gladiator' });
const customToken = await adminAuth.createCustomToken(uid);

const client = clientInit({ projectId: PROJECT_ID, apiKey: 'demo-key' });
const clientAuth = getClientAuth(client);
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
const cred = await signInWithCustomToken(clientAuth, customToken);
const idToken = await cred.user.getIdToken();

const [head, body] = idToken.split('.').slice(0, 2).map((p) =>
  JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
);
console.log('token header kid/alg :', head.kid, head.alg);
console.log('token claim iss      :', body.iss, '| aud:', body.aud, '| uid:', body.user_id);

try {
  const decoded = await adminAuth.verifyIdToken(idToken);
  console.log('ADMIN verifyIdToken  : OK  ->', decoded.uid);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log('ADMIN verifyIdToken  : FAIL ->', msg.slice(0, 220));
}

const claims = await adminAuth.getUser(uid).then((u) => u.customClaims ?? {});
console.log('ADMIN customClaims   :', JSON.stringify(claims));
console.log('TOKEN role claim     :', body.role);
console.log('ROLE GATE            :', body.role === 'gladiator' ? 'OK' : `FAIL role=${body.role}`);
process.exit(0);
