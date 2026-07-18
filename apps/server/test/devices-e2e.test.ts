import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestServer, type TestServer } from './helpers/server-fixture';

let srv: TestServer;

beforeAll(async () => {
  srv = await bootTestServer();
});

afterAll(async () => {
  await srv.close();
});

describe('Devices API E2E', () => {
  it('GET /api/devices/pair-code returns code + expiresAt + qr', async () => {
    const res = await fetch(`${srv.url}/api/devices/pair-code`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string; expiresAt: string; qr: string };
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(body.expiresAt).toBeTruthy();
    expect(body.qr).toMatch(/^data:image\/png;base64,/);
  });

  it('POST /api/devices/pair with valid code returns token + deviceId', async () => {
    const codeRes = await fetch(`${srv.url}/api/devices/pair-code`);
    const { code } = (await codeRes.json()) as { code: string };

    const pairRes = await fetch(`${srv.url}/api/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, device_name: 'My iPhone', device_type: 'ios' }),
    });
    expect(pairRes.status).toBe(200);
    const body = (await pairRes.json()) as { token: string; deviceId: string };
    expect(body.token).toMatch(/^mb_/);
    // ULID is 26 chars
    expect(body.deviceId).toHaveLength(26);
  });

  it('POST /api/devices/pair with invalid code → 400', async () => {
    const res = await fetch(`${srv.url}/api/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'XXXX-XXXX', device_name: 'Bad', device_type: 'desktop' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('GET /api/devices lists paired devices', async () => {
    const codeRes = await fetch(`${srv.url}/api/devices/pair-code`);
    const { code } = (await codeRes.json()) as { code: string };
    await fetch(`${srv.url}/api/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, device_name: 'Listed Device', device_type: 'android' }),
    });

    const listRes = await fetch(`${srv.url}/api/devices`);
    expect(listRes.status).toBe(200);
    const { devices } = (await listRes.json()) as { devices: Array<{ name: string }> };
    expect(Array.isArray(devices)).toBe(true);
    expect(devices.some((d) => d.name === 'Listed Device')).toBe(true);
  });

  it('DELETE /api/devices/:id → 401 on subsequent capture', async () => {
    const codeRes = await fetch(`${srv.url}/api/devices/pair-code`);
    const { code } = (await codeRes.json()) as { code: string };
    const { token, deviceId } = (await fetch(`${srv.url}/api/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, device_name: 'Revoke Me', device_type: 'browser-ext' }),
    }).then((r) => r.json())) as { token: string; deviceId: string };

    const delRes = await fetch(`${srv.url}/api/devices/${deviceId}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    // Capture attempt after revocation should fail
    const capRes = await fetch(`${srv.url}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'text',
        text: 'should not reach inbox',
        captured_via: 'browser-ext',
        captured_at: new Date().toISOString(),
      }),
    });
    expect(capRes.status).toBe(401);
  });
});
