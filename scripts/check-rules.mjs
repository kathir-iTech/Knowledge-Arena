import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { readFileSync } from 'fs';

const raw = readFileSync('C:\\Users\\jeeva\\Desktop\\project\\service-account.json', 'utf-8');
const sa = JSON.parse(raw);

if (!getApps().length) {
  initializeApp({ credential: cert(sa) });
}

async function main() {
  try {
    const rules = getSecurityRules();
    const ruleset = await rules.getRuleset();
    if (ruleset) {
      console.log('=== DEPLOYED RULESET ===');
      console.log('Name:', ruleset.name);
      console.log('Create time:', ruleset.createTime);
      console.log('Source:');
      console.log(ruleset.source?.files?.[0]?.content || 'No source');
    } else {
      console.log('No ruleset deployed');
    }
  } catch (e) {
    console.log('Error getting ruleset:', e.message);
    
    try {
      const firestoreRules = await rules.getFirestoreRuleset();
      console.log('\n=== FIRESTORE RULESET ===');
      if (firestoreRules) {
        console.log('Name:', firestoreRules.name);
        console.log('Source:');
        console.log(firestoreRules.source?.files?.[0]?.content || 'No source');
      } else {
        console.log('No Firestore ruleset deployed');
      }
    } catch (e2) {
      console.log('Error getting Firestore ruleset:', e2.message);
    }
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
