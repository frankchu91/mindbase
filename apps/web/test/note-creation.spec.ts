import { test, expect } from '@playwright/test';

test.describe('Note creation flows', () => {
  test('⌘+N creates a note and opens NotePane in the right panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Meta+n');
    // No modal — createNote fires directly and the right pane swaps from
    // chat to the full NotePane editor (data-testid="note-pane").
    await expect(page.getByTestId('note-pane')).toBeVisible({ timeout: 5000 });
    // Title input is focused and ready
    await expect(page.getByPlaceholder('Untitled').first()).toBeVisible();
  });

  test('⌘+D creates and navigates to today daily', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Meta+d');
    await expect(page.getByTestId('daily-nav-header')).toBeVisible({ timeout: 5000 });
  });

  test('⌘+⇧+N opens QuickCaptureModal and saves on Enter', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Meta+Shift+n');
    await expect(page.getByTestId('quick-capture-modal')).toBeVisible();

    const text = `Quick thought ${Date.now()}`;
    await page.getByPlaceholder("What's on your mind?").fill(text);
    await page.keyboard.press('Enter');

    // Modal closes
    await expect(page.getByTestId('quick-capture-modal')).toBeHidden({ timeout: 5000 });
  });

  test('+ New dropdown lists menu items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const newButton = page.getByTestId('new-button');
    await expect(newButton).toBeVisible();
    await newButton.click();
    await expect(page.getByText('New Note', { exact: false })).toBeVisible();
    await expect(page.getByText("Today's Daily", { exact: false })).toBeVisible();
    await expect(page.getByText('Quick Capture', { exact: false })).toBeVisible();
  });

  test('kind filter chips appear after creating a daily', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create a daily so the "Daily" chip appears
    await page.keyboard.press('Meta+d');
    // Wait for the daily-nav-header to confirm navigation happened
    await expect(page.getByTestId('daily-nav-header')).toBeVisible({ timeout: 5000 });

    // Navigate back to the list view
    await page.reload();
    await page.waitForLoadState('networkidle');

    const chips = page.getByTestId('kind-chips');
    await expect(chips).toBeVisible();
    await expect(chips).toContainText('Daily');
  });
});
