import type { ContextPackage } from '../core/context-engine/resolver';
import { renderContext } from './prompts';
import { taskInstruction } from './task-prompts';
import { MASTER_SYSTEM_PROMPT } from './system-prompt';
import { parseTaskResult, type UiResult } from './results';
import { TASKS, type AiMode, type CaptionStyle, type TaskId } from './tasks';
import { ProviderError, type AIProvider, type ProviderConfig } from './provider';
import type { LensError } from '../shared/messages';
import { GeminiProvider } from './gemini';
import { GroqProvider, NvidiaProvider, OpenRouterProvider } from './openai-compatible';

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

export interface TaskRunResult extends UiResult {
  provider: string;
  model: string;
  ms: number;
}

export function toLensError(err: unknown): LensError {
  if (err instanceof ProviderError) {
    let code: LensError['code'] = 'PROVIDER_FAILED';
    if (err.status === 401 || err.status === 403) code = 'PROVIDER_AUTH';
    else if (err.status === 429) code = 'PROVIDER_RATE_LIMIT';
    else if ((err.status ?? 0) >= 500 || err.status === 404) code = 'PROVIDER_UNAVAILABLE';
    return {
      code,
      message: summarizeError(err.message),
      provider: err.providerId,
      retryable: code !== 'PROVIDER_AUTH',
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('No provider configured')) return { code: 'NO_PROVIDER', message: msg, retryable: false };
  return { code: 'PROVIDER_FAILED', message: msg.slice(0, 200), retryable: true };
}

/** First line of an API error, for the UI pipeline display. */
export function summarizeError(msg: string): string {
  const statusMatch = msg.match(/error (\d{3})/);
  const status = statusMatch ? statusMatch[1] : undefined;
  if (status === '429') return 'Rate limit reached';
  if (status === '401' || status === '403') return 'Invalid API key';
  if (status === '404') return 'Model unavailable';
  if (status && /^5\d\d$/.test(status)) return 'Provider server error';
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}

function pickModel(task: TaskId, provider: AIProvider, mode: AiMode, config?: ProviderConfig): string {
  const deep = config?.model?.trim() || provider.defaultModel;
  const fast = config?.fastModel?.trim() || provider.fastModel;
  if (mode === 'fast') return fast;
  if (mode === 'deep') return deep;
  // Auto: heavier reasoning tasks get the stronger model.
  return task === 'thread' || task === 'argument' || task === 'discussion' ? deep : fast;
}

/**
 * Route a task on a context package through the provider fallback chain.
 * Pipeline: task instruction + master system prompt → provider (raw) → task-layer parser.
 */
export async function runTask(
  task: TaskId,
  pkg: ContextPackage,
  settings: Settings,
  onProgress?: (ev: ProgressEvent) => void,
  opts: { style?: CaptionStyle; variation?: number } = {},
): Promise<TaskRunResult> {
  const def = TASKS[task];
  const instruction = taskInstruction(task, {
    style: opts.style ?? settings.captionStyle,
    styleProfile: settings.styleProfile,
    variation: opts.variation,
  });
  const system = `${MASTER_SYSTEM_PROMPT}\n\n==================================================\n${instruction.prompt}`;
  const user = `${renderContext(pkg, settings.redactAuthors)}\n\n(Send back only the JSON object described in the TASK.)`;

  const errors: LensError[] = [];
  const started = Date.now();
  let attempted = 0;

  for (const id of settings.providerOrder) {
    const provider = registry[id];
    if (!provider) continue;
    const config = settings.keys[id];
    if (!provider.isConfigured(config ?? {})) continue;
    attempted++;
    const model = pickModel(task, provider, settings.aiMode, config);
    try {
      onProgress?.({ kind: 'ask', provider: id, detail: model });
      const res = await provider.complete({ system, user }, config!, model);
      onProgress?.({ kind: 'done', provider: id, detail: `${Date.now() - started} ms` });
      const parsed = parseTaskResult(task, res.raw);
      return { ...parsed, provider: res.provider, model: res.model, ms: Date.now() - started };
    } catch (err) {
      const lensErr = toLensError(err);
      errors.push(lensErr);
      onProgress?.({ kind: 'provider-failed', provider: id, detail: lensErr.message });
      const next = nextConfigured(id, settings);
      if (next) onProgress?.({ kind: 'fallback', provider: next });
    }
  }

  if (attempted === 0) {
    throw { code: 'NO_PROVIDER', message: 'No provider configured. Open Settings and add an API key (Gemini free tier is the easiest).', retryable: false } satisfies LensError;
  }
  throw errors[0] ?? { code: 'PROVIDER_FAILED', message: 'All providers failed.', retryable: true };
}

function nextConfigured(currentId: string, settings: Settings): string | undefined {
  const idx = settings.providerOrder.indexOf(currentId);
  for (const id of settings.providerOrder.slice(idx + 1)) {
    const p = registry[id];
    if (p && p.isConfigured(settings.keys[id] ?? {})) return id;
  }
  return undefined;
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
      pickModel('understand', provider, 'fast', config),
    );
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    const lensErr = toLensError(err);
    return { ok: false, ms: Date.now() - start, error: lensErr.message };
  }
}

export function providerIds(): string[] {
  return Object.keys(registry);
}

export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  fastModel: string;
  docsUrl: string;
}

/** UI-facing provider metadata (defaults shown in Settings, editable there). */
export const PROVIDER_INFO: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    fastModel: 'gemini-2.0-flash-lite',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    fastModel: 'llama-3.1-8b-instant',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    fastModel: 'meta/llama-3.1-8b-instruct',
    docsUrl: 'https://build.nvidia.com/explore',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    fastModel: 'google/gemini-2.0-flash-exp:free',
    docsUrl: 'https://openrouter.ai/models?max_price=0',
  },
];
