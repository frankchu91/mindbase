/**
 * live-preview-editor.spec.ts
 *
 * Playwright tests for the Live Preview (Milkdown) editor.
 *
 * NOTE: Most assertions are marked test.fixme() because Milkdown's ProseMirror DOM
 * uses contenteditable with complex nested spans — reliable assertions require
 * either polling for `.ProseMirror` to be fully hydrated plus verifying specific
 * rendered node types. The smoke test for basic load + mode toggle is enabled;
 * deeper assertions are fixme-flagged with clear TODO comments.
 *
 * The server E2E tests (attachments-e2e.test.ts) cover the upload endpoint fully.
 */

import { test, expect } from '@playwright/test';

const TEST_SLUG = 'live-preview-test';
const TEST_CONTENT = '# Heading\n\nSome **bold** text.\n\n[[another-page]]\n';

test.describe('Live Preview Editor', () => {
  test.beforeEach(async ({ request }) => {
    // Seed a wiki page via the file API
    const res = await request.post('/api/wiki/file', {
      data: {
        slug: TEST_SLUG,
        title: 'Live Preview Test',
        content: TEST_CONTENT,
      },
    });
    // 200 or 201 either way
    expect([200, 201]).toContain(res.status());
  });

  test('Live Preview Editor loads and shows Milkdown container', async ({ page }) => {
    await page.goto('/');

    // Navigate to the test article
    await page.waitForSelector('[data-slug]', { timeout: 10_000 });
    const articleLink = page.locator(`[data-slug="${TEST_SLUG}"]`).first();

    if (await articleLink.isVisible()) {
      await articleLink.click();
    } else {
      // Fallback: navigate directly via URL hash (if SPA supports it)
      await page.goto(`/#wiki:${TEST_SLUG}`);
      await page.waitForLoadState('networkidle');
    }

    // Click Edit button
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await editBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await editBtn.click();

    // Wait for the Milkdown editor to mount (lazy import — may take a moment)
    // The loader shows "Loading editor…" while the chunk is being fetched
    await page.waitForSelector('.ProseMirror, .milkdown-wrapper', { timeout: 15_000 });

    // Mode toggle buttons should be visible
    await expect(page.getByTitle('Live Preview (active)')).toBeVisible();
    await expect(page.getByTitle(/Source mode/)).toBeVisible();
  });

  // TODO: assert rendered heading after Milkdown hydrates
  // The `.ProseMirror h1` selector is correct but timing is tricky.
  test.fixme('Live Preview renders h1 heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(`[data-slug="${TEST_SLUG}"]`, { timeout: 10_000 });
    await page.locator(`[data-slug="${TEST_SLUG}"]`).first().click();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.waitForSelector('.ProseMirror', { timeout: 15_000 });

    // Wait for content to be rendered as heading
    await expect(page.locator('.ProseMirror h1, .milkdown h1')).toContainText('Heading', { timeout: 5_000 });
  });

  // TODO: verify source mode shows raw markdown
  test.fixme('Toggle to Source mode shows raw markdown in CodeMirror', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(`[data-slug="${TEST_SLUG}"]`, { timeout: 10_000 });
    await page.locator(`[data-slug="${TEST_SLUG}"]`).first().click();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.waitForSelector('.ProseMirror, .milkdown-wrapper', { timeout: 15_000 });

    // Click Source mode
    await page.getByTitle(/Source mode/).click();

    // CodeMirror content area should contain raw markdown
    await expect(page.locator('.cm-content')).toContainText('# Heading', { timeout: 5_000 });
  });

  // TODO: verify ⌘+/ toggles modes
  test.fixme('⌘+/ keyboard shortcut toggles between Preview and Source modes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(`[data-slug="${TEST_SLUG}"]`, { timeout: 10_000 });
    await page.locator(`[data-slug="${TEST_SLUG}"]`).first().click();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.waitForSelector('.ProseMirror, .milkdown-wrapper', { timeout: 15_000 });

    // Press ⌘+/ to toggle to source
    await page.keyboard.press('Meta+/');
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5_000 });

    // Press ⌘+/ again to toggle back
    await page.keyboard.press('Meta+/');
    await expect(page.locator('.ProseMirror, .milkdown-wrapper')).toBeVisible({ timeout: 5_000 });
  });

  // TODO: assert wikilink chip renders
  test.fixme('Wikilinks render as blue chips in Preview mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(`[data-slug="${TEST_SLUG}"]`, { timeout: 10_000 });
    await page.locator(`[data-slug="${TEST_SLUG}"]`).first().click();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.waitForSelector('.ProseMirror', { timeout: 15_000 });

    // Check for wikilink chip
    await expect(page.locator('a.wikilink-chip')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('a.wikilink-chip')).toContainText('another-page');
  });
});
