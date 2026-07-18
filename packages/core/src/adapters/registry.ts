import type { ProviderName } from '../types';
import type { AdapterConfig, LLMAdapter } from './types';
import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { OllamaAdapter } from './ollama';

export function createAdapter(provider: ProviderName, config: AdapterConfig): LLMAdapter {
  switch (provider) {
    case 'openai':
    case 'deepseek':
      // DeepSeek is OpenAI-compatible; use OpenAIAdapter with a different baseUrl.
      return new OpenAIAdapter({
        ...config,
        baseUrl: config.baseUrl ?? (provider === 'deepseek' ? 'https://api.deepseek.com' : undefined),
      });
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'ollama':
      return new OllamaAdapter(config);
    case 'atlas':
      throw new Error('Atlas provider is not yet available (reserved for v1.1)');
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown provider: ${exhaustive as string}`);
    }
  }
}
