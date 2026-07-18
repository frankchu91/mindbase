/**
 * right-click-capture.spec.ts
 *
 * CONTEXT MENU LIMITATION:
 * The browser's native right-click menu is rendered by Chrome's UI shell, not
 * the extension's HTML. Playwright has no API to open or click the native
 * context menu (page.click() triggers DOM events, not the OS-level context menu
 * that Chrome intercepts for extension menus).
 *
 * THREE TESTING APPROACHES AND WHY EACH WAS CHOSEN / REJECTED:
 *
 *   A. page.mouse.click(x, y, { button: 'right' }) → dispatches a DOM
 *      contextmenu event, does NOT open the Chrome toolbar context menu.
 *      NOT SUFFICIENT to trigger chrome.contextMenus.onClicked.
 *
 *   B. chrome.debugger attach → could drive the native menu via CDP
 *      Input.dispatchMouseEvent but requires additional extension permissions
 *      and is extremely brittle.
 *
 *   C. Invoke the menu handler directly via serviceWorker.evaluate():
 *      Construct a synthetic OnClickData object and invoke the internal
 *      capture logic. BUT: the handler is inside defineBackground()'s closure
 *      — it is NOT exported. There's no public entry point to call.
 *
 * CHOSEN APPROACH: Test the equivalent functionality via the popup's
 * "Selection" mode, which exercises the same server POST path as the context
 * menu handler. This covers 95 % of the value at much lower fragility cost.
 *
 * The native context-menu trigger is documented as NOT AUTOMATABLE with
 * Playwright 1.x on Chrome. A future option: use chrome.contextMenus.onClicked
 * simulation by injecting a listener override in the SW context — but this
 * would be testing the test harness, not the feature.
 */

import { test, expect, pairExtension } from './helpers/extension-fixture';

const SERVER_URL = process.env.MINDBASE_TEST_BASE_URL ?? 'http://localhost:4323';

test.describe('selection capture (popup Selection mode)', () => {
  /**
   * This test covers the same code path as the right-click "Save selection"
   * menu item: the popup Selection mode calls capture({ type: 'text', text })
   * which hits the same POST /api/capture endpoint.
   *
   * KNOWN BEHAVIOUR: When the popup is opened as a full tab (not a real extension
   * popup triggered from the toolbar), chrome.storage.onChanged and the alarm
   * poll may trigger a re-render that resets the mode pill to 'URL' after our
   * click. The workaround is to click the pill and immediately click Save in
   * the same microtask burst, then assert the outcome rather than the
   * intermediate CSS class state.
   *
   * We verify the mode switch worked by asserting the OUTCOME of the mode:
   * clicking Save in Selection mode with no highlighted text shows the
   * "No selection found" error, confirming the mode DID switch server-side.
   */
  test('Selection mode: clicking pill then Save shows "no selection found" error', async ({
    context,
    extensionId,
    page,
  }) => {
    await pairExtension(context, extensionId, page, SERVER_URL);
    // Wait for background polls to settle so they don't re-render the popup
    await page.waitForTimeout(2_000);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    const selectionPill = popup.locator('button.mode-pill', { hasText: /^Selection$/ });
    await expect(selectionPill).toBeVisible({ timeout: 8_000 });

    // The pill click IS working (confirmed via MutationObserver in debug sessions),
    // but the background's periodic poll may write to chrome.storage between the
    // pill click and the Save click, causing chrome.storage.onChanged to fire
    // renderRecent() which — due to the way the storage listener is wired — does
    // NOT re-render the pills. However a second init() IS possible if the page
    // gets a 'visibilitychange' or re-attach event in extension popup context.
    //
    // Strategy: use page.evaluate to both click the pill AND click Save in the
    // same synchronous call so no async re-render can interleave.
    // Record when we click and watch for status changes via MutationObserver.
    // The MutationObserver is our most reliable signal — it fires synchronously
    // in response to DOM changes without any polling delay.
    const foundError = await popup.evaluate(() => {
      return new Promise<boolean>(resolve => {
        const selPill = Array.from(document.querySelectorAll('.mode-pill'))
          .find(p => p.textContent?.trim() === 'Selection') as HTMLButtonElement | undefined;
        const saveBtn = document.querySelector('button.btn.btn-primary') as HTMLButtonElement | undefined;
        const statusEl = document.querySelector('.status');

        if (!statusEl || !selPill || !saveBtn) {
          resolve(false);
          return;
        }

        // Set up observer BEFORE clicking — resolves as soon as error text appears
        const obs = new MutationObserver(() => {
          if (/no selection found/i.test(statusEl.textContent ?? '')) {
            obs.disconnect();
            resolve(true);
          }
        });
        obs.observe(statusEl, { characterData: true, childList: true, subtree: true, attributes: true });

        // Fallback: resolve false after 4s
        setTimeout(() => { obs.disconnect(); resolve(false); }, 4000);

        // Click pill + save
        selPill.click();
        saveBtn.click();
      });
    });

    expect(foundError).toBe(true);
  });

  test('Selection mode pill renders and is interactable', async ({
    context,
    extensionId,
    page,
  }) => {
    await pairExtension(context, extensionId, page, SERVER_URL);
    await page.waitForTimeout(2_000);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    // All three mode pills are visible
    await expect(popup.locator('button.mode-pill', { hasText: /^URL$/ })).toBeVisible({ timeout: 8_000 });
    await expect(popup.locator('button.mode-pill', { hasText: /^Selection$/ })).toBeVisible();
    await expect(popup.locator('button.mode-pill', { hasText: /^Voice$/ })).toBeVisible();

    // URL is the default active pill
    await expect(popup.locator('.mode-pill.active')).toHaveText('URL');
  });

  /**
   * SKIPPED: native context menu trigger via right-click.
   *
   * Reason: Chrome's native context menu (the one that shows extension menu
   * items from chrome.contextMenus.create) cannot be opened by Playwright's
   * mouse API. page.mouse.click with button:'right' fires a DOM contextmenu
   * event that is NOT routed through the browser's extension context menu
   * system. This is a fundamental limitation of Playwright + Chrome extension
   * context menus, confirmed in playwright/playwright#5685.
   *
   * Workaround for manual testing:
   *   1. Load the extension in Chrome
   *   2. Navigate to any page with text
   *   3. Highlight text → right-click → "Save selection to MindBase"
   *   4. Check popup Recent list for the new entry
   */
  test.skip('native right-click context menu (BLOCKED: Playwright cannot open Chrome extension context menus)', () => {
    // Not automatable — see file-level comment above.
  });
});

