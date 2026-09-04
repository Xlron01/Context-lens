export interface ProviderConfig {
  apiKey: string;
  model?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export const COMPLETION_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          confidence: { type: 'string', enum: ['observed', 'inference', 'speculation'] },
        },
        required: ['title', 'body', 'confidence'],
      },
    },
  },
  required: ['headline', 'sections'],
} as const;

export interface CompletionResult {
  headline: string;
  sections: { title: string; body: string; confidence: 'observed' | 'inference' | 'speculation' }[];
  /** Present for caption tasks. */
  captions?: string[];
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly id: string;
  readonly defaultModel: string;
  /** Cheap fast model used for Explain/Thread tasks. */
  readonly fastModel: string;
  isConfigured(config: ProviderConfig): boolean;
  complete(req: CompletionRequest, config: ProviderConfig, model: string): Promise<CompletionResult>;
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

/** Parse structured JSON out of an LLM response, tolerating code fences. */
export function parseStructured(raw: string): {
  headline: string;
  sections: { title: string; body: string; confidence: 'observed' | 'inference' | 'speculation' }[];
  captions?: string[];
} {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const json = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(json);
  const result: ReturnType<typeof parseStructured> = {
    headline: String(parsed.headline ?? ''),
    sections: Array.isArray(parsed.sections)
      ? parsed.sections.map((s: Record<string, unknown>) => ({
          title: String(s.title ?? ''),
          body: String(s.body ?? ''),
          confidence:
            s.confidence === 'observed' || s.confidence === 'inference' || s.confidence === 'speculation'
              ? s.confidence
              : 'inference',
        }))
      : [],
  };
  if (Array.isArray(parsed.captions)) {
    result.captions = parsed.captions.map((c: unknown) => String(c)).filter((c: string) => c.trim());
  }
  return result;
}
