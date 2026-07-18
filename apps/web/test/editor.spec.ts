import { test, expect, request as playwrightRequest } from '@playwright/test';

// These are populated in beforeAll after the page is created
let testSlug = '';
const testTitle = 'Editor E2e Test Page';

test.describe('Wiki Editor', () => {
  test.beforeAll(async ({ baseURL }) => {
    // Use /api/wiki/file which creates both .md AND .meta.json so the article
    // appears in the KnowledgeList. The PUT-only endpoint skips meta creation.
    const api = await playwrightRequest.newContext({ baseURL });
    const res = await api.post('/api/wiki/file', {
      data: {
        title: testTitle,
        content: 'This is the original content for the editor test.\n\nSee also [[another-page]] for details.',
      },
    });
    const json = await res.json() as { ok: boolean; path?: string; title?: string };
    // Derive slug from returned path (e.g. "wiki/notes/editor-e2e-test-page.md")
    if (json.path) {
      testSlug = json.path.replace('wiki/notes/', '').replace('.md', '');
    }
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // Helper: open article by clicking its title in the KnowledgeList.
  // The article was just created so it should be at the top of the list.
  async function openArticleInList(page: import('@playwright/test').Page) {
    // KnowledgeListItem renders title as text in a button
    const item = page.getByText(testTitle).first();
    await expect(item).toBeVisible({ timeout: 5000 });
    await item.click();
    // Wait for ArticleView to appear (shows Edit button once loaded)
    await expect(page.getByRole('button', { name: /^edit$/i }).first()).toBeVisible({ timeout: 6000 });
  }

  test('CodeMirror editor visible after clicking Edit', async ({ page }) => {
    await openArticleInList(page);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });
  });

  test('slash command menu appears when typing /', async ({ page }) => {
    await openArticleInList(page);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });

    const editor = page.locator('.cm-content');
    await editor.click();
    // Go to end of document, then create a new empty line to type on
    await page.keyboard.press('Meta+End');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.waitForTimeout(200); // wait for React state update + render

    // SlashMenu renders as a fixed z-50 overlay div containing slash command buttons
    // It renders items like "Heading 1", "Heading 2", "Bullet list" etc.
    await expect(
      page.locator('.fixed.z-50, [class*="slash"], .cm-tooltip').first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('wikilink autocomplete appears when typing [[', async ({ page }) => {
    await openArticleInList(page);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Meta+End');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    // wikilinkCompletions returns null for bare "[[" without ctx.explicit.
    // Type at least one char after [[ so the filter runs, or use Ctrl+Space.
    await page.keyboard.type('[[e');
    await page.waitForTimeout(200);

    await expect(
      page.locator('.cm-tooltip-autocomplete, .cm-tooltip').first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('Cmd+S save triggers and shows saved indicator', async ({ page }) => {
    await openArticleInList(page);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Added by E2E test.');

    // Cmd+S triggers doSave() and sets savedAt — displays "Saved X ago" text
    await page.keyboard.press('Meta+s');
    await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('saved content is reflected in API response', async ({ page, request }) => {
    const uniqueText = `E2E-${Date.now()}`;
    await openArticleInList(page);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Meta+a');
    await page.keyboard.type(`# ${testTitle}\n\n${uniqueText}`);
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(1500);

    // Verify via API that new content was persisted
    const res = await request.get(`/api/wiki/notes/${testSlug}.md`);
    const text = await res.text();
    expect(text).toContain(uniqueText);
  });

  test('editor snapshot with content', async ({ page }) => {
    await openArticleInList(page);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    // Editor snapshot: allow small pixel variance from cursor/caret position between runs
    await expect(page).toHaveScreenshot('editor-with-content.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
});
