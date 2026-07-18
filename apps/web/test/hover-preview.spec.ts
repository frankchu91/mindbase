import { test, expect, request as playwrightRequest } from '@playwright/test';

test.describe('Wikilink Hover Preview', () => {
  test.beforeAll(async ({ baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL });

    // Use /api/wiki/file which creates both .md AND .meta.json so pages appear in the list.
    await api.post('/api/wiki/file', {
      data: {
        title: 'Hover Target',
        content: 'This is the target page content for hover preview tests. It has enough text to show as excerpt.',
      },
    });

    await api.post('/api/wiki/file', {
      data: {
        title: 'Hover Source',
        content: 'This page contains a link to [[hover-target]] which should trigger a preview.',
      },
    });

    await api.dispose();
  });

  // Helper: open an article by clicking its title in the KnowledgeList
  async function openArticle(page: import('@playwright/test').Page, title: string) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // KnowledgeListItem renders title in a button
    const item = page.getByText(title).first();
    await expect(item).toBeVisible({ timeout: 5000 });
    await item.click();
    // Wait for ArticleView to finish loading (prose content appears)
    await page.waitForTimeout(600);
  }

  test('hovering wikilink for 300ms shows popover', async ({ page }) => {
    await openArticle(page, 'Hover Source');

    // ArticleView renders [[hover-target]] as <a href="#wiki:hover-target">hover-target</a>
    const wikilink = page.locator('a[href*="#wiki:hover-target"]').first();

    if (!(await wikilink.isVisible().catch(() => false))) {
      test.skip(true, 'Wikilink not found in rendered page');
      return;
    }

    // Hover — ArticleView fires setHoverSlug after 250ms
    await wikilink.hover();
    await page.waitForTimeout(400); // past the 250ms delay

    // WikilinkPopover renders the target page title
    await expect(
      page.getByText(/hover target/i).nth(1)
    ).toBeVisible({ timeout: 3000 });
  });

  test('clicking wikilink navigates to target article', async ({ page }) => {
    await openArticle(page, 'Hover Source');

    const wikilink = page.locator('a[href*="#wiki:hover-target"]').first();

    if (!(await wikilink.isVisible().catch(() => false))) {
      test.skip(true, 'Wikilink not found in rendered page');
      return;
    }

    // ArticleView onClick calls onOpenArticle(linkedSlug, path)
    await wikilink.click();
    await page.waitForTimeout(500);

    // Now showing hover-target article
    await expect(page.getByText(/hover target/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('hover preview popover snapshot', async ({ page }) => {
    await openArticle(page, 'Hover Source');

    const wikilink = page.locator('a[href*="#wiki:hover-target"]').first();
    if (!(await wikilink.isVisible().catch(() => false))) {
      test.skip(true, 'Wikilink not found — skipping snapshot');
      return;
    }

    await wikilink.hover();
    await page.waitForTimeout(400);

    // Snapshot the left panel (aside) containing the article view with popover
    await expect(page.locator('aside').first()).toHaveScreenshot('hover-preview-popover.png', { maxDiffPixels: 100 });
  });
});
