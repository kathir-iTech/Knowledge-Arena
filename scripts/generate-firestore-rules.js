// Generates `firestore.rules` from `firestore.rules.template`.
//
// The `ALLOWED_GLADIATOR_EMAIL_DOMAIN` environment variable (the institution's
// email domain for gladiator sign-up) is regex-escaped and baked into the
// generated rules file. Rules files cannot read environment variables at
// deploy time, so this keeps the domain in a single config source while the
// committed `firestore.rules` stays valid for local dev, emulator and CI.
//
// Usage: node scripts/generate-firestore-rules.js
// (npm run rules:generate)
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'firestore.rules.template');
const outPath = path.join(root, 'firestore.rules');
const placeholder = '{{ALLOWED_GLADIATOR_EMAIL_DOMAIN}}';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generate() {
  const template = fs.readFileSync(templatePath, 'utf8');
  if (!template.includes(placeholder)) {
    console.error('[rules:generate] Placeholder not found; template may be out of date.');
    process.exit(1);
  }

  const rawDomain = (process.env.ALLOWED_GLADIATOR_EMAIL_DOMAIN || '').trim().toLowerCase();
  // The regex-escaped domain is spliced into a single-quoted rules string
  // literal, so backslashes must be doubled to survive string parsing (the
  // runtime value keeps its single backslashes for the regex).
  const domain = escapeRegExp(rawDomain).replace(/\\/g, '\\\\');

  const generated = template.replace(placeholder, domain);
  fs.writeFileSync(outPath, generated, 'utf8');
  console.log(
    rawDomain
      ? `[rules:generate] firestore.rules written with gladiator domain "${rawDomain}"`
      : '[rules:generate] firestore.rules written (no gladiator domain — sign-up unrestricted)'
  );
}

generate();