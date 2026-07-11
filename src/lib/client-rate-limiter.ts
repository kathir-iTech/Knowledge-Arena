interface WriteRecord {
  lastWrite: number;
  lastPayload: string;
  writeCount: number;
  windowStart: number;
}

const writeLog = new Map<string, WriteRecord>();
const MAX_WRITES_PER_SEC = 3;
const WINDOW_MS = 1000;

function getPathKey(path: string): string {
  return path;
}

export function canWrite(path: string, payload: unknown): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const key = getPathKey(path);
  const record = writeLog.get(key) || { lastWrite: 0, lastPayload: '', writeCount: 0, windowStart: now };

  if (now - record.windowStart > WINDOW_MS) {
    record.writeCount = 0;
    record.windowStart = now;
  }

  const payloadStr = JSON.stringify(payload);
  if (payloadStr === record.lastPayload && now - record.lastWrite < 2000) {
    return { allowed: false, retryAfter: Math.ceil((record.lastWrite + 2000 - now) / 1000) };
  }

  if (record.writeCount >= MAX_WRITES_PER_SEC) {
    return { allowed: false, retryAfter: Math.ceil((record.windowStart + WINDOW_MS - now) / 1000) };
  }

  record.lastWrite = now;
  record.lastPayload = payloadStr;
  record.writeCount++;
  writeLog.set(key, record);

  return { allowed: true, retryAfter: 0 };
}

export function clearWriteLog(path?: string) {
  if (path) {
    writeLog.delete(getPathKey(path));
  } else {
    writeLog.clear();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of writeLog.entries()) {
    if (now - record.lastWrite > 10000) {
      writeLog.delete(key);
    }
  }
}, 30000);
