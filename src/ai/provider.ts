export interface ProviderConfig {
  apiKey: string;
  /** Override the API base URL (OpenAI-compatible: base without /chat/completions). */
  baseUrl?: string;
  /** Override the deep/default model id from the provider's catalog. */
  model?: string;
  /** Override the fast model id. */
  fastModel?: string;
}

/** Provider request: plain messages. Providers know nothing about tasks. */
export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

/** Provider response: raw model text only. Parsing happens in the task layer. */
export interface CompletionResponse {
  raw: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly id: string;
  readonly defaultModel: string;
  /** Cheap fast model used for light tasks. */
  readonly fastModel: string;
  isConfigured(config: ProviderConfig): boolean;
  complete(req: CompletionRequest, config: ProviderConfig, model: string): Promise<CompletionResponse>;
  /** Current model catalog from the provider, for the Settings picker. */
  listModels(config: ProviderConfig): Promise<string[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}
