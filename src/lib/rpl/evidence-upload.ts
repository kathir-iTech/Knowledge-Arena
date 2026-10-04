// SIH-26242 RPL evidence upload — client-safe helpers (no server imports).
// Active path is compressed base64 data-URLs in Firestore via /api/rpl/evidence
// (Admin SDK write; Firestore rules deny clients). Storage rules are inert
// future-proofing until a Blaze migration.

import type { EvidenceImageDoc } from './types';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const TARGET_DATAURL_CHARS = 700 * 1024;

// Max 3 compression steps: lowering quality/dimension until <= ~700KB.
const COMPRESS_STEPS: Array<{ maxDim: number; quality: number }> = [
  { maxDim: 1280, quality: 0.7 },
  { maxDim: 1024, quality: 0.6 },
  { maxDim: 800, quality: 0.5 },
];

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image file.'));
    img.src = objectUrl;
  });
}

function drawCompressed(
  img: HTMLImageElement,
  maxDim: number,
  quality: number,
): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image compression is not supported in this browser.');
  // JPEG has no alpha — paint white so transparent PNGs do not go black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

async function compressToDataUrl(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Image compression requires a browser environment.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    let last = '';
    for (const step of COMPRESS_STEPS) {
      last = drawCompressed(img, step.maxDim, step.quality);
      if (last.length <= TARGET_DATAURL_CHARS) return { dataUrl: last, mimeType: 'image/jpeg' };
    }
    // After 3 steps return the smallest variant; the API enforces ~750KB.
    if (!last) throw new Error('Could not compress image.');
    return { dataUrl: last, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function estimateBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.round(payload.length * 0.75);
}

export async function uploadEvidenceImage(
  file: File,
  workerId: string,
  unitId: string,
  assessmentId: string,
  idToken: string,
): Promise<string> {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed.');
  }
  if (!(file.size > 0) || file.size > MAX_SOURCE_BYTES) {
    throw new Error('Image must be 5MB or smaller.');
  }
  if (!workerId.trim() || !unitId.trim() || !assessmentId.trim()) {
    throw new Error('workerId, unitId and assessmentId are required.');
  }
  if (!idToken) throw new Error('You are not signed in. Please sign in again.');

  const { dataUrl, mimeType } = await compressToDataUrl(file);
  const sizeBytes = estimateBytes(dataUrl);

  const res = await fetch('/api/rpl/evidence', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assessmentId, workerId, unitId, dataUrl, mimeType, sizeBytes }),
  });
  const body = (await res.json().catch(() => null)) as { imageId?: unknown; error?: unknown } | null;
  if (!res.ok || !body || typeof body.imageId !== 'string' || !body.imageId) {
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Evidence upload failed. Please try again.',
    );
  }
  return body.imageId;
}

export async function listEvidenceForUnit(
  assessmentId: string,
  unitId: string,
  idToken: string,
): Promise<EvidenceImageDoc[]> {
  if (!assessmentId.trim() || !unitId.trim()) throw new Error('assessmentId and unitId are required.');
  if (!idToken) throw new Error('You are not signed in. Please sign in again.');
  const res = await fetch(`/api/rpl/evidence?assessmentId=${encodeURIComponent(assessmentId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = (await res.json().catch(() => null)) as {
    evidence?: unknown;
    error?: unknown;
  } | null;
  if (!res.ok || !body || !Array.isArray(body.evidence)) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load evidence.');
  }
  return (body.evidence as EvidenceImageDoc[]).filter((e) => e.unitId === unitId);
}

export async function deleteEvidence(
  imageId: string,
  assessmentId: string,
  idToken: string,
): Promise<void> {
  if (!imageId.trim() || !assessmentId.trim()) throw new Error('imageId and assessmentId are required.');
  if (!idToken) throw new Error('You are not signed in. Please sign in again.');
  const res = await fetch('/api/rpl/evidence', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assessmentId, imageId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to delete evidence.');
  }
}
