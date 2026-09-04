import {
  COMPLETION_SCHEMA,
  parseStructured,
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResult,
  type ProviderConfig,
} from './provider';

export interface OpenAICompatOptions {
  id: string;
  endpoint: string;
  defaultModel: string;
  fastModel: string;
  /** Map provider-specific error bodies into a message. */
  errorMessage?: (body: string) => string;
}

/**
 * NVIDIA NIM, Groq, and OpenRouter all speak the OpenAI chat-completions
 * protocol with JSON mode; one implementation covers all three.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly defaultModel: string;
  readonly fastModel: string;
  private readonly endpoint: string;

  constructor(opts: OpenAICompatOptions) {
    this.id = opts.id;
    this.defaultModel = opts.defaultModel;
    this.fastModel = opts.fastModel;
    this.endpoint = opts.endpoint;
  }

  isConfigured(config: ProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async complete(req: CompletionRequest, config: ProviderConfig, model: string): Promise<CompletionResult> {
    if (!config.apiKey) throw new ProviderError(`Missing ${this.id} API key`, this.id);
    const res = await fetch(this.endpoint, {
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
    return { ...parseStructured(raw), provider: this.id, model };
  }
}

export const NvidiaProvider = new OpenAICompatibleProvider({
  id: 'nvidia',
  endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
  defaultModel: 'meta/llama-3.1-70b-instruct',
  fastModel: 'meta/llama-3.1-8b-instruct',
});

export const GroqProvider = new OpenAICompatibleProvider({
  id: 'groq',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  defaultModel: 'llama-3.3-70b-versatile',
  fastModel: 'llama-3.1-8b-instant',
});

export const OpenRouterProvider = new OpenAICompatibleProvider({
  id: 'openrouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  defaultModel: 'openai/gpt-4o-mini',
  fastModel: 'google/gemini-2.0-flash-exp:free',
});
