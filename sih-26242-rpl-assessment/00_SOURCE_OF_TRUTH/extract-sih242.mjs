#!/usr/bin/env node
/**
 * Re-runnable extractor for SIH 2026 problem statement SIH26242.
 *
 * Node built-ins ONLY. Deliberately adds no dependency, so package.json and
 * package-lock.json are never touched -- these are shared files that both the
 * main branch and the SIH branch read. See Boundary B in ../README.md.
 *
 * Usage:
 *   node extract-sih242.mjs                 # fetch live portal, print markdown
 *   node extract-sih242.mjs --html dump.html   # extract from a local saved page
 *
 * Why it works without a parser: the SIH portal emits a highly regular structure.
 * Each statement is a <div id="ViewProblemStatement26XXXX"> modal holding a
 * <table id="settings"> of <th>label</th> ... <td>value</td> pairs.
 *
 * The tricky part: every Description cell contains the text TWICE --
 * once as an HTML comment holding an entity-escaped copy (machine-readable source
 * for the site's own tooling), and once as the real rendered copy. Stripping HTML
 * comments first removes the escaped duplicate cleanly, leaving exactly one.
 */

const TARGET_ID = '26242';
const DEFAULT_URL = 'https://www.sih.gov.in/sih2026PS';

import fs from 'node:fs';

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', rsquo: '\u2019',
  lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D', bull: '\u2022',
};

/** Decode named and numeric (decimal + hex) HTML entities. */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in NAMED_ENTITIES ? NAMED_ENTITIES[n] : m));
}

/** Remove the entity-escaped duplicate Description hidden inside HTML comments. */
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

/** Split the block following a <th>label</th> up to the next </tr>. */
function cellAfter(block, label) {
  const re = new RegExp(
    '<th[^>]*>\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>',
    'i'
  );
  const m = block.match(re);
  return m ? m[1] : null;
}

/** Convert the description fragment to readable markdown-ish text. */
function toText(html) {
  return decodeEntities(
    String(html)
      // The Description div itself.
      .replace(/<div[^>]*class="[^"]*style-2[^"]*"[^>]*>/i, '')
      .replace(/<\/div>/i, '')
      // Lists before generic tags, so <li> content survives.
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '')
      // Bullets rendered as entities.
      .replace(/[\u2022]\s*/g, '\n- ')
      // Headings -> bold.
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
      // Anchors -> their text.
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      // Breaks.
      .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n\n')
      // Anything else.
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Collapse an anchor-only cell (blank href, blank text) to an explicit EMPTY marker. */
function linkOrEmpty(raw) {
  if (raw === null) return '*(field absent from markup)*';
  const text = toText(raw).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const hrefs = raw.match(/href\s*=\s*["']([^"']*)["']/gi) || [];
  const meaningfulHref = hrefs.some((h) => !/^\s*href\s*=\s*["']\s*["']/i.test(h));
  if (!text && !meaningfulHref) return '*(empty — cell contains only an anchor with a blank href)*';
  return text || '(no visible text)';
}

async function loadHtml() {
  const argIdx = process.argv.indexOf('--html');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return fs.readFileSync(process.argv[argIdx + 1], 'utf8');
  }
  const res = await fetch(DEFAULT_URL);
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

function main() {
  return loadHtml().then((raw) => {
    const html = stripComments(raw);

    // Anchor on the <div id="ViewProblemStatementNNNNN"> OPENING tag specifically.
    // Anchoring on the bare string is wrong: the id appears first inside the <a
    // data-target="#..."> trigger, so the block would end immediately.
    const openRe = new RegExp('<div\\s+id="ViewProblemStatement' + TARGET_ID + '"', 'i');
    const openMatch = html.match(openRe);
    if (!openMatch || openMatch.index === undefined) {
      console.error(`\nERROR: modal 'ViewProblemStatement${TARGET_ID}' not found.`);
      console.error('The portal may have restructured, or the PS may have been withdrawn.');
      console.error('Re-open https://www.sih.gov.in/sih2026PS and confirm PS 26242 is listed.');
      process.exitCode = 1;
      return;
    }
    const at = openMatch.index;

    // The modal runs until the NEXT modal's opening tag.
    const nextOpen = html.slice(at + 1).search(/<div\s+id="ViewProblemStatement\d+"/i);
    const block = nextOpen === -1
      ? html.slice(at)
      : html.slice(at, at + 1 + nextOpen);

    const rowRe = new RegExp(
      '<td>SIH' + TARGET_ID + '</td>\\s*<td>(\\d+)/500</td>\\s*<td>([\\s\\S]*?)</td>\\s*<td>([\\s\\S]*?)</td>',
      'i'
    );
    const row = block.match(rowRe) || html.match(rowRe);

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    console.log('# SIH' + TARGET_ID + ' - live re-verification');
    console.log('');
    console.log('- Retrieved (UTC): `' + now + '`');
    console.log('- Source: `' + DEFAULT_URL + '`');
    if (row) {
      console.log('- Submitted Idea(s) Count: `' + row[1] + '/500`');
      console.log('- Theme (from table row): `' + toText(row[2]).trim() + '`');
      console.log('- Deadline for Idea Submission: `' + toText(row[3]).trim() + '`');
    } else {
      console.log('- Submitted Idea(s) Count: *could not locate table row*');
    }
    console.log('');
    console.log('## Fields');
    console.log('');
    const fields = [
      'Problem Statement ID', 'Problem Statement Title', 'Organization',
      'Department', 'Category', 'Theme', 'Youtube Link', 'Dataset Link',
      'Contact info',
    ];
    for (const f of fields) {
      const raw2 = cellAfter(block, f);
      let val;
      if (/Link|Contact/.test(f)) {
        val = linkOrEmpty(raw2);
      } else {
        // Single-line fields: collapse all whitespace. Description keeps its breaks.
        val = toText(raw2 || '').replace(/\s+/g, ' ').trim();
      }
      console.log('| ' + f + ' | ' + (val || '*(empty)*').replace(/\|/g, '\\|') + ' |');
    }
    console.log('');
    console.log('## Description - VERBATIM');
    console.log('');
    const desc = toText(cellAfter(block, 'Description') || '*(not found)*')
      .replace(/([^\n])\n(\*\*)/g, '$1\n\n$2');
    console.log(desc);
    console.log('');
  });
}

main().catch((e) => {
  console.error('Extractor failed: ' + e.message);
  process.exitCode = 1;
});