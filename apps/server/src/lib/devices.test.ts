import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeviceStore } from './devices';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mb-devices-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('DeviceStore', () => {
  it('issues a pair code that expires in 60s', async () => {
    const store = new DeviceStore(dir);
    const { code, expiresAt } = await store.issuePairCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(expiresAt - Date.now()).toBeGreaterThan(50_000);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('exchanges code for token, single-use', async () => {
    const store = new DeviceStore(dir);
    const { code } = await store.issuePairCode();
    const { token, deviceId } = await store.redeemPairCode(code, { name: 'Test', type: 'ios' });
    expect(token).toMatch(/^mb_/);
    expect(deviceId).toMatch(/^[0-9A-Z]{26}$/);
    await expect(store.redeemPairCode(code, { name: 'X', type: 'ios' })).rejects.toThrow(/code/);
  });

  it('verifies token, returns device info', async () => {
    const store = new DeviceStore(dir);
    const { code } = await store.issuePairCode();
    const { token } = await store.redeemPairCode(code, { name: 'Test', type: 'ios' });
    const dev = await store.verify(token);
    expect(dev?.name).toBe('Test');
  });

  it('rejects revoked tokens', async () => {
    const store = new DeviceStore(dir);
    const { code } = await store.issuePairCode();
    const { token, deviceId } = await store.redeemPairCode(code, { name: 'Test', type: 'ios' });
    await store.revoke(deviceId);
    expect(await store.verify(token)).toBeNull();
  });

  it('persists across instances', async () => {
    const a = new DeviceStore(dir);
    const { code } = await a.issuePairCode();
    const { token } = await a.redeemPairCode(code, { name: 'Test', type: 'ios' });
    const b = new DeviceStore(dir);
    expect(await b.verify(token)).not.toBeNull();
  });

  it('verify returns null for garbage token', async () => {
    const store = new DeviceStore(dir);
    expect(await store.verify('not-a-real-token')).toBeNull();
    expect(await store.verify('mb_garbage')).toBeNull();
  });

  it('list excludes revoked devices and strips tokenHash', async () => {
    const store = new DeviceStore(dir);
    const { code: c1 } = await store.issuePairCode();
    const { deviceId: d1 } = await store.redeemPairCode(c1, { name: 'A', type: 'ios' });
    const { code: c2 } = await store.issuePairCode();
    await store.redeemPairCode(c2, { name: 'B', type: 'android' });
    await store.revoke(d1);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('B');
    expect((list[0] as any).tokenHash).toBeUndefined();
  });

  it('revoke is a no-op for unknown id', async () => {
    const store = new DeviceStore(dir);
    await expect(store.revoke('does-not-exist')).resolves.toBeUndefined();
  });
});
