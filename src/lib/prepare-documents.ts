'use client';

/**
 * Client-side document preparation for the AI PDF Forge.
 *
 * Replaces the previous flow where the browser base64-encoded the raw
 * file and sent it whole to the server via a Next server action. Raw
 * multi-megabyte files become +33% larger as base64, pushing the Function
 * request body past Vercel's hard 4.5 MB ceiling (413
 * FUNCTION_PAYLOAD_TOO_LARGE) — the generic "unexpected response" the
 * Commander saw in the UI.
 *
 * Here we extract text (PDF/DOCX/TXT/MD) in the browser and, for
 * scanned/blank PDF pages, render them to a compressed JPEG for the
 * existing Gemini vision path. Only this small derived payload crosses
 * the wire, keeping the request well under the limit.
 */
import { unzipSync } from 'fflate';

// pdfjs-dist worker asset, served statically from /public. The `?url`
// import form does not work for `.mjs` sources (webpack parses them as
// modules and exposes no default export), so we pin it to a public URL
// that the browser fetches to spawn its worker.
const PDF_WORKER_SRC = '/pdfjs/pdf.worker.min.js';

export type DocumentKind = 'pdf' | 'docx' | 'txt' | 'md' | 'image';

export interface PreparedDocument {
  name: string;
  kind: DocumentKind;
  text: string;
  imageDataUris: string[];
  pageCount: number;
  truncated: boolean;
  truncatedNote?: string;
}

export type ProgressCallback = (msg: string) => void;

export class PrepareError extends Error {
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
  code: string;
}

interface PdfJsModule {
  getDocument(source: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
  GlobalWorkerOptions: { workerSrc: string };
}
interface PdfPageViewport {
  width: number;
  height: number;
}
interface PdfTextContent {
  items: Array<{ str?: string }>;
}
interface PdfPage {
  getViewport(opts: { scale: number }): PdfPageViewport;
  getTextContent(): Promise<PdfTextContent>;
  render(opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfPageViewport }): { promise: Promise<unknown> };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}

const MAX_TEXT_PAGES = 100;
const MAX_TEXT_CHARS = 40000;
const MAX_SCANNED_PAGE_IMAGES = 6;
const SCAN_TEXT_THRESHOLD = 20;
const RENDER_LONG_SIDE = 2240;
const IMAGE_LONG_SIDE = 1600;
const JPEG_QUALITY = 0.8;
const MAX_TOTAL_IMAGES = 24;

let pdfjsPromise: Promise<PdfJsModule> | null = null;
async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = (await import('pdfjs-dist')) as unknown as PdfJsModule;
      if (typeof window !== 'undefined') {
        mod.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      }
      return mod;
    })();
  }
  return pdfjsPromise;
}

export function classifyFile(file: File): DocumentKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (name.endsWith('.txt') || file.type === 'text/plain') return 'txt';
  if (name.endsWith('.md') || file.type === 'text/markdown') return 'md';
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(name) || file.type.startsWith('image/')) return 'image';
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ');
}

