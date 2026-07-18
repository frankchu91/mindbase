import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extPath = join(__dirname, '.output', 'chrome-mv3');
const dataDir = mkdtempSync(join(tmpdir(), 'mb-ext-pw-'));

// Test server runs on its own port (4323) so Playwright never accidentally
// writes "Badge Test Capture" + "Playwright E2E Test Capture" entries into the
// user's real ~/mindbase-data via a reused dev server on 4321.
const TEST_PORT = Number(process.env['MINDBASE_TEST_PORT'] ?? 4323);

export default defineConfig({
  testDir: './test',
  fullyParallel: false, // extension tests need single browser instance
  workers: 1,
  timeout: 30_000,
  retries: 0, // extension tests are fragile — no retries mask real failures
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    // NOTE: headless: false required — Chrome extensions do not work in legacy
    // headless mode. On Linux CI without a display, wrap with: xvfb-run --auto-servernum
    headless: false,
    launchOptions: {
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage', // avoid /dev/shm limits on CI
      ],
    },
  },
  webServer: {
    command: `MINDBASE_DATA_DIR=${dataDir} MOCK_LLM=1 PORT=${TEST_PORT} pnpm -F @mindbase/server dev`,
    url: `http://localhost:${TEST_PORT}/api/devices`,
    // Never reuse the dev server on 4321 — that's how test fixtures leaked
    // into real data the first time around.
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
