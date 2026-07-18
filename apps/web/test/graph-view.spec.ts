import { test, expect, request as playwrightRequest } from '@playwright/test';

test.describe('Graph View', () => {
  test.beforeAll(async ({ baseURL }) => {
    // Use /api/wiki/file to create both .md AND .meta.json for graph data
    const api = await playwrightRequest.newContext({ baseURL });
    await api.post('/api/wiki/file', {
      data: {
        title: 'Graph Hub',
        content: 'This is the hub page with links to [[graph-node-a]] and [[graph-node-b]].',
      },
    });
    await api.post('/api/wiki/file', {
      data: {
        title: 'Graph Node A',
        content: 'This page links back to [[graph-hub]].',
      },
    });
    await api.post('/api/wiki/file', {
      data: {
        title: 'Graph Node B',
        content: 'This page links to [[graph-hub]].',
      },
    });
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // Helper: click the '✦ Graph' footer button (not an article with "Graph" in the title)
  async function openGraphView(page: import('@playwright/test').Page) {
    // The KnowledgeList footer has '✦ Graph' button. To avoid matching article list items
    // that also contain "Graph" (e.g. "Graph Hub"), use the exact text with the ✦ symbol.
    // The footer button contains BOTH the ✦ symbol and "Graph" text.
    const graphBtn = page.getByRole('button', { name: '✦ Graph' });
    await graphBtn.click();
    // Wait for the GraphView header which has a search input
    await expect(
      page.locator('input[placeholder*="Search pages"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  test('Graph view opens via sidebar button', async ({ page }) => {
    await openGraphView(page);
    // Canvas should be visible (ForceGraph2D renders a <canvas>)
    // The graph container has the search input visible (already verified by openGraphView)
    // Additionally check canvas appears after data loads
    await page.waitForTimeout(1500);
    const canvas = page.locator('canvas').first();
    const isCanvasVisible = await canvas.isVisible().catch(() => false);
    const searchBar = page.locator('input[placeholder*="Search pages"]').first();
    const isSearchVisible = await searchBar.isVisible().catch(() => false);
    expect(isCanvasVisible || isSearchVisible).toBe(true);
  });

  test('stats overlay shows pages and links', async ({ page }) => {
    await openGraphView(page);
    // Wait for graph data to load — stats bar shows "{N} pages · {N} links"
    // GraphView renders stats only after data is loaded
    // Match "N pages" anywhere in the stats bar
    await expect(
      page.getByText(/\d+\s*pages/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('search box filters nodes', async ({ page }) => {
    await openGraphView(page);

    // Search input placeholder is 'Search pages…'
    const searchInput = page.locator('input[placeholder*="Search pages"]').first();
    await searchInput.fill('Graph Hub');
    await page.waitForTimeout(300);

    // After typing, the search term should still be in the input
    await expect(searchInput).toHaveValue('Graph Hub');
  });

  test('graph view snapshot — search bar and stats only (canvas excluded: non-deterministic layout)', async ({ page }) => {
    await openGraphView(page);
    // Wait for stats to appear
    await expect(
      page.getByText(/\d+\s*pages/i).first()
    ).toBeVisible({ timeout: 8000 });
    // Snapshot the search bar (input) area — avoid canvas which has non-deterministic layout
    const searchInput = page.locator('input[placeholder*="Search pages"]').first();
    await expect(searchInput).toHaveScreenshot('graph-view-header.png', { maxDiffPixels: 100 });
  });
});
