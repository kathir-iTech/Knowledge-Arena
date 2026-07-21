import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const L = chars.length;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(1);
    const out = new Array(6);
    for (let i = 0; i < 6; i++) {
      let byte: number;
      do { crypto.getRandomValues(buf); byte = buf[0]; } while (byte >= 256 - (256 % L));
      out[i] = chars[byte % L];
    }
    return out.join('');
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
