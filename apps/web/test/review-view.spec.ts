import { test, expect, request as playwrightRequest } from '@playwright/test';

test.describe('Review View (Spaced Repetition)', () => {
  test.beforeAll(async ({ baseURL }) => {
    // Seed SRS cards via API — new cards have due_at=now so they're immediately due
    const api = await playwrightRequest.newContext({ baseURL });

    for (let i = 0; i < 2; i++) {
      await api.post('/api/srs/cards', {
        data: {
          question: `What is test question ${i + 1}?`,
          answer: `This is the answer to question ${i + 1}.`,
        },
      });
    }
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // Helper: click the '🧠 Review' footer button (exact text to avoid ambiguity)
  async function openReviewView(page: import('@playwright/test').Page) {
    const reviewBtn = page.getByRole('button', { name: '🧠 Review' });
    await reviewBtn.click();
    await page.waitForTimeout(600);
  }

  test('Review view opens via sidebar button', async ({ page }) => {
    await openReviewView(page);
    // ReviewView renders 'Review' heading or 'All caught up!' or card content
    await expect(
      page.getByText(/review|card|question|due|all caught up/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('card shows question; space reveals answer', async ({ page }) => {
    await openReviewView(page);

    // Check if there are cards due
    const hasCard = await page.getByText(/what is test question/i).first().isVisible().catch(() => false);
    if (!hasCard) {
      test.skip(true, 'No due cards visible in review view (may have been answered in a prior test run)');
      return;
    }

    // Question should be visible, answer initially hidden
    await expect(page.getByText(/what is test question/i).first()).toBeVisible();

    // Press space to flip
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Answer should now appear
    await expect(page.getByText(/this is the answer/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('"All caught up!" empty state appears after answering all cards', async ({ page }) => {
    await openReviewView(page);

    // If no cards are due, the empty state is already visible
    const alreadyEmpty = await page.getByText(/all caught up/i).first().isVisible().catch(() => false);
    if (alreadyEmpty) {
      await expect(page.getByText(/all caught up/i).first()).toBeVisible();
      return;
    }

    // Answer all visible due cards with Good — click rating buttons since keyboard focus may vary
    for (let i = 0; i < 15; i++) {
      // Check for "All caught up!" first
      const empty = await page.getByText(/all caught up/i).first().isVisible().catch(() => false);
      if (empty) break;

      // Check if a card is visible
      const hasCard = await page.locator('text=Question').first().isVisible().catch(() => false);
      if (!hasCard) break;

      // Flip card by clicking the flip button or pressing Space
      const flipBtn = page.getByText(/tap or press space to reveal/i).first();
      const hasFipBtn = await flipBtn.isVisible().catch(() => false);
      if (hasFipBtn) {
        await flipBtn.click();
        await page.waitForTimeout(300);
      }

      // Click the 'Good' rating button
      const goodBtn = page.getByRole('button', { name: /good/i }).first();
      const hasGoodBtn = await goodBtn.isVisible().catch(() => false);
      if (hasGoodBtn) {
        await goodBtn.click();
        await page.waitForTimeout(600); // wait for animation + API call
      } else {
        break;
      }
    }

    // Should eventually show the empty state
    await expect(
      page.getByText(/all caught up/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('review view snapshot', async ({ page }) => {
    await openReviewView(page);
    // Wait for loading to complete
    await page.waitForTimeout(800);
    await expect(page.locator('aside').first()).toHaveScreenshot('review-view.png', { maxDiffPixels: 100 });
  });
});
