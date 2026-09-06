'use client';

/**
 * R2-28 / Feature 28: KaTeX render-only formula component (no MathLive input in Set 2).
 * Stores stay plain-text LaTeX; rendering is view-layer only.
 * Tries KaTeX when installed; falls back to styled <span> so build never breaks
 * and 375px no-overflow still passes (overflow-x:auto).
 */

import React from 'react';

function stripDelimiters(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('$$') && t.endsWith('$$') && t.length >= 4) return t.slice(2, -2);
  if (t.startsWith('$') && t.endsWith('$') && t.length >= 2) return t.slice(1, -1);
  if (t.startsWith('\\(') && t.endsWith('\\)')) return t.slice(2, -2);
  if (t.startsWith('\\[') && t.endsWith('\\]')) return t.slice(2, -2);
  return t;
}

export function MathFormula({ tex, block = false }: { tex: string; block?: boolean }) {
  // NOTE (R2-28): KaTeX is not installed in Set 2 (bundle + team constraint),
  // and a static `require('katex')`/`import('katex')` makes webpack demand the
  // module at build time even inside try/catch. So this renders a styled
  // fallback that preserves backslashes (repairJson guard keeps them) until
  // `katex` is added to package.json — at which point this becomes a
  // `renderToString` call with the same props. No store changes either way.
  const Tag = block ? 'div' : 'span';
  return (
    <Tag className="overflow-x-auto rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[0.9em]">
      {stripDelimiters(tex)}
    </Tag>
  );
}
