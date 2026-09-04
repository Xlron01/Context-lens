import {
  COMPLETION_SCHEMA,
  parseStructured,
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResult,
  type ProviderConfig,
} from './provider';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly defaultModel = 'gemini-2.0-flash';
  readonly fastModel = 'gemini-2.0-flash-lite';

  isConfigured(config: ProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async complete(req: CompletionRequest, config: ProviderConfig, model: string): Promise<CompletionResult> {
    if (!config.apiKey) throw new ProviderError('Missing Gemini API key', this.id);
    const res = await fetch(
      `${BASE}/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 2048,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!res.ok) {
      throw new ProviderError(`Gemini API error ${res.status}: ${await res.text()}`, this.id, res.status);
    }
    const data = await res.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    if (!raw) throw new ProviderError('Empty Gemini response', this.id);
    return { ...parseStructured(raw), provider: this.id, model };
  }
}