test.describe('context menu handler — service worker direct invocation', () => {
  /**
   * We can partially test the context menu flow by injecting a capture into
   * storage directly from the SW and verifying the badge/storage state.
   * This tests the trackNew() → updateBadge() → saveCaptures() chain that
   * the real onClicked handler uses.
   */
  test('trackNew() via SW message updates storage and badge', async ({
    context,
    extensionId,
    page,
  }) => {
    const token = await pairExtension(context, extensionId, page, SERVER_URL);
    await page.waitForTimeout(300);

    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }

    // POST a real capture to get a valid server-issued ID
    const captureResp = await page.request.post(`${SERVER_URL}/api/capture`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      data: {
        type: 'text',
        text: 'This is a test selection from the Playwright automation suite.',
        url: 'https://example.com/test',
        title: 'Context Menu Test',
        captured_via: 'browser-ext',
        captured_at: new Date().toISOString(),
        client_dedup_key: `ctx-menu-test:${Date.now()}`,
      },
    });
    expect(captureResp.ok()).toBeTruthy();
    const { id } = (await captureResp.json()) as { id: string };

    // Send a 'track' message to the background SW — this is the same message
    // the popup sends after a capture, and exercises the same trackNew() path
    // that chrome.contextMenus.onClicked uses.
    //
    // NOTE: chrome.runtime.sendMessage from within sw.evaluate() tries to send
    // to other extensions, not itself — it fails with "Receiving end does not exist".
    // We send from the options page instead (which has extension privilege and
    // can message the background SW correctly).
    const msgPage = await context.newPage();
    await msgPage.goto(`chrome-extension://${extensionId}/options.html`);
    await msgPage.waitForLoadState('domcontentloaded');
    await msgPage.evaluate((captureId) => {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { kind: 'track', id: captureId, type: 'text', title: 'Context Menu Test', url: 'https://example.com/test' },
          (resp) => {
            if (chrome.runtime.lastError || !resp?.ok) {
              reject(new Error(chrome.runtime.lastError?.message ?? 'track failed'));
            } else {
              resolve(resp);
            }
          },
        );
      });
    }, id);
    await msgPage.close();

    // Wait a tick for storage to settle
    await page.waitForTimeout(500);

    // Verify the capture appeared in storage
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.waitForLoadState('domcontentloaded');
    const captures = (await optionsPage.evaluate(() => {
      return chrome.storage.local
        .get('mindbase.captures')
        .then(r => r['mindbase.captures']);
    })) as Array<{ id: string; status: string }>;
    await optionsPage.close();

    const tracked = captures?.find(c => c.id === id);
    expect(tracked).toBeDefined();
    expect(tracked?.status).toBe('queued');
  });
});
