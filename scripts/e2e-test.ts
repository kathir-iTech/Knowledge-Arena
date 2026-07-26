/**
 * E2E Tests for Knowledge Arena
 * Uses Admin SDK to create accounts, runs full workflows, then cleans up.
 */
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';

function loadServiceAccount(): string {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const pathFromEnv = process.env.SERVICE_ACCOUNT_PATH;
  if (pathFromEnv && existsSync(pathFromEnv)) return readFileSync(pathFromEnv, 'utf-8');
  if (existsSync('service-account.json')) return readFileSync('service-account.json', 'utf-8');
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
    console.log(`  \u2713 ${label}`);
    passed++;
  } catch (e: any) {
    console.log(`  \u2717 ${label}: ${e.message}`);
    failed++;
  }
}

async function signIn(email: string, password: string): Promise<string> {
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
  const execEmail = `e2e-exec-${now}@test.knowledgearena.app`;
  const cmdEmail = `e2e-cmd-${now}@test.knowledgearena.app`;
  const glaEmail = `e2e-gla-${now}@test.knowledgearena.app`;
  const password = 'Test123456!';
  let execUid: string;
  let cmdUid: string;
  let glaUid: string;
  let execToken: string;
  let cmdToken: string;
  let glaToken: string;
  let convId: string;
  let msgId: string;
  let msgId2: string;
  let annId: string;

  console.log('\n=== SETUP: Create Test Accounts ===\n');

  await test('Create executive', async () => {
    const user = await auth.createUser({ email: execEmail, password, displayName: 'E2E Executive' });
    execUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: execEmail, displayName: 'E2E Executive', role: 'executive', createdAt: Date.now(), disabled: false,
    });
  });

  await test('Create commander', async () => {
    const user = await auth.createUser({ email: cmdEmail, password, displayName: 'E2E Commander' });
    cmdUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: cmdEmail, displayName: 'E2E Commander', role: 'commander', createdAt: Date.now(), disabled: false,
    });
  });

  await test('Create gladiator', async () => {
    const user = await auth.createUser({ email: glaEmail, password, displayName: 'E2E Gladiator' });
    glaUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: glaEmail, displayName: 'E2E Gladiator', role: 'gladiator', createdAt: Date.now(), disabled: false,
    });
  });

  await test('Sign in as executive', async () => {
    execToken = await signIn(execEmail, password);
    if (!execToken) throw new Error('No token');
  });

  await test('Sign in as commander', async () => {
    cmdToken = await signIn(cmdEmail, password);
    if (!cmdToken) throw new Error('No token');
  });

  await test('Sign in as gladiator', async () => {
    glaToken = await signIn(glaEmail, password);
    if (!glaToken) throw new Error('No token');
  });

  // =========== EXECUTIVE PAGES ===========
  console.log('\n=== EXECUTIVE PAGE ACCESS ===\n');

  for (const [name, path] of [
    ['Settings', '/api/executive/settings'],
    ['Notifications', '/api/executive/notifications'],
    ['Audit Logs', '/api/executive/audit-logs'],
    ['Question Bank', '/api/executive/question-bank'],
  ]) {
    await test(`GET ${name}`, async () => {
      const { status } = await api('GET', path, execToken!);
      if (status === 401 || status === 403) throw new Error(`Auth error: ${status}`);
      if (status === 500) throw new Error(`Server error: ${status}`);
    });
  }

  // =========== MESSAGING ===========
  console.log('\n=== MESSAGING ===\n');

  await test('Create conversation', async () => {
    const { status, body } = await api('POST', '/api/messaging/conversations', execToken!, {
      commanderId: cmdUid,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    convId = body.conversation.id;
  });

  await test('Conversations list has participantNames', async () => {
    const { status, body } = await api('GET', '/api/messaging/conversations', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const conv = (body.conversations || []).find((c: any) => c.id === convId);
    if (!conv) throw new Error('Conversation not found');
    if (!conv.participantNames || !conv.participantNames[cmdUid]) {
      throw new Error('participantNames missing: ' + JSON.stringify(conv.participantNames));
    }
    if (conv.participantNames[cmdUid] !== 'E2E Commander') {
      throw new Error(`Expected "E2E Commander", got "${conv.participantNames[cmdUid]}"`);
    }
  });

  await test('Send text message from Executive', async () => {
    const { status, body } = await api('POST', `/api/messaging/conversations/${convId}/messages`, execToken!, {
      text: 'Hello Commander! ' + now,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    msgId = body.message.id;
  });

  await test('Executive reads own message', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.messages || body.messages.length === 0) throw new Error('No messages returned');
  });

  await test('Commander receives message', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, cmdToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.messages || body.messages.length === 0) throw new Error('No messages for commander');
  });

  await test('Commander replies', async () => {
    const { status, body } = await api('POST', `/api/messaging/conversations/${convId}/messages`, cmdToken!, {
      text: 'Reply from Commander! ' + now,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    msgId2 = body.message.id;
  });

  await test('Executive receives reply', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if ((body.messages || []).length < 2) throw new Error('Expected 2+ messages');
  });

  // Send file attachments
  await test('Send PDF attachment', async () => {
    const pdfData = Buffer.from('%PDF-1.4 test').toString('base64');
    const { status, body } = await api('POST', `/api/messaging/conversations/${convId}/messages`, execToken!, {
      text: 'Here is a PDF',
      attachments: [{ name: 'test.pdf', type: 'application/pdf', size: 20, data: pdfData }],
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('Send image attachment', async () => {
    const imgData = Buffer.from('fake-png-data').toString('base64');
    const { status, body } = await api('POST', `/api/messaging/conversations/${convId}/messages`, execToken!, {
      text: 'Here is an image',
      attachments: [{ name: 'test.png', type: 'image/png', size: 20, data: imgData }],
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('Commander downloads attachment', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, cmdToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const msgs = body.messages || [];
    const hasAttachment = msgs.some((m: any) => m.attachments && m.attachments.length > 0);
    if (!hasAttachment) throw new Error('No attachment messages found');
  });

  // Delete message
  await test('Delete own message (Executive)', async () => {
    if (!msgId) throw new Error('No message ID');
    const { status } = await api('DELETE', `/api/messaging/conversations/${convId}/messages/${msgId}`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('Verify message deleted', async () => {
    const { status, body } = await api('GET', `/api/messaging/conversations/${convId}/messages`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const msgs = body.messages || [];
    if (msgs.some((m: any) => m.id === msgId)) throw new Error('Deleted message still exists');
  });

  // Delete conversation
  await test('Delete conversation', async () => {
    // Create a separate commander for this test so we don't re-use convId
    const sepCmd = await auth.createUser({ email: `sep-cmd-${now}@test.knowledgearena.app`, password, displayName: 'Separate Commander' });
    await db.collection('users').doc(sepCmd.uid).set({
      email: `sep-cmd-${now}@test.knowledgearena.app`, displayName: 'Separate Commander', role: 'commander', createdAt: Date.now(), disabled: false,
    });
    const { status: cs, body: cb } = await api('POST', '/api/messaging/conversations', execToken!, {
      commanderId: sepCmd.uid,
    });
    if (cs !== 200) throw new Error(`Create failed: ${cs}`);
    const delConvId = cb.conversation.id;

    // Send a message so there's something to cascade-delete
    await api('POST', `/api/messaging/conversations/${delConvId}/messages`, execToken!, {
      text: 'To be deleted',
    });

    const { status } = await api('DELETE', `/api/messaging/conversations/${delConvId}`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);

    // Verify conversation is gone
    const { body: listBody } = await api('GET', '/api/messaging/conversations', execToken!);
    if ((listBody.conversations || []).some((c: any) => c.id === delConvId)) {
      throw new Error('Deleted conversation still in list');
    }

    // Cleanup separate commander
    await auth.deleteUser(sepCmd.uid).catch(() => {});
    await db.collection('users').doc(sepCmd.uid).delete().catch(() => {});
  });

  // Leave conversation (Commander)
  await test('Verify conversation exists before leave', async () => {
    const { status, body } = await api('GET', '/api/messaging/conversations', cmdToken!);
    const conv = (body.conversations || []).find((c: any) => c.id === convId);
    if (!conv) throw new Error('Conversation not in commander list before leave');
    if (!conv.participants?.includes(cmdUid)) throw new Error('Commander not in participants');
  });

  await test('Commander leaves conversation', async () => {
    const { status, body } = await api('PATCH', `/api/messaging/conversations/${convId}`, cmdToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
  });

  await test('Conversation removed from commander list', async () => {
    const { status, body } = await api('GET', '/api/messaging/conversations', cmdToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if ((body.conversations || []).some((c: any) => c.id === convId)) {
      throw new Error('Left conversation still in commander list');
    }
  });

  await test('Conversations still visible to executive', async () => {
    const { status, body } = await api('GET', '/api/messaging/conversations', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!(body.conversations || []).some((c: any) => c.id === convId)) {
      throw new Error('Conversation gone from executive list (commander left)');
    }
  });

  // =========== ANNOUNCEMENTS ===========
  console.log('\n=== ANNOUNCEMENTS ===\n');

  await test('Executive creates announcement', async () => {
    const { status, body } = await api('POST', '/api/messaging/announcements', execToken!, {
      text: 'E2E Test Announcement ' + now,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    annId = body.id;
  });

  await test('Commander sees announcement', async () => {
    const { status, body } = await api('GET', '/api/messaging/announcements', cmdToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!(body.announcements || []).some((a: any) => a.id === annId)) {
      throw new Error('Announcement not visible to commander');
    }
  });

  await test('Executive edits announcement', async () => {
    const { status } = await api('PUT', '/api/messaging/announcements', execToken!, {
      id: annId, text: 'E2E Edited Announcement ' + now,
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('Verify announcement edited', async () => {
    const { status, body } = await api('GET', '/api/messaging/announcements', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const ann = (body.announcements || []).find((a: any) => a.id === annId);
    if (!ann) throw new Error('Announcement not found');
    if (!ann.text?.includes('Edited')) throw new Error('Text not updated: ' + ann.text);
  });

  await test('Executive deletes announcement', async () => {
    const { status } = await api('DELETE', `/api/messaging/announcements?id=${annId}`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('Verify announcement deleted', async () => {
    const { status, body } = await api('GET', '/api/messaging/announcements', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if ((body.announcements || []).some((a: any) => a.id === annId)) {
      throw new Error('Deleted announcement still returned');
    }
  });

  // =========== USER DELETION ===========
  console.log('\n=== USER DELETION ===\n');

  // Create a commander with conversations, requests, notifications to test cascade delete
  let delCmdUid: string;
  await test('Create commander to delete', async () => {
    const user = await auth.createUser({ email: `delete-cmd-${now}@test.knowledgearena.app`, password, displayName: 'Delete Me Commander' });
    delCmdUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: `delete-cmd-${now}@test.knowledgearena.app`, displayName: 'Delete Me Commander', role: 'commander', createdAt: Date.now(), disabled: false,
    });

    // Create conversation
    const { body } = await api('POST', '/api/messaging/conversations', execToken!, { commanderId: user.uid });
    const cid = body.conversation.id;

    // Send messages
    await api('POST', `/api/messaging/conversations/${cid}/messages`, execToken!, { text: 'Message before delete' });
    await api('POST', `/api/messaging/conversations/${cid}/messages`, execToken!, { text: 'Another message' });

    // Create request
    await db.collection('executive_requests').add({
      title: 'Delete test', type: 'other', description: 'Test', status: 'pending',
      commanderId: user.uid, commanderEmail: `delete-cmd-${now}@test.knowledgearena.app`, createdAt: Date.now(),
    });

    // Create notification
    await db.collection('notifications').add({
      type: 'request_submitted', title: 'Test', message: 'Test',
      metadata: { commanderId: user.uid, requestId: 'test' },
      read: false, createdAt: Date.now(),
    });
  });

  // Call admin user deletion API
  await test('Delete commander via admin API', async () => {
    const { status, body } = await api('DELETE', `/api/admin/users?uid=${delCmdUid}`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
  });

  await test('No orphan conversations', async () => {
    const snap = await db.collection('conversations').where('participants', 'array-contains', delCmdUid!).get();
    if (snap.size > 0) throw new Error(`${snap.size} orphan conversations remain`);
  });

  await test('No orphan requests', async () => {
    const snap = await db.collection('executive_requests').where('commanderId', '==', delCmdUid!).get();
    if (snap.size > 0) throw new Error(`${snap.size} orphan requests remain`);
  });

  await test('No orphan notifications', async () => {
    const snap = await db.collection('notifications').where('metadata.commanderId', '==', delCmdUid!).get();
    if (snap.size > 0) throw new Error(`${snap.size} orphan notifications remain`);
  });

  await test('User doc deleted/soft-deleted', async () => {
    const doc = await db.collection('users').doc(delCmdUid!).get();
    if (doc.exists) {
      const data = doc.data();
      if (!data!.deleted) throw new Error('User doc should have deleted flag');
    }
  });

  // Create and delete a gladiator
  let delGlaUid: string;
  await test('Create gladiator to delete', async () => {
    const user = await auth.createUser({ email: `delete-gla-${now}@test.knowledgearena.app`, password, displayName: 'Delete Me Gladiator' });
    delGlaUid = user.uid;
    await db.collection('users').doc(user.uid).set({
      email: `delete-gla-${now}@test.knowledgearena.app`, displayName: 'Delete Me Gladiator', role: 'gladiator', createdAt: Date.now(), disabled: false,
    });
    // Add a participant record
    await db.collection('arenas').doc('test-arena').collection('participants').add({ user_id: user.uid, name: 'Delete Me Gladiator' });
  });

  await test('Delete gladiator via admin API', async () => {
    const { status, body } = await api('DELETE', `/api/admin/users?uid=${delGlaUid!}`, execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
  });

  await test('No orphan gladiator participant records', async () => {
    const snap = await db.collectionGroup('participants').where('user_id', '==', delGlaUid!).get();
    if (snap.size > 0) throw new Error(`${snap.size} orphan participant records remain`);
  });

  // =========== AI MODEL ===========
  console.log('\n=== AI MODEL ===\n');

  await test('GET current AI model settings', async () => {
    const { status, body } = await api('GET', '/api/executive/settings', execToken!);
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!body.settings) throw new Error('No settings');
    console.log('  Current AI model:', body.settings.aiModel || body.settings.ai_model || 'not set');
  });

  await test('Update AI model setting', async () => {
    const { status, body } = await api('PUT', '/api/executive/settings', execToken!, {
      settings: { ai: { defaultModel: 'gemini-2.5-flash' } },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);
    const { body: getBody } = await api('GET', '/api/executive/settings', execToken!);
    const savedModel = getBody.settings?.ai?.defaultModel;
    if (savedModel !== 'gemini-2.5-flash') {
      throw new Error(`Expected gemini-2.5-flash, got ${savedModel}`);
    }
    console.log('  Verified: AI model set to', savedModel);
  });

  // Restore original setting
  await api('PUT', '/api/executive/settings', execToken!, { aiModel: 'gemini-2.0-flash' });

  // =========== NETWORK ERRORS CHECK ===========
  console.log('\n=== NETWORK ERRORS ===\n');

  const pathsToCheck = [
    '/api/executive/settings',
    '/api/executive/notifications',
    '/api/executive/audit-logs',
    '/api/executive/question-bank',
    '/api/messaging/conversations',
    '/api/messaging/announcements',
  ];

  for (const path of pathsToCheck) {
    await test(`No 401/403/500 on ${path}`, async () => {
      const { status, body } = await api('GET', path, execToken!);
      if ([401, 403, 404, 500].includes(status)) {
        throw new Error(`Got HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
      }
    });
  }

  // =========== CLEANUP ===========
  console.log('\n=== CLEANUP ===\n');

  await test('Delete test executive', async () => {
    await auth.deleteUser(execUid!).catch(() => {});
    await db.collection('users').doc(execUid!).delete().catch(() => {});
  });

  await test('Delete test commander', async () => {
    await auth.deleteUser(cmdUid!).catch(() => {});
    await db.collection('users').doc(cmdUid!).delete().catch(() => {});
  });

  await test('Delete test gladiator', async () => {
    await auth.deleteUser(glaUid!).catch(() => {});
    await db.collection('users').doc(glaUid!).delete().catch(() => {});
  });

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
