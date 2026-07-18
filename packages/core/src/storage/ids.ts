const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 6-char lowercase alphanumeric id. ~2.2B combinations — collisions are acceptable at MVP scale. */
export function newShortId(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
