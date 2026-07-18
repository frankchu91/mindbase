/**
 * Playwright global setup: pre-configure the server so `isConfigured()` returns
 * true in the web client, preventing the onboarding modal from blocking tests.
 *
 * With MOCK_LLM=1, the server accepts any config — we just need a non-empty
 * model + baseUrl so the frontend considers the provider configured.
 */
import { request } from '@playwright/test';

export default async function globalSetup() {
  const api = await request.newContext({ baseURL: process.env.MINDBASE_TEST_BASE_URL ?? 'http://localhost:4322' });

  // Patch config to mark as "configured" so the onboarding modal doesn't appear.
  // With MOCK_LLM=1, the LLM adapter ignores these values; they only affect the
  // frontend's isConfigured() check (model && (apiKey || baseUrl)).
  await api.put('/api/config', {
    data: {
      provider: 'ollama',
      model: 'llama3',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      autoSave: true,
      mergeSaves: false,
    },
  });

  await api.dispose();
}
