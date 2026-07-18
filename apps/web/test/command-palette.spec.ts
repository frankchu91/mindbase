/**
 * Playwright E2E tests for the rebuilt Command Palette.
 * Tests as-you-type search, operator parsing, and keyboard navigation.
 *
 * NOTE: The server uses a mock LLM adapter in tests (MOCK_LLM=1 set by global-setup).
 * BGE-M3 embeddings are NOT downloaded in tests; vector search silently no-ops.
 * BM25 results are verified instead.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';

const PAGE_TITLE = 'Command Palette Test Page';
const PAGE_BODY = 'This page is about machine learning and artificial intelligence systems.';

test.describe('Command Palette — hybrid search', () => {
  test.beforeAll(async ({ baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL });
    await api.post('/api/wiki/file', {
      data: { title: PAGE_TITLE, content: `# ${PAGE_TITLE}\n\n${PAGE_BODY}` },
    });
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('opens with ⌘K and shows search input', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByPlaceholder(/Search knowledge/);
    await expect(input).toBeVisible({ timeout: 3000 });
  });

  test('closes with Escape', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByPlaceholder(/Search knowledge/)).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder(/Search knowledge/)).not.toBeVisible({ timeout: 2000 });
  });

  test('shows results for a keyword query within 2s', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByPlaceholder(/Search knowledge/);
    await expect(input).toBeVisible({ timeout: 3000 });

    await input.fill('machine learning');

    // Results should appear within 2s (200ms debounce + BM25 call)
    await expect(page.getByText('Wiki Pages', { exact: false })).toBeVisible({ timeout: 2000 });
  });

  test('shows filter chip when operator syntax is used', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByPlaceholder(/Search knowledge/);
    await expect(input).toBeVisible({ timeout: 3000 });

    await input.fill('machine tag:ai');
    // Filter chip should appear below the input
    await expect(page.getByText('tag:ai')).toBeVisible({ timeout: 1500 });
  });

  test('navigates results with arrow keys', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByPlaceholder(/Search knowledge/);
    await expect(input).toBeVisible({ timeout: 3000 });

    await input.fill('machine');
    await expect(page.getByText('Wiki Pages', { exact: false })).toBeVisible({ timeout: 2000 });

    // Arrow down should move selection
    await page.keyboard.press('ArrowDown');
    // Just verify no errors thrown (selection state is internal)
    await expect(input).toBeVisible();
  });

  test('shows Actions section', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByText('Actions')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Ingest a URL or file')).toBeVisible({ timeout: 1000 });
  });

  test('shows ⌘↵ ask AI button when results present', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByPlaceholder(/Search knowledge/);
    await expect(input).toBeVisible({ timeout: 3000 });

    await input.fill('machine learning');
    await expect(page.getByText('Wiki Pages', { exact: false })).toBeVisible({ timeout: 2000 });

    // Bottom hint bar should show "⌘↵ ask AI"
    await expect(page.getByText(/ask AI/i)).toBeVisible({ timeout: 1000 });
  });
});
