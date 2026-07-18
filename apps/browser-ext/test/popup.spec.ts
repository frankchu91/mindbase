/**
 * popup.spec.ts — Tests for the MindBase browser extension popup.
 *
 * What's tested:
 *   1. Unpaired state: popup shows a "not paired" message with a settings button
 *   2. Paired state: popup shows a capture form (title input + mode pills + Save)
 *   3. Capture flow: clicking Save on the form posts to the server and shows the
 *      new entry in the Recent list with a "queued" badge
 *
 * Implementation notes:
 *   - We open popup.html directly as a page (chrome-extension://<id>/popup.html).
 *     This bypasses the toolbar click (which Playwright cannot trigger), but gives
 *     full DOM access.
 *   - Pairing is done programmatically via pairExtension() — see fixture.
 *   - The popup reads chrome.storage via the background service worker; after
 *     we inject credentials, we give Chrome a tick to propagate the storage
 *     change before opening the popup.
 */
import { test, expect, pairExtension } from './helpers/extension-fixture';

const SERVER_URL = process.env.MINDBASE_TEST_BASE_URL ?? 'http://localhost:4323';

test.describe('popup — unpaired state', () => {
  test('shows "not paired" empty state when extension has no token', async ({
    context,
    extensionId,
  }) => {
    // No pairing — open popup cold.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    // The popup renders renderNotPaired() which writes:
    //   'MindBase is not paired with a server yet.' + 'Open Settings to pair' button
    await expect(
      popup.getByText(/not paired with a server/i),
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      popup.getByRole('button', { name: /open settings to pair/i }),
    ).toBeVisible();
  });
});

test.describe('popup — paired state', () => {
  test.beforeEach(async ({ context, extensionId, page }) => {
    // Pair the extension before each test in this group.
    await pairExtension(context, extensionId, page, SERVER_URL);
    // Small wait: chrome.storage.onChanged propagation before popup reads settings.
    await page.waitForTimeout(300);
  });

  test('shows capture form (title input, mode pills, Save button)', async ({
    context,
    extensionId,
  }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    // Title input (placeholder 'Page title')
    await expect(popup.locator('input[placeholder="Page title"]')).toBeVisible({
      timeout: 8_000,
    });

    // Mode pills: URL / Selection / Voice
    await expect(popup.getByText('URL').first()).toBeVisible();
    await expect(popup.getByText('Selection').first()).toBeVisible();
    await expect(popup.getByText('Voice').first()).toBeVisible();

    // Save button
    await expect(
      popup.getByRole('button', { name: /^save$/i }),
    ).toBeVisible();
  });

  test('Save button posts capture and recent list shows queued entry', async ({
    context,
    extensionId,
    page,
  }) => {
    // Open a real tab — the popup reads its URL/title for pre-fill
    const targetTab = await context.newPage();
    await targetTab.goto('https://example.com');
    await targetTab.waitForLoadState('load');

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    // Wait for form to appear
    const saveBtn = popup.getByRole('button', { name: /^save$/i });
    await expect(saveBtn).toBeVisible({ timeout: 8_000 });

    // The popup pre-fills the title from the active tab. Active tab in a
    // persistent context may not be example.com; set a manual title to keep
    // test deterministic.
    const titleInput = popup.locator('input[placeholder="Page title"]');
    await titleInput.fill('Playwright E2E Test Capture');

    // Click Save — this calls capture() which POSTs to /api/capture
    await saveBtn.click();

    // The popup sets status 'Saving…' briefly then '✓ Saved'
    await expect(popup.locator('.status.success')).toBeVisible({ timeout: 10_000 });

    // After save, the recent list renders — look for the queued badge
    // The badge text is 'queued' (from statusLabels in renderCaptureItem)
    await expect(popup.locator('.badge-queued').first()).toBeVisible({ timeout: 5_000 });

    await targetTab.close();
  });

  test('Note and Tags fields are visible and accept input', async ({
    context,
    extensionId,
  }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    await expect(popup.locator('textarea[placeholder="Optional note…"]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(popup.locator('input[placeholder="tag1, tag2, …"]')).toBeVisible();

    // Verify typing works
    await popup.locator('textarea[placeholder="Optional note…"]').fill('test note');
    await popup.locator('input[placeholder="tag1, tag2, …"]').fill('playwright, test');

    await expect(popup.locator('textarea[placeholder="Optional note…"]')).toHaveValue(
      'test note',
    );
  });
});
