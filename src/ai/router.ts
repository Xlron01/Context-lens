import type { ContextPackage } from '../core/context-engine/resolver';
import { GeminiProvider } from './gemini';
import { GroqProvider, NvidiaProvider, OpenRouterProvider } from './openai-compatible';
import { buildPrompt } from './prompts';
import { TASKS, type AiMode, type CaptionStyle, type TaskId } from './tasks';
import { ProviderError, type AIProvider, type CompletionResult, type ProviderConfig } from './provider';

export interface Settings {
  /** Ordered provider preference; falls through on failure. */
  providerOrder: string[];
  keys: Record<string, ProviderConfig>;
  redactAuthors: boolean;
  aiMode: AiMode;
  captionStyle: CaptionStyle;
  /** Free-text description of the user's writing style for captions. */
  styleProfile: string;
  behavior: { includeParent: boolean; includeReplies: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  providerOrder: ['gemini', 'groq', 'nvidia', 'openrouter'],
  keys: {},
  redactAuthors: false,
  aiMode: 'auto',
  captionStyle: 'reaction',
  styleProfile: '',
  behavior: { includeParent: true, includeReplies: true },
};

const registry: Record<string, AIProvider> = {
  gemini: new GeminiProvider(),
  groq: GroqProvider,
  nvidia: NvidiaProvider,
  openrouter: OpenRouterProvider,
};

export interface ProgressEvent {
  kind: 'ask' | 'provider-failed' | 'fallback' | 'done';
  provider?: string;
  detail?: string;
}

function pickModel(task: TaskId, provider: AIProvider, mode: AiMode): string {
  if (mode === 'fast') return provider.fastModel;
  if (mode === 'deep') return provider.defaultModel;
  // Auto: heavier reasoning tasks get the stronger model.
  return task === 'thread' || task === 'argument' || task === 'discussion'
    ? provider.defaultModel
    : provider.fastModel;
}

/** Route a task on a context package through the provider fallback chain. */
export async function runTask(
  task: TaskId,
  pkg: ContextPackage,
  settings: Settings,
  onProgress?: (ev: ProgressEvent) => void,
  opts: { style?: CaptionStyle; variation?: number } = {},
): Promise<CompletionResult & { ms: number }> {
  const def = TASKS[task];
  const { system, user } = buildPrompt(task, pkg, {
    redactAuthors: settings.redactAuthors,
    style: opts.style ?? settings.captionStyle,
    styleProfile: settings.styleProfile,
    variation: opts.variation,
  });
  const errors: string[] = [];
  const started = Date.now();
  let attempted = 0;

  for (const id of settings.providerOrder) {
    const provider = registry[id];
    if (!provider) continue;
    const config = settings.keys[id];
    if (!provider.isConfigured(config ?? {})) continue;
    attempted++;
    const model = pickModel(task, provider, settings.aiMode);
    try {
      onProgress?.({ kind: 'ask', provider: id, detail: model });
      const result = await provider.complete({ system, user }, config!, model);
      onProgress?.({ kind: 'done', provider: id, detail: `${Date.now() - started} ms` });
      return { ...result, ms: Date.now() - started };
    } catch (err) {
      const msg = err instanceof ProviderError ? err.message : String(err);
      errors.push(`${id}: ${msg}`);
      onProgress?.({ kind: 'provider-failed', provider: id, detail: summarizeError(msg) });
      const next = nextConfigured(id, settings);
      if (next) onProgress?.({ kind: 'fallback', provider: next });
    }
  }

  throw new Error(
    attempted === 0
      ? 'No provider configured. Open Settings and add an API key (Gemini free tier is the easiest).'
      : `All providers failed.\n${errors.join('\n')}`,
  );
}

function nextConfigured(currentId: string, settings: Settings): string | undefined {
  const idx = settings.providerOrder.indexOf(currentId);
  for (const id of settings.providerOrder.slice(idx + 1)) {
    const p = registry[id];
    if (p && p.isConfigured(settings.keys[id] ?? {})) return id;
  }
  return undefined;
}

/** First line of an API error, for the UI pipeline display. */
export function summarizeError(msg: string): string {
  const statusMatch = msg.match(/error (\d{3})/);
  const status = statusMatch ? statusMatch[1] : undefined;
  if (status === '429') return 'Rate limit reached';
  if (status === '401' || status === '403') return 'Invalid API key';
  if (status === '404') return 'Model unavailable';
  if (status === '5xx' || /^5\d\d$/.test(status ?? '')) return 'Provider server error';
  return msg.length > 90 ? `${msg.slice(0, 90)}…` : msg;
}

/** Quick ping to measure provider health for the Settings view. */
export async function testProvider(id: string, settings: Settings): Promise<{ ok: boolean; ms: number; error?: string }> {
  const provider = registry[id];
  const config = settings.keys[id];
  if (!provider || !provider.isConfigured(config ?? {})) return { ok: false, ms: 0, error: 'Not configured' };
  const start = Date.now();
  try {
    await provider.complete(
      { system: 'Reply with the single word: ok', user: 'ping', maxTokens: 512 },
      config!,
      provider.fastModel,
    );
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: summarizeError(String(err instanceof Error ? err.message : err)) };
  }
}

export function providerIds(): string[] {
  return Object.keys(registry);
}