/** Extracts the readable body text from a DOCX `word/document.xml`. */
function docxXmlToText(xml: string): string {
  const paragraphs = xml.split(/<\/w:p>/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const runs = Array.from(para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), (m) => m[1]);
    const line = runs.map((t) => decodeXmlEntities(t).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

async function readAsArrayBuffer(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

async function readAsDataUri(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new PrepareError('CLIENT_EXTRACT', `Unable to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function sliceTextByChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

async function renderScannedPage(page: PdfPage, pageNumber: number): Promise<string> {
  try {
    const base = page.getViewport({ scale: 1 });
    const longest = Math.max(base.width, base.height);
    const scale = RENDER_LONG_SIDE / longest;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '';

    await page.render({ canvasContext: context, viewport: { width: canvas.width, height: canvas.height } }).promise;
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    console.warn('[prepare] scanned page render failed', pageNumber, e);
    return '';
  }
}

async function extractPdfFile(file: File, onProgress: ProgressCallback): Promise<PreparedDocument> {
  let pdfjs: PdfJsModule;
  try {
    pdfjs = await getPdfJs();
  } catch {
    throw new PrepareError('CLIENT_EXTRACT', 'Could not load the PDF reader in this browser.');
  }

  const data = await readAsArrayBuffer(file);
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true });
  let doc: PdfDocument;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (lower.includes('encrypt') || lower.includes('password') || lower.includes('permission')) {
      throw new PrepareError('PDF_ENCRYPTED', 'This PDF is encrypted or password-protected.');
    }
    if (lower.includes('invalid') || lower.includes('corrupt') || lower.includes('format')) {
      throw new PrepareError('PDF_CORRUPTED', 'This PDF appears to be invalid or corrupt.');
    }
    throw new PrepareError('CLIENT_EXTRACT', `Unable to read the PDF: ${msg}`);
  }

  const pageCount = doc.numPages || 1;
  const totalPages = Math.min(pageCount, MAX_TEXT_PAGES);
  const textByPage: string[] = [];
  const imageDataUris: string[] = [];
  let truncated = false;
  let scannedTruncated = false;
  let textChars = 0;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    onProgress(totalPages > 1 ? `Reading page ${pageNumber} of ${totalPages}...` : `Reading ${file.name}...`);

    const page = await doc.getPage(pageNumber);
    let pageText = '';
    try {
      const textContent = await page.getTextContent();
      pageText = textContent.items
        .map((item) => (item.str || '').trim())
        .filter(Boolean)
        .join(' ');
    } catch {
      // A page whose text layer fails to read is treated as scanned.
      pageText = '';
    }

    const isScanned = pageText.length < SCAN_TEXT_THRESHOLD;
    if (isScanned) {
      if (imageDataUris.length < MAX_SCANNED_PAGE_IMAGES) {
        onProgress(`Analyzing scanned page ${pageNumber}...`);
        const dataUri = await renderScannedPage(page, pageNumber);
        if (dataUri) imageDataUris.push(dataUri);
      } else {
        scannedTruncated = true;
      }
    } else {
      textChars += pageText.length;
      if (textChars > MAX_TEXT_CHARS) {
        const room = MAX_TEXT_CHARS - (textChars - pageText.length);
        textByPage.push(pageText.slice(0, Math.max(0, room)));
        truncated = true;
        break;
      }
    }

    textByPage.push(pageText);
  }

  try {
    await loadingTask.destroy();
  } catch {}

  if (pageCount > MAX_TEXT_PAGES) truncated = true;

  const text = sliceTextByChars(textByPage.join('\n\n'), MAX_TEXT_CHARS);

  let truncatedNote: string | undefined;
  if (pageCount > MAX_TEXT_PAGES) {
    truncatedNote = `Only the first ${MAX_TEXT_PAGES} pages of this ${pageCount}-page document were used.`;
  } else if (truncated) {
    truncatedNote = `Only the first ~${MAX_TEXT_CHARS} characters of text were used.`;
  } else if (scannedTruncated) {
    truncatedNote = `Only the first ${MAX_SCANNED_PAGE_IMAGES} scanned pages were analyzed as images.`;
  }

  return {
    name: file.name,
    kind: 'pdf',
    text,
    imageDataUris,
    pageCount,
    truncated,
    truncatedNote,
  };
}

async function extractDocxFile(file: File): Promise<PreparedDocument> {
  const bytes = await readAsArrayBuffer(file);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new PrepareError('CLIENT_EXTRACT', `Could not unzip ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const docEntry = entries['word/document.xml'];
  const text = docEntry ? docxXmlToText(new TextDecoder().decode(docEntry)) : '';
  if (!text.trim()) {
    throw new PrepareError('CLIENT_EXTRACT', `No readable text found in ${file.name}.`);
  }
  return { name: file.name, kind: 'docx', text, imageDataUris: [], pageCount: 1, truncated: false };
}

async function extractTxtOrMd(file: File, kind: 'txt' | 'md'): Promise<PreparedDocument> {
  const text = await file.text().catch(() => '');
  return { name: file.name, kind, text, imageDataUris: [], pageCount: 1, truncated: false };
}

/** Re-encodes an uploaded image as a bounded JPEG so it cannot blow the Function payload ceiling. */
async function reencodeImageToJpeg(dataUri: string): Promise<string> {
  if (typeof document === 'undefined') return dataUri;
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = dataUri;
    });
    await loaded;
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest === 0) return dataUri;
    const scale = Math.min(1, IMAGE_LONG_SIDE / longest);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUri;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return dataUri;
  }
}

export async function prepareDocuments(files: File[], onProgress: ProgressCallback): Promise<PreparedDocument[]> {
  const prepared: PreparedDocument[] = [];
  let totalImageCount = 0;
  for (const file of files) {
    const kind = classifyFile(file);
    if (!kind) {
      onProgress(`Unsupported file skipped: ${file.name}`);
      continue;
    }
    switch (kind) {
      case 'pdf':
        prepared.push(await extractPdfFile(file, onProgress));
        break;
      case 'docx':
        onProgress(`Reading ${file.name}...`);
        prepared.push(await extractDocxFile(file));
        break;
      case 'txt':
        onProgress(`Reading ${file.name}...`);
        prepared.push(await extractTxtOrMd(file, 'txt'));
        break;
      case 'md':
        onProgress(`Reading ${file.name}...`);
        prepared.push(await extractTxtOrMd(file, 'md'));
        break;
      case 'image': {
        onProgress(`Preparing ${file.name}...`);
        if (totalImageCount >= MAX_TOTAL_IMAGES) {
          onProgress(`Skipped ${file.name} — image limit reached (${MAX_TOTAL_IMAGES}).`);
          continue;
        }
        const reencoded = await reencodeImageToJpeg(await readAsDataUri(file));
        totalImageCount += 1;
        prepared.push({
          name: file.name,
          kind: 'image',
          text: '',
          imageDataUris: [reencoded],
          pageCount: 1,
          truncated: false,
        });
        break;
      }
    }
    totalImageCount += prepared.length ? prepared[prepared.length - 1].imageDataUris.length : 0;
  }
  return prepared;
}