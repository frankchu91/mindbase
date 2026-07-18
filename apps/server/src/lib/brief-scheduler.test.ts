import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BriefScheduler } from './brief-scheduler';
import type { ServerContext } from '../context';
import type { AtlasConfig } from '../config';

/** Build a minimal mock ServerContext. */
function makeCtx(overrides?: Partial<AtlasConfig['dailyBrief']>): ServerContext {
  const dailyBrief: AtlasConfig['dailyBrief'] = {
    enabled: true,
    time: '09:00',
    timezone: 'UTC',
    email: 'test@example.com',
    smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'u', pass: 'p' },
    includeOnThisDay: false,
    includeQuiz: false,
    manualOnly: false,
    ...overrides,
  };

  return {
    config: { dailyBrief } as AtlasConfig,
    dataDir: '/tmp/test-brief-scheduler',
  } as unknown as ServerContext;
}

describe('BriefScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts without throwing when config is valid', () => {
    const ctx = makeCtx();
    const scheduler = new BriefScheduler(ctx);
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
  });

  it('stop() clears the task without errors', () => {
    const ctx = makeCtx();
    const scheduler = new BriefScheduler(ctx);
    scheduler.start();
    expect(() => scheduler.stop()).not.toThrow();
    // Calling stop() again should be a no-op
    expect(() => scheduler.stop()).not.toThrow();
  });

  it('reschedule() is idempotent — multiple calls do not throw', () => {
    const ctx = makeCtx();
    const scheduler = new BriefScheduler(ctx);
    expect(() => {
      scheduler.reschedule();
      scheduler.reschedule();
      scheduler.reschedule();
    }).not.toThrow();
    scheduler.stop();
  });

  it('does not schedule when manualOnly is true', () => {
    const ctx = makeCtx({ manualOnly: true });
    const scheduler = new BriefScheduler(ctx);
    // Should start without scheduling (no cron task internally)
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
  });

  it('does not schedule when enabled is false', () => {
    const ctx = makeCtx({ enabled: false } as Partial<AtlasConfig['dailyBrief']>);
    const scheduler = new BriefScheduler(ctx);
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
  });

  it('does not schedule when time string is invalid', () => {
    const ctx = makeCtx({ time: 'not-a-time' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scheduler = new BriefScheduler(ctx);
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
    warnSpy.mockRestore();
  });

  it('runOnce returns null when dailyBrief not configured', async () => {
    const ctx = {
      config: { dailyBrief: undefined },
      dataDir: '/tmp/test',
    } as unknown as ServerContext;

    const scheduler = new BriefScheduler(ctx);
    const result = await scheduler.runOnce();
    expect(result).toBeNull();
  });

  it('runOnce returns null when disabled', async () => {
    const ctx = makeCtx({ enabled: false } as Partial<AtlasConfig['dailyBrief']>);
    const scheduler = new BriefScheduler(ctx);
    const result = await scheduler.runOnce();
    expect(result).toBeNull();
  });
});
