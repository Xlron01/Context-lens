import {
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResponse,
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

  async complete(req: CompletionRequest, config: ProviderConfig, model: string): Promise<CompletionResponse> {
    if (!config.apiKey) throw new ProviderError('Missing Gemini API key', this.id);
    const base = (config.baseUrl?.trim() || BASE).replace(/\/+$/, '');
    const res = await fetch(
      `${base}/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
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
    return { raw, provider: this.id, model };
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const base = (config.baseUrl?.trim() || BASE).replace(/\/+$/, '');
    const keyParam = config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : '';
    const res = await fetch(`${base}/models${keyParam}`);
    if (!res.ok) {
      throw new ProviderError(`Gemini models error ${res.status}: ${await res.text()}`, this.id, res.status);
    }
    const data = await res.json();
    return ((data?.models ?? []) as { name?: string }[])
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort();
  }
}
