import {
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResponse,
  type ProviderConfig,
} from './provider';

export interface OpenAICompatOptions {
  id: string;
  /** Default API base URL (without /chat/completions). */
  baseUrl: string;
  defaultModel: string;
  fastModel: string;
  /** Where to get keys / model ids, shown in Settings. */
  docsUrl?: string;
}

/**
 * NVIDIA NIM, Groq, and OpenRouter all speak the OpenAI chat-completions
 * protocol with JSON mode; one implementation covers all three. Base URL,
 * model ids, and fast model ids are all overridable per config because
 * provider catalogs change frequently.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly defaultModel: string;
  readonly fastModel: string;
  readonly docsUrl?: string;
  private readonly defaultBaseUrl: string;

  constructor(opts: OpenAICompatOptions) {
    this.id = opts.id;
    this.defaultModel = opts.defaultModel;
    this.fastModel = opts.fastModel;
    this.docsUrl = opts.docsUrl;
    this.defaultBaseUrl = opts.baseUrl;
  }

  /** Effective endpoint for a config: base URL + /chat/completions. */
  endpointFor(config: ProviderConfig): string {
    const base = (config.baseUrl?.trim() || this.defaultBaseUrl).replace(/\/+$/, '');
    return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  }

  isConfigured(config: ProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async complete(req: CompletionRequest, config: ProviderConfig, model: string): Promise<CompletionResponse> {
    if (!config.apiKey) throw new ProviderError(`Missing ${this.id} API key`, this.id);
    const res = await fetch(this.endpointFor(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${req.system}\nRespond with a single JSON object.` },
          { role: 'user', content: req.user },
        ],
      }),
    });
    if (!res.ok) {
      throw new ProviderError(`${this.id} API error ${res.status}: ${await res.text()}`, this.id, res.status);
    }
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    if (!raw) throw new ProviderError(`Empty ${this.id} response`, this.id);
    return { raw, provider: this.id, model };
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const base = (config.baseUrl?.trim() || this.defaultBaseUrl).replace(/\/+$/, '');
    const root = base.endsWith('/chat/completions') ? base.replace(/\/chat\/completions$/, '') : base;
    const headers: Record<string, string> = {};
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const res = await fetch(`${root}/models`, { headers });
    if (!res.ok) {
      throw new ProviderError(`${this.id} models error ${res.status}: ${await res.text()}`, this.id, res.status);
    }
    const data = await res.json();
    return ((data?.data ?? []) as { id?: string }[])
      .map((m) => m.id ?? '')
      .filter(Boolean)
      .sort();
  }
}

export const NvidiaProvider = new OpenAICompatibleProvider({
  id: 'nvidia',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  // Verified against build.nvidia.com's live catalog (2026-09); users can
  // always override or re-fetch via "Fetch model list".
  defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b',
  fastModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  docsUrl: 'https://build.nvidia.com/explore',
});

export const GroqProvider = new OpenAICompatibleProvider({
  id: 'groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  defaultModel: 'llama-3.3-70b-versatile',
  fastModel: 'llama-3.1-8b-instant',
  docsUrl: 'https://console.groq.com/docs/models',
});

export const OpenRouterProvider = new OpenAICompatibleProvider({
  id: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  fastModel: 'nvidia/nemotron-3.5-lightning:free',
  docsUrl: 'https://openrouter.ai/models?max_price=0',
});
