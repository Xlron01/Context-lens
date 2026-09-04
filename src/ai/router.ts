import type { ContextPackage } from '../core/context-engine/resolver';
import { GeminiProvider } from './gemini';
import { GroqProvider, NvidiaProvider, OpenRouterProvider } from './openai-compatible';
import { explainPrompt, threadPrompt, type TaskKind } from './prompts';
import { ProviderError, type AIProvider, type CompletionResult, type ProviderConfig } from './provider';

export interface Settings {
  /** Ordered provider preference; falls through on failure. */
  providerOrder: string[];
  keys: Record<string, ProviderConfig>;
  redactAuthors: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  providerOrder: ['gemini', 'groq', 'nvidia', 'openrouter'],
  keys: {},
  redactAuthors: false,
};

const registry: Record<string, AIProvider> = {
  gemini: new GeminiProvider(),
  groq: GroqProvider,
  nvidia: NvidiaProvider,
  openrouter: OpenRouterProvider,
};

/** Route a task on a context package through the provider fallback chain. */
export async function runTask(task: TaskKind, pkg: ContextPackage, settings: Settings): Promise<CompletionResult> {
  const { system, user } = task === 'explain' ? explainPrompt(pkg) : threadPrompt(pkg);
  const errors: string[] = [];

  for (const id of settings.providerOrder) {
    const provider = registry[id];
    if (!provider) continue;
    const config = settings.keys[id];
    if (!provider.isConfigured(config ?? {})) continue;
    try {
      return await provider.complete({ system, user }, config!, provider.fastModel);
    } catch (err) {
      const msg = err instanceof ProviderError ? err.message : String(err);
      errors.push(`${id}: ${msg}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `All providers failed.\n${errors.join('\n')}`
      : 'No provider configured. Add an API key in the extension popup.',
  );
}

export function availableProviders(): { id: string; defaultModel: string }[] {
  return Object.values(registry).map((p) => ({ id: p.id, defaultModel: p.defaultModel }));
}
