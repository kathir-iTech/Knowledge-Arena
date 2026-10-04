import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_ASSESSMENTS } from '@/lib/rpl/rpl-collections';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { forgeRplPack, type RplForgeFlowOutput } from '@/ai/flows/rpl-forge-flow';
import type { AssessmentMethod } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// RPL Forge upload + finalize endpoint (Commander OR Executive only).
// - multipart FormData with a PDF file -> server-side text extraction, flow, { pack, cached }
// - JSON { finalize: true, pack } -> template doc rpl_assessments/tpl_{packId}
//   with isTemplate:true + items subcollection (templates are excluded from
//   assessor queues by the peer-built queue filter on isTemplate).
// NOTE: extraction reads the PDF text layer only. Scanned/image-only PDFs are
// rejected (PDF_IMAGE_ONLY, mirroring the main Forge pipeline) — no OCR here.

const MIN_PDF_BYTES = 50 * 1024;
const MAX_EXTRACT_CHARS = 200000;

const ALLOWED_METHODS: AssessmentMethod[] = ['observation', 'product evidence', 'oral questioning'];

interface PdfJsPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  cleanup(): void;
}
interface PdfJsDoc {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
}
interface PdfJsModule {
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfJsDoc>; destroy(): Promise<void> };
  GlobalWorkerOptions?: { workerSrc?: string };
}

async function ensurePdfJsPolyfills(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix !== 'undefined' && typeof g.Path2D !== 'undefined') return;
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrix {
      constructor(_init?: string | number[]) {}
      toString() {
        return 'matrix(1, 0, 0, 1, 0, 0)';
      }
    };
  }
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class Path2D {};
  }
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class ImageData {
      constructor() {}
    };
  }
}

/**
 * Server-side PDF text extraction via pdfjs-dist (already a dependency).
 * src/lib/prepare-documents.ts is client-only ('use client': FileReader,
 * document/canvas) and is NOT reusable here, so this mirrors the minimal
 * server-side path from generate-quiz-pdf-flow.ts (legacy build, worker
 * disabled, in-process).
 */
async function extractPdfTextServer(buffer: Buffer): Promise<string> {
  const header = buffer.slice(0, 8).toString('ascii');
  if (!header.startsWith('%PDF-')) throw new Error('PDF_UNSUPPORTED');
  if (buffer.toString('latin1').toLowerCase().includes('/encrypt')) throw new Error('PDF_ENCRYPTED');

  await ensurePdfJsPolyfills();
  let pdfjs: PdfJsModule;
  try {
    pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;
  } catch {
    // @ts-expect-error — build/pdf.mjs has no types
    pdfjs = (await import('pdfjs-dist/build/pdf.mjs')) as unknown as PdfJsModule;
  }
  if (typeof window === 'undefined' && pdfjs.GlobalWorkerOptions) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = '';
    } catch {
      /* ignore */
    }
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    let pagesWithText = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => item.str ?? '')
          .join(' ')
          .trim();
        pages.push(pageText);
        if (pageText.length > 0) pagesWithText++;
      } finally {
        page.cleanup();
      }
    }
    if (pdf.numPages > 0 && pagesWithText === 0) throw new Error('PDF_IMAGE_ONLY');
    return pages.join('\n').trim().slice(0, MAX_EXTRACT_CHARS);
  } finally {
    await loadingTask.destroy();
  }
}

function resolvePackId(packId: string, trade: string): string {
  const cleanPack = packId.trim();
  if (cleanPack && NSQF_PACKS.some((p) => p.id === cleanPack)) return cleanPack;
  const t = trade.trim().toLowerCase();
  if (t) {
    const byTrade = NSQF_PACKS.find(
      (p) =>
        p.trade.toLowerCase() === t ||
        p.trade.toLowerCase().includes(t) ||
        t.includes(p.trade.toLowerCase()),
    );
    if (byTrade) return byTrade.id;
  }
  if (cleanPack) return cleanPack;
  return NSQF_PACKS[0].id;
}

