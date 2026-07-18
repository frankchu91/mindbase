// SHA-256 hex digest helper. Used for content-addressed filenames (e.g. attachments).
import { createHash } from 'node:crypto';

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
