import { test, expect } from '@playwright/test';

// Actual nav button labels in SettingsScreen.tsx NAV_ITEMS:
// 'Provider / LLM', 'Daily Brief', 'RSS Feeds', 'Spaced Repetition',
// 'AI Clients (MCP)', 'Obsidian Integration', 'Graph Export'
const SETTINGS_SECTIONS = [
  'Provider',
  'Daily Brief',
  'RSS',
  'Spaced Repetition',
  'AI Clients',
  'Obsidian',
  'Graph Export',
];

test.describe('Settings UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('clicking Settings switches to full-screen settings mode', async ({ page }) => {
    // Footer button text is '⚙️ Settings'
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    await settingsBtn.click();
    // SettingsScreen renders '← Done' button and 'Provider / LLM' nav item
    await expect(page.getByRole('button', { name: /done/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('settings screen has the 7 section nav buttons', async ({ page }) => {
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    await settingsBtn.click();
    await page.waitForTimeout(300);

    for (const section of SETTINGS_SECTIONS) {
      const btn = page.getByRole('button', { name: new RegExp(section, 'i') });
      await expect(btn.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('clicking each section shows corresponding content', async ({ page }) => {
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    await settingsBtn.click();
    await page.waitForTimeout(300);

    // Click Provider section and check content changes
    const providerBtn = page.getByRole('button', { name: /provider/i }).first();
    await providerBtn.click();
    // SetupWizard renders provider selection buttons (OpenAI, Anthropic, etc.)
    await expect(page.getByText(/openai|anthropic|ollama/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('clicking Done returns to list view', async ({ page }) => {
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    await settingsBtn.click();
    await page.waitForTimeout(300);

    // SettingsScreen has '← Done' button
    const doneBtn = page.getByRole('button', { name: /done/i }).first();
    await doneBtn.click();
    await page.waitForTimeout(300);

    // Should be back to list view — MindBase header is visible
    await expect(page.getByText('MindBase').first()).toBeVisible({ timeout: 3000 });
  });

  test('Settings full screen snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
    await settingsBtn.click();
    await page.waitForTimeout(500);
    // Snapshot of the provider section (default active section)
    await expect(page).toHaveScreenshot('settings-screen.png', { fullPage: true, maxDiffPixels: 100 });
  });
});