function sanitizeDocId(raw: string): string {
  return raw.replace(/\//g, '_').slice(0, 200) || 'untitled';
}

function isValidFinalizePack(pack: unknown): pack is {
  packId: string;
  trade: string;
  units: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    unitId: string;
    taskDescription: string;
    mapsToCriterion: string;
    difficulty: number;
    assessmentMethod: string;
  }>;
} {
  if (typeof pack !== 'object' || pack === null) return false;
  const p = pack as Record<string, unknown>;
  if (typeof p.packId !== 'string' || !p.packId.trim()) return false;
  if (typeof p.trade !== 'string' || !p.trade.trim()) return false;
  if (!Array.isArray(p.units) || p.units.length === 0) return false;
  if (!Array.isArray(p.items)) return false;
  for (const u of p.units) {
    if (typeof u !== 'object' || u === null) return false;
    const unit = u as Record<string, unknown>;
    if (typeof unit.id !== 'string' || typeof unit.name !== 'string') return false;
  }
  for (const rawItem of p.items) {
    if (typeof rawItem !== 'object' || rawItem === null) return false;
    const item = rawItem as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) return false;
    if (typeof item.unitId !== 'string' || !item.unitId.trim()) return false;
    if (typeof item.taskDescription !== 'string' || !item.taskDescription.trim()) return false;
    if (typeof item.mapsToCriterion !== 'string') return false;
    if (item.difficulty !== 1 && item.difficulty !== 2 && item.difficulty !== 3 && item.difficulty !== 4) {
      return false;
    }
    if (typeof item.assessmentMethod !== 'string' || !ALLOWED_METHODS.includes(item.assessmentMethod as AssessmentMethod)) {
      return false;
    }
  }
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'executive']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:forge:${auth.uid}`, {
      maxRequests: 10,
      windowMs: 60000,
      message: 'RPL Forge limit reached (10/min). Please wait.',
    });
    if (rl) return rl;

    const contentType = req.headers.get('content-type') ?? '';

    // --- Finalize path: JSON { finalize: true, pack } ---
    if (!contentType.includes('multipart/form-data')) {
      const body = (await req.json().catch(() => null)) as {
        finalize?: unknown;
        pack?: unknown;
      } | null;
      if (!body || body.finalize !== true || !isValidFinalizePack(body.pack)) {
        return NextResponse.json({ error: 'Expected { finalize: true, pack } with a valid pack' }, { status: 400 });
      }
      const pack = body.pack;
      const templateId = `tpl_${sanitizeDocId(pack.packId)}`;
      const db = getAdminDb();
      const now = Date.now();
      const templateRef = db.collection(RPL_ASSESSMENTS).doc(templateId);

      const ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [
        {
          ref: templateRef,
          data: {
            packId: pack.packId,
            trade: pack.trade,
            units: pack.units,
            itemCount: pack.items.length,
            // Template docs carry isTemplate:true and are excluded from assessor queues.
            isTemplate: true,
            status: 'draft',
            createdBy: auth.uid,
            createdAt: now,
            updatedAt: now,
            generatedAt: now,
          },
        },
      ];
      for (const item of pack.items) {
        ops.push({
          ref: templateRef.collection('items').doc(sanitizeDocId(item.id)),
          data: {
            itemId: item.id,
            assessmentId: templateId,
            unitId: item.unitId,
            kind: 'performance',
            criterionText: item.taskDescription,
            mapsToCriterion: item.mapsToCriterion,
            difficulty: item.difficulty,
            assessmentMethod: item.assessmentMethod,
            createdAt: now,
          },
        });
      }
      // Batched writes, chunked at 500 ops per batch.
      for (let i = 0; i < ops.length; i += 500) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + 500)) batch.set(op.ref, op.data);
        await batch.commit();
      }
      return NextResponse.json({ templateId });
    }

    // --- Upload path: multipart FormData with a PDF file ---
    const form = await req.formData();
    const entries = Array.from(form.values());
    const fileEntry = form.get('file') ?? entries.find((v) => typeof v === 'object' && 'arrayBuffer' in v);
    if (!fileEntry || typeof fileEntry !== 'object' || !('arrayBuffer' in fileEntry)) {
      return NextResponse.json({ error: 'PDF file required (field "file")' }, { status: 400 });
    }
    const file = fileEntry as File;
    const fileName = typeof file.name === 'string' ? file.name : '';
    const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json({ error: 'Only application/pdf uploads are accepted' }, { status: 400 });
    }
    if (file.size < MIN_PDF_BYTES) {
      return NextResponse.json(
        { error: `PDF too small (${file.size} bytes). Minimum is ${MIN_PDF_BYTES} bytes (50KB).` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    try {
      text = await extractPdfTextServer(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'PDF_IMAGE_ONLY') {
        return NextResponse.json(
          {
            error:
              'PDF_IMAGE_ONLY: this PDF has no text layer (scanned images). The Forge pipeline rejects scanned PDFs; no OCR is performed.',
          },
          { status: 422 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ error: 'Not enough extractable text in this PDF' }, { status: 400 });
    }

    const packIdField = form.get('packId');
    const tradeField = form.get('trade');
    const trade = typeof tradeField === 'string' ? tradeField : '';
    const packId = resolvePackId(typeof packIdField === 'string' ? packIdField : '', trade);

    const result = await forgeRplPack({ pdfExtractedText: text, packId, trade: trade || resultTrade(packId) });
    return NextResponse.json({ pack: stripFlags(result), cached: result.cached });
  } catch (err) {
    console.error('[RPL Forge] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function resultTrade(packId: string): string {
  return NSQF_PACKS.find((p) => p.id === packId)?.trade ?? '';
}

function stripFlags(result: RplForgeFlowOutput): Omit<RplForgeFlowOutput, 'cached'> {
  const { cached: _cached, ...pack } = result;
  void _cached;
  return pack;
}
