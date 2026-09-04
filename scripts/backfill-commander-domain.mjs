#!/usr/bin/env node
// Backfill Commander institution_domain for Part 5A.
// Existing real Commander accounts should be defaulted to psgitech.ac.in
// since that is the institutional domain currently in use. Blank/null means
// open (fail-open per product call). This script sets psgitech.ac.in where
// the field is missing, null or empty string. Safe to re-run (idempotent).
//
// Usage: node scripts/backfill-commander-domain.mjs
//   (requires FIREBASE_SERVICE_ACCOUNT_KEY or service-account.json)
//   Dry-run default; use --write to actually update.
//   Use --domain=foo.example to backfill a different domain.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

const DEFAULT_DOMAIN = 'psgitech.ac.in';
const domainArg = process.argv.find(a => a.startsWith('--domain='))?.split('=')[1] || DEFAULT_DOMAIN;
const doWrite = process.argv.includes('--write');

function loadServiceAccount() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return fromEnv;
  const pathFromEnv = process.env.SERVICE_ACCOUNT_PATH;
  if (pathFromEnv && existsSync(pathFromEnv)) return readFileSync(pathFromEnv, 'utf-8');
  if (existsSync('service-account.json')) return readFileSync('service-account.json', 'utf-8');
  console.error('FATAL: No service account. Set FIREBASE_SERVICE_ACCOUNT_KEY or service-account.json');
  process.exit(1);
}

function init() {
  if (getApps().length) return;
  const raw = loadServiceAccount();
  const parsed = JSON.parse(raw);
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(parsed) });
}

async function main() {
  init();
  const db = getFirestore();
  console.log(`Backfill institution_domain -> "${domainArg}" ${doWrite ? '(write)' : '(dry-run, use --write)'}`);
  const snap = await db.collection('users').where('role', '==', 'commander').get();
  console.log(`Found ${snap.size} commander(s)`);
  let toUpdate = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const cur = data.institution_domain;
    const missing = cur === undefined || cur === null || (typeof cur === 'string' && cur.trim() === '');
    console.log(` - ${doc.id} ${data.email || ''} institution_domain=${JSON.stringify(cur)} ${missing ? '=> NEEDS BACKFILL' : 'ok'}`);
    if (missing) toUpdate.push(doc.ref);
  }
  console.log(`\n${toUpdate.length} commander(s) need backfill`);
  if (!doWrite) {
    console.log('Dry-run complete. Re-run with --write to apply.');
    process.exit(0);
  }
  if (toUpdate.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }
  let updated = 0;
  for (const ref of toUpdate) {
    await ref.set({ institution_domain: domainArg }, { merge: true });
    updated++;
    console.log(`  updated ${ref.id}`);
  }
  console.log(`Done. Updated ${updated} commander(s) to "${domainArg}"`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
