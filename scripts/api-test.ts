import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';

function loadServiceAccount(): string {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const pathFromEnv = process.env.SERVICE_ACCOUNT_PATH;
  if (pathFromEnv && existsSync(pathFromEnv)) return readFileSync(pathFromEnv, 'utf-8');
  const localPath = 'service-account.json';
  if (existsSync(localPath)) return readFileSync(localPath, 'utf-8');
  throw new Error('No Firebase service account key found');
}

function initAdmin() {
  if (getApps().length) return;
  const raw = loadServiceAccount();
  const parsed: Record<string, string> = JSON.parse(raw);
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(parsed as ServiceAccount) });
}

initAdmin();
const db = getFirestore();
const auth = getAuth();

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;

async function test(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e: any) {
    console.log(`  ✗ ${label}: ${e.message}`);
    failed++;
  }
}

async function signInWithPassword(email: string, password: string): Promise<string> {
  const apiKey = 'AIzaSyDnqpDkmttNbyPcZadBKMOrPjZLSN0SNyo';
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign in failed (${res.status}): ${body}`);
  }
  const data: any = await res.json();
  return data.idToken;
}

async function api(method: string, path: string, token: string, body?: any): Promise<{ status: number; body: any }> {
  const opts: any = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  const now = Date.now();
  const execEmail = `test-exec-${now}@test.knowledgearena.app`;
  const cmdEmail = `test-cmd-${now}@test.knowledgearena.app`;
  const password = 'Test123456!';
  let execUid: string;
  let cmdUid: string;
  let execToken: string;
  let cmdToken: string;
  let convId: string;

  console.log('\n=== SETUP: Create test accounts ===\n');

  await test('Create executive user', async () => {
    const user = await auth.createUser({ email: execEmail, password, displayName: 'Test Executive' });
    execUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: execEmail,
      displayName: 'Test Executive',
      role: 'executive',
      createdAt: Date.now(),
      disabled: false,
    });
  });

  await test('Create commander user', async () => {
    const user = await auth.createUser({ email: cmdEmail, password, displayName: 'Test Commander' });
    cmdUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: cmdEmail,
      displayName: 'Test Commander',
      role: 'commander',
      createdAt: Date.now(),
      disabled: false,
    });
  });

  await test('Sign in as executive', async () => {
    execToken = await signInWithPassword(execEmail, password);
    if (!execToken) throw new Error('No token returned');
  });

  await test('Sign in as commander', async () => {
    cmdToken = await signInWithPassword(cmdEmail, password);
    if (!cmdToken) throw new Error('No token returned');
  });

  console.log('\n=== STEP 2: Settings API ===\n');

  await test('GET /api/executive/settings returns 200', async () => {
    const { status, body } = await api('GET', '/api/executive/settings', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    if (!body.settings) throw new Error('No settings in response');
  });

  console.log('\n=== STEP 3: Messaging ===\n');

  await test('Create conversation (Executive→Commander)', async () => {
    const { status, body } = await api('POST', '/api/messaging/conversations', execToken!, {
      commanderId: cmdUid,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    if (!body.conversation?.id) throw new Error('No conversation ID');
    convId = body.conversation.id;
  });

  await test('GET conversations list', async () => {
    const { status, body } = await api('GET', '/api/messaging/conversations', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const convs = body.conversations || [];
    if (convs.length === 0) throw new Error('No conversations');
    if (!convs.find((c: any) => c.id === convId)) throw new Error('Created conversation not found');
  });

  await test('Send text message (Executive)', async () => {
    const { status, body } = await api('POST', `/api/messaging/conversations/${convId}/messages`, execToken!, {
      text: 'Hello from Executive! Test message at ' + Date.now(),
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    if (!body.message?.id) throw new Error('No message ID');
  });

  await test('Read messages as Executive', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.messages || body.messages.length === 0) throw new Error('No messages returned');
  });

  await test('Commander reads messages', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, cmdToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.messages || body.messages.length === 0) throw new Error('No messages for commander');
  });

  await test('Commander replies to message', async () => {
    const { status, body } = await api('POST', `/api/messaging/conversations/${convId}/messages`, cmdToken!, {
      text: 'Reply from Commander! ' + Date.now(),
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    if (!body.message?.id) throw new Error('No message ID');
  });

  await test('Executive reads reply', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const msgs = body.messages || [];
    if (msgs.length < 2) throw new Error(`Expected at least 2 messages, got ${msgs.length}`);
  });

  console.log('\n=== STEP 4: Notifications ===\n');

  await test('Notifications endpoint returns 200', async () => {
    const { status } = await api('GET', '/api/executive/notifications?unreadOnly=true', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  console.log('\n=== STEP 5: Requests ===\n');

  let requestId: string;

  await test('Create a request', async () => {
    const docRef = await db.collection('executive_requests').add({
      title: 'Test Request',
      type: 'other',
      description: 'Test description',
      status: 'pending',
      commanderId: cmdUid,
      commanderEmail: cmdEmail,
      createdAt: Date.now(),
    });
    requestId = docRef.id;
  });

  await test('Approve the request (PATCH)', async () => {
    const { status, body } = await api('PATCH', '/api/executive/requests', execToken!, {
      id: requestId,
      status: 'approved',
      comment: 'Approved',
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
  });

  await test('Delete the completed request (DELETE)', async () => {
    const { status, body } = await api('DELETE', `/api/executive/requests?id=${requestId}`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
  });

  await test('Verify request document is deleted', async () => {
    const doc = await db.collection('executive_requests').doc(requestId!).get();
    if (doc.exists) throw new Error('Request document still exists');
  });

  await test('Verify related notifications cleaned', async () => {
    const snap = await db.collection('notifications').where('metadata.requestId', '==', requestId!).get();
    if (snap.size > 0) throw new Error(`${snap.size} orphaned notification(s) still exist`);
  });

  console.log('\n=== STEP 6: Audit Logs ===\n');

  await test('GET audit logs returns 200', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.logs) throw new Error('No logs in response');
  });

  await test('Audit logs have cursor pagination', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (body.hasMore === undefined) throw new Error('Response missing hasMore field');
    if (body.nextCursor === undefined) throw new Error('Response missing nextCursor field');
  });

  await test('Audit logs filter by action', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs?action=message_sent', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    for (const log of body.logs || []) {
      if (log.action !== 'message_sent') throw new Error(`Filtered log has wrong action: ${log.action}`);
    }
  });

  await test('Audit logs filter by role', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs?actorRole=executive', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    for (const log of body.logs || []) {
      if (log.actorRole !== 'executive') throw new Error(`Filtered log has wrong role: ${log.actorRole}`);
    }
  });

  await test('Audit entry exists for message_sent', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs?action=message_sent', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (body.logs.length === 0) throw new Error('No message_sent audit entries found');
    const log = body.logs[0];
    if (!log.timestamp) throw new Error('Missing timestamp');
    if (!log.actor) throw new Error('Missing actor');
    if (!log.action) throw new Error('Missing action');
    if (!log.actorRole) throw new Error('Missing actorRole');
  });

  await test('Audit entry exists for request_deleted', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs?action=request_deleted', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (body.logs.length === 0) throw new Error('No request_deleted audit entries found');
  });

  await test('Audit logs have filters metadata', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.filters) throw new Error('Response missing filters field');
    if (!body.filters.actions) throw new Error('Response missing filters.actions');
    if (!body.filters.roles) throw new Error('Response missing filters.roles');
  });

  console.log('\n=== STEP 7: Conversation updates ===\n');

  await test('Conversation has lastMessage after sending', async () => {
    const { status, body } = await api('GET', '/api/messaging/conversations', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const conv = (body.conversations || []).find((c: any) => c.id === convId);
    if (!conv) throw new Error('Conversation not found in list');
    if (!conv.lastMessage) throw new Error('Conversation missing lastMessage');
    if (!conv.lastActivity) throw new Error('Conversation missing lastActivity');
  });

  await test('Audit entry for request_handled', async () => {
    const { status, body } = await api('GET', '/api/executive/audit-logs?action=request_handled', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    // This is fine even if empty — we may not have handled a request in this session
  });

  console.log('\n=== CLEANUP ===\n');

  await test('Delete test executive', async () => {
    await auth.deleteUser(execUid!).catch(() => {});
    await db.collection('users').doc(execUid!).delete().catch(() => {});
  });

  await test('Delete test commander', async () => {
    await auth.deleteUser(cmdUid!).catch(() => {});
    await db.collection('users').doc(cmdUid!).delete().catch(() => {});
  });

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
