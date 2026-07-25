const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/csv', 'text/plain',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.csv', '.json', '.xlsx', '.txt',
]);

const MAX_FILENAME_LENGTH = 120;
const MAX_ATTACHMENTS_PER_REQUEST = 10;
const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PER_FILE_BASE64_LENGTH = 500 * 1024;

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime.toLowerCase());
}

export function isAllowedExtension(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export function sanitizeFilename(name: string): string {
  let clean = name.replace(/[/\\:*?"<>|]/g, '_');
  clean = clean.replace(/\0/g, '');
  if (clean.length > MAX_FILENAME_LENGTH) {
    const ext = clean.slice(clean.lastIndexOf('.'));
    const base = clean.slice(0, MAX_FILENAME_LENGTH - ext.length);
    clean = base + ext;
  }
  return clean || 'unnamed';
}

export function validateAttachment(f: { name?: string; type?: string; data?: string }): string | null {
  if (!f.name || !f.type || !f.data) {
    return 'Each attachment must have name, type, and data';
  }
  if (!isAllowedMimeType(f.type)) {
    return `File type '${f.type}' is not allowed`;
  }
  if (!isAllowedExtension(f.name)) {
    return `File extension in '${f.name}' is not allowed`;
  }
  f.name = sanitizeFilename(f.name);
  const base64Data = typeof f.data === 'string' ? f.data.split(',')[1] || f.data : f.data;
  if (base64Data.length > MAX_PER_FILE_BASE64_LENGTH) {
    return `Attachment ${f.name} exceeds 500KB limit`;
  }
  try {
    const decoded = Buffer.from(base64Data, 'base64');
    if (decoded.length === 0) {
      return `Attachment ${f.name} appears to be empty`;
    }
  } catch {
    return `Attachment ${f.name} contains invalid base64 data`;
  }
  return null;
}

export function validateAttachments(attachments: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { valid: true };
  }
  if (attachments.length > MAX_ATTACHMENTS_PER_REQUEST) {
    return { valid: false, error: `Maximum ${MAX_ATTACHMENTS_PER_REQUEST} attachments allowed` };
  }
  let totalBase64Size = 0;
  for (const f of attachments) {
    const err = validateAttachment(f);
    if (err) return { valid: false, error: err };
    const base64Data = typeof f.data === 'string' ? f.data.split(',')[1] || f.data : f.data;
    totalBase64Size += base64Data.length;
    f.data = base64Data;
  }
  if (totalBase64Size > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
    return { valid: false, error: 'Total attachment data exceeds 5MB limit' };
  }
  return { valid: true };
}
