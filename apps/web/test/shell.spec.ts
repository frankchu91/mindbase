import { test, expect } from '@playwright/test';

test.describe('Agent + Canvas shell', () => {
  test('renders three-pane layout on first open', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('dock')).toBeVisible();
    await expect(page.getByTestId('chat-pane')).toBeVisible();
    await expect(page.getByTestId('canvas')).toBeVisible();
    await expect(page.getByTestId('status-bar')).toBeVisible();
    await expect(page.getByTestId('canvas-toolbar')).toBeVisible();
    await expect(page.getByTestId('chat-input-shell')).toBeVisible();
  });

  test('theme toggle persists to localStorage', async ({ page }) => {
    await page.goto('/');
    const initial = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(initial === 'light' || initial === 'dark').toBeTruthy();

    await page.keyboard.press('Meta+Shift+L');
    const next = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(next).not.toBe(initial);

    const persisted = await page.evaluate(() => localStorage.getItem('mindbase.theme'));
    expect(persisted).toBe(next);

    // Reload — theme should restore.
    await page.reload();
    const restored = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(restored).toBe(next);
  });

  test('Meta+Backslash toggles focus mode, hiding dock and chat', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('dock')).toBeVisible();
    await expect(page.getByTestId('chat-pane')).toBeVisible();

    await page.keyboard.press('Meta+\\');
    await expect(page.getByTestId('dock')).toHaveCount(0);
    await expect(page.getByTestId('chat-pane')).toHaveCount(0);
    await expect(page.getByTestId('canvas')).toBeVisible();

    await page.keyboard.press('Meta+\\');
    await expect(page.getByTestId('dock')).toBeVisible();
    await expect(page.getByTestId('chat-pane')).toBeVisible();
  });

  test('dock items navigate canvas surfaces', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('dock-item-wiki').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Wiki');

    await page.getByTestId('dock-item-notes').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Notes');

    await page.getByTestId('dock-item-home').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Home');
  });

  test('canvas back/forward tracks history', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('dock-item-wiki').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Wiki');
    await page.getByTestId('dock-item-notes').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Notes');

    await page.getByTestId('canvas-back').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Wiki');

    await page.getByTestId('canvas-forward').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Notes');
  });

  test('pin button toggles pinned state and freezes navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('dock-item-wiki').click();
    const before = await page.getByTestId('canvas-breadcrumb').textContent();

    await page.getByTestId('canvas-pin').click();
    // Try to navigate — should not change while pinned.
    await page.getByTestId('dock-item-notes').click();
    const after = await page.getByTestId('canvas-breadcrumb').textContent();
    expect(after).toBe(before);

    // Unpin and try again.
    await page.getByTestId('canvas-pin').click();
    await page.getByTestId('dock-item-notes').click();
    await expect(page.getByTestId('canvas-breadcrumb')).toContainText('Notes');
  });

  test('chat pane shows empty state suggestions when no messages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('chat-empty-state')).toBeVisible();
    await expect(page.getByTestId('chat-empty-state')).toContainText('Ask about my wiki');
  });

  test('status bar renders model and version', async ({ page }) => {
    await page.goto('/');
    // Use expect().toContainText() so Playwright retries until the async settings
    // load completes (model starts as 'gpt-4o-mini', then updates to 'llama3'
    // after /api/config responds).
    await expect(page.getByTestId('status-bar')).toContainText('v0.4.2');
    // Model name comes from settings — under MOCK_LLM=1, the global-setup
    // sets provider=ollama / model=llama3.
    await expect(page.getByTestId('status-bar')).toContainText('llama3');
  });
});
