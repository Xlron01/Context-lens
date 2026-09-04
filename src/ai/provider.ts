export interface ProviderConfig {
  apiKey: string;
  model?: string;
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
