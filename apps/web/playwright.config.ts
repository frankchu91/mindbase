import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Use a stable tmpdir per test session so webServer re-use works correctly.
// The directory is created here at config-load time.
const testDataDir = process.env['MINDBASE_TEST_DATA_DIR']
  ?? mkdtempSync(join(tmpdir(), 'mb-pw-'));

// Test server runs on a SEPARATE port from the user's dev server (4321) so
// that running Playwright while a dev server is open doesn't write fixture
// pages into the real ~/mindbase-data. The previous config used 4321 with
// `reuseExistingServer: true`, which silently merged Playwright's seed pages
// (Graph Hub, Hover Source, Editor E2E Test, etc.) into the user's wiki.
const TEST_PORT = Number(process.env['MINDBASE_TEST_PORT'] ?? 4322);

export default defineConfig({
  testDir: './test',
  globalSetup: './test/global-setup.ts',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `MINDBASE_DATA_DIR=${testDataDir} MOCK_LLM=1 PORT=${TEST_PORT} pnpm -F @mindbase/server dev`,
    url: `http://localhost:${TEST_PORT}/api/health`,
    // Always start a fresh server for tests — never reuse a dev server, even
    // locally. Reuse silently writes test fixtures into real data when the
    // tmpdir override gets bypassed.
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
