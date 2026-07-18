import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import argon2 from 'argon2';
import { ulid } from 'ulid';

export interface DeviceInfo {
  id: string;
  name: string;
  type: 'ios' | 'android' | 'browser-ext' | 'desktop' | 'other';
  createdAt: string;
  lastSeen: string;
  revoked: boolean;
}

interface StoredDevice extends DeviceInfo {
  tokenHash: string;
}

const PAIR_TTL_MS = 60_000;

export class DeviceStore {
  private path: string;
  private codes = new Map<string, { expires: number }>();
  private cache: StoredDevice[] | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'devices.json');
  }

  async issuePairCode() {
    const code = `${rand4()}-${rand4()}`;
    const expiresAt = Date.now() + PAIR_TTL_MS;
    this.codes.set(code, { expires: expiresAt });
    setTimeout(() => this.codes.delete(code), PAIR_TTL_MS).unref();
    return { code, expiresAt };
  }

  async redeemPairCode(code: string, info: { name: string; type: DeviceInfo['type'] }) {
    const entry = this.codes.get(code);
    if (!entry || entry.expires < Date.now()) throw new Error('Invalid or expired code');
    this.codes.delete(code);

    const token = `mb_${randomBytes(24).toString('base64url')}`;
    const tokenHash = await argon2.hash(token, { type: argon2.argon2id });
    const id = ulid();
    const now = new Date().toISOString();
    const device: StoredDevice = {
      id, name: info.name, type: info.type,
      createdAt: now, lastSeen: now, revoked: false, tokenHash,
    };
    const all = await this.load();
    all.push(device);
    await this.save(all);
    return { token, deviceId: id };
  }

  async verify(token: string): Promise<DeviceInfo | null> {
    const all = await this.load();
    for (const d of all) {
      if (d.revoked) continue;
      if (await argon2.verify(d.tokenHash, token)) {
        d.lastSeen = new Date().toISOString();
        await this.save(all);
        const { tokenHash, ...info } = d;
        return info;
      }
    }
    return null;
  }

  async list(): Promise<DeviceInfo[]> {
    return (await this.load()).filter(d => !d.revoked).map(({ tokenHash, ...rest }) => rest);
  }

  async revoke(id: string) {
    const all = await this.load();
    const dev = all.find(d => d.id === id);
    if (dev) { dev.revoked = true; await this.save(all); }
  }

  private async load(): Promise<StoredDevice[]> {
    if (this.cache) return this.cache;
    let next: StoredDevice[] = [];
    try {
      const buf = await fs.readFile(this.path, 'utf8');
      const parsed = JSON.parse(buf);
      if (Array.isArray(parsed?.devices)) next = parsed.devices;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    this.cache = next;
    return next;
  }

  private async save(all: StoredDevice[]) {
    this.cache = all;
    await fs.writeFile(this.path, JSON.stringify({ devices: all }, null, 2));
  }
}

function rand4() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let out = '';
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
