import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const raw = readFileSync('C:\\Users\\jeeva\\Desktop\\project\\service-account.json', 'utf-8');
const sa = JSON.parse(raw);

if (!getApps().length) {
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  console.log('=== CHECKING FIRESTORE ===');
  
  // List all conversations
  const convSnap = await db.collection('conversations').get();
  console.log('Total conversations:', convSnap.docs.length);
  
  for (const doc of convSnap.docs) {
    const data = doc.data();
    console.log('\n--- Conversation:', doc.id, '---');
    console.log('  Participants:', JSON.stringify(data.participants));
    console.log('  Has lastMessage:', !!data.lastMessage);
    if (data.lastMessage) {
      console.log('  lastMessage.text:', data.lastMessage.text?.substring(0, 80));
      console.log('  lastMessage.senderId:', data.lastMessage.senderId);
    }
    
    // Check messages subcollection WITHOUT orderBy
    const msgSnap = await doc.ref.collection('messages').get();
    console.log('  Messages (no orderBy):', msgSnap.docs.length);
    
    if (msgSnap.docs.length > 0) {
      msgSnap.docs.forEach(md => {
        const mdata = md.data();
        console.log('    [MSG]', md.id, '| sender:', mdata.senderId, '| ts:', mdata.timestamp, '| text:', (mdata.text || '').substring(0, 60));
      });
    }
    
    // Check messages subcollection WITH orderBy (this is what the UI does)
    try {
      const orderedSnap = await doc.ref.collection('messages').orderBy('timestamp', 'asc').get();
      console.log('  Messages (with orderBy):', orderedSnap.docs.length);
      if (orderedSnap.docs.length > 0) {
        orderedSnap.docs.forEach(md => {
          const mdata = md.data();
          console.log('    [ORDERED]', md.id, '| sender:', mdata.senderId, '| ts:', mdata.timestamp, '| text:', (mdata.text || '').substring(0, 60));
        });
      }
    } catch (e) {
      console.log('  Messages (with orderBy): ERROR -', e.message);
    }
  }
}

main().then(() => {
  console.log('\n=== DONE ===');
  process.exit(0);
}).catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
