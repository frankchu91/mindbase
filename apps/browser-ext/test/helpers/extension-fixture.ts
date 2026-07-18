/**
 * Playwright fixture for Chrome extension testing.
 *
 * Key design decisions:
 * - Uses launchPersistentContext (required for --load-extension to work)
 * - Extension ID is discovered via the service worker URL (no manifest ID hardcoded)
 * - pairExtension() bypasses the UI form — it calls the API directly then writes
 *   storage so we skip the brittle "type XXXX-XXXX in a form" dance
 */
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extPath = join(__dirname, '..', '..', '.output', 'chrome-mv3');

// ── Custom fixtures ────────────────────────────────────────────────────────────

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // Override the default context with one that loads the extension.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // Service workers are registered when the extension loads. Wait for one.
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    // Service worker URL format: chrome-extension://<extId>/background.js
    const extId = serviceWorker.url().split('/')[2]!;
    await use(extId);
  },
});

export { expect } from '@playwright/test';

// ── Pairing helper ─────────────────────────────────────────────────────────────

/**
 * Programmatically pair the extension to the running server.
 *
 * Strategy: rather than driving the UI form (fragile, requires correct
 * selectors + timing), we:
 *   1. GET /api/devices/pair-code from the server
 *   2. POST /api/devices/pair directly
 *   3. Write the resulting token + deviceId into chrome.storage.local
 *      via an options page evaluate() call (options page has extension privilege)
 *
 * This is faster, more reliable, and tests the pairing API as a side effect.
 */
export async function pairExtension(
  context: BrowserContext,
  extensionId: string,
  page: Page,
  serverUrl = process.env.MINDBASE_TEST_BASE_URL ?? 'http://localhost:4323',
): Promise<string> {
  // Step 1: get a pair code from the server
  const codeResp = await page.request.get(`${serverUrl}/api/devices/pair-code`);
  if (!codeResp.ok()) {
    throw new Error(`pair-code request failed: ${codeResp.status()}`);
  }
  const { code } = (await codeResp.json()) as { code: string };

  // Step 2: redeem the code
  const pairResp = await page.request.post(`${serverUrl}/api/devices/pair`, {
    data: {
      code,
      device_name: 'Playwright Test Device',
      device_type: 'browser-ext',
    },
  });
  if (!pairResp.ok()) {
    throw new Error(`pair request failed: ${pairResp.status()} ${await pairResp.text()}`);
  }
  const { token, deviceId } = (await pairResp.json()) as {
    token: string;
    deviceId: string;
  };

  // Step 3: inject the credentials into extension storage via the options page.
  // The options page runs in the extension context, so it has access to
  // chrome.storage.local.  We navigate to it, run evaluate(), then close it.
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  // Wait for the page to fully load (DOMContentLoaded fires the extension script)
  await optionsPage.waitForLoadState('domcontentloaded');

  await optionsPage.evaluate(
    ({ token, deviceId, serverUrl }) => {
      const KEY = 'mindbase.settings';
      const settings = {
        serverUrl,
        token,
        deviceId,
      };
      return chrome.storage.local.set({ [KEY]: settings });
    },
    { token, deviceId, serverUrl },
  );

  await optionsPage.close();
  return token;
}

/**
 * Read chrome.storage.local from the extension context.
 * Opens the options page, calls evaluate(), returns the value.
 */
export async function readExtStorage(
  context: BrowserContext,
  extensionId: string,
  key: string,
): Promise<unknown> {
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.waitForLoadState('domcontentloaded');
  const value = await optionsPage.evaluate(
    (k: string) => chrome.storage.local.get(k).then(r => r[k]),
    key,
  );
  await optionsPage.close();
  return value;
}
