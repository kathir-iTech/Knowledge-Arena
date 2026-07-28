import { readFileSync } from 'fs';
import https from 'https';
import { JWT } from 'google-auth-library';

const raw = readFileSync('C:\\Users\\jeeva\\Desktop\\project\\service-account.json', 'utf-8');
const sa = JSON.parse(raw);
const rulesContent = readFileSync('C:\\Users\\jeeva\\Desktop\\project\\firestore.rules', 'utf-8');

const client = new JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const projectId = sa.project_id;

async function main() {
  // Create new ruleset with the full rules
  console.log('Creating new ruleset...');
  const createRes = await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    method: 'POST',
    data: {
      source: {
        language: 'FIREBASE_RULES',
        files: [{ name: 'firestore.rules', content: rulesContent }],
      },
    },
  });
  const rulesetName = createRes.data.name;
  console.log('Created ruleset:', rulesetName);

  // Get access token for raw HTTPS call
  const token = await client.getAccessToken();

  // PATCH the release with the body format: { release: { name, rulesetName } }
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const body = JSON.stringify({
    release: {
      name: releaseName,
      rulesetName,
    },
  });

  const res = await httpsRequest(
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    'PATCH',
    token.token,
    body
  );

  if (res.status === 200) {
    console.log('Release updated successfully!');
    console.log('Active ruleset:', res.data.rulesetName);
    console.log('\n=== DEPLOYMENT SUCCESSFUL ===');
  } else {
    console.log('Error:', res.status, JSON.stringify(res.data));
    process.exit(1);
  }
}

function httpsRequest(urlStr, method, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
