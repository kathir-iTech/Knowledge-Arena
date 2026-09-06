'use client';

/**
 * R2-28 / Feature 28: KaTeX render-only formula component (no MathLive input in Set 2).
 * Stores stay plain-text LaTeX; rendering is view-layer only.
 * Tries KaTeX when installed; falls back to styled <span> so build never breaks
 * and 375px no-overflow still passes (overflow-x:auto).
 */

import React, { useMemo } from 'react';

function stripDelimiters(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('$$') && t.endsWith('$$') && t.length >= 4) return t.slice(2, -2);
  if (t.startsWith('$') && t.endsWith('$') && t.length >= 2) return t.slice(1, -1);
  if (t.startsWith('\\(') && t.endsWith('\\)')) return t.slice(2, -2);
  if (t.startsWith('\\[') && t.endsWith('\\]')) return t.slice(2, -2);
  return t;
}

export function MathFormula({ tex, block = false }: { tex: string; block?: boolean }) {
  const html = useMemo(() => {
    const inner = stripDelimiters(tex);
    try {
      // Optional KaTeX when installed; never a hard dep in Set 2.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const katex = require('katex') as {
        renderToString: (s: string, o?: Record<string, unknown>) => string;
      };
      return katex.renderToString(inner, { throwOnError: false, displayMode: block });
    } catch {
      return null;
    }
  }, [tex, block]);

  if (html) {
    const Tag = block ? 'div' : 'span';
    return (
      <Tag
        className="overflow-x-auto text-[0.95em] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  // Fallback: styled span preserves backslashes (repairJson guard keeps them).
  const Tag = block ? 'div' : 'span';
  return (
    <Tag className="overflow-x-auto rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[0.9em]">
      {stripDelimiters(tex)}
    </Tag>
  );
}
