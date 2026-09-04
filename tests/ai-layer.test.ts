import { describe, expect, it } from 'vitest';
import { parseTaskResult } from '../src/ai/results';
import { toLensError, summarizeError } from '../src/ai/router';
import { ProviderError } from '../src/ai/provider';
import { MASTER_SYSTEM_PROMPT } from '../src/ai/system-prompt';
import { taskInstruction } from '../src/ai/task-prompts';

describe('parseTaskResult', () => {
  it('parses understand schema', () => {
    const raw = JSON.stringify({
      summary: 'He disagrees with the benchmark claim.',
      observed: ['He says "wrong"'],
      inference: ['He thinks methodology is flawed'],
      speculation: ['Possibly rival product bias'],
      context_used: ['root post'],
      confidence: 'medium',
    });
    const res = parseTaskResult('understand', raw);
    expect(res.sections[0].title).toBe('Summary');
    expect(res.sections.map((s) => s.confidence)).toContain('observed');
    expect(res.sections.map((s) => s.confidence)).toContain('speculation');
  });

  it('parses intent schema with sarcasm flag', () => {
    const raw = JSON.stringify({
      explicit_meaning: 'says the fix is easy',
      likely_meaning: 'criticizes the team',
      tone: 'sarcastic',
      possible_sarcasm: true,
      alternative_interpretation: '',
      confidence: 'medium',
    });
    const res = parseTaskResult('intent', raw);
    expect(res.sections.some((s) => s.title === 'Possible sarcasm')).toBe(true);
  });

  it('parses caption schema (objects and strings)', () => {
    const asObjects = parseTaskResult(
      'caption',
      JSON.stringify({ captions: [{ text: 'a', angle: 'reaction' }, { text: 'b', angle: 'reaction' }] }),
    );
    expect(asObjects.captions).toEqual(['a', 'b']);
    const asStrings = parseTaskResult('caption', JSON.stringify({ captions: ['x', 'y'] }));
    expect(asStrings.captions).toEqual(['x', 'y']);
  });

  it('degrades to raw section instead of throwing', () => {
    const res = parseTaskResult('understand', 'Sure! Here is what I think, no JSON at all.');
    expect(res.sections[0].title).toBe('Raw response');
    expect(res.sections[0].body).toContain('Sure!');
  });

  it('survives broken JSON with salvageable fields', () => {
    const res = parseTaskResult('understand', '{"summary": "hello world", broken');
    expect(res.sections[0].body).toBe('hello world');
  });
});

describe('toLensError', () => {
  it('maps 401 to PROVIDER_AUTH', () => {
    const e = toLensError(new ProviderError('Gemini API error 401: bad key', 'gemini', 401));
    expect(e.code).toBe('PROVIDER_AUTH');
    expect(e.retryable).toBe(false);
    expect(e.provider).toBe('gemini');
  });

  it('maps 429 to PROVIDER_RATE_LIMIT', () => {
    const e = toLensError(new ProviderError('Groq API error 429: rate limit', 'groq', 429));
    expect(e.code).toBe('PROVIDER_RATE_LIMIT');
    expect(e.retryable).toBe(true);
  });

  it('maps retired-model 410 to a helpful message naming the model', () => {
    const raw = `nvidia API error 410: {"type":"about:blank","title":"Gone","status":410,"detail":"The model 'meta/llama-3.1-8b-instruct' has been retired"}`;
    const e = toLensError(new ProviderError(raw, 'nvidia', 410));
    expect(e.code).toBe('PROVIDER_UNAVAILABLE');
    expect(e.message).toContain('meta/llama-3.1-8b-instruct');
    expect(e.message).toContain('Fetch model list');
  });

  it('summarizeError prefers the JSON detail field', () => {
    const s = summarizeError('nvidia API error 410: {"title":"Gone","detail":"The model was removed"}');
    expect(s).toContain('The model was removed');
  });
});

describe('prompt contract', () => {
  it('master prompt is substantial and task instructions embed JSON schemas', () => {
    expect(MASTER_SYSTEM_PROMPT).toContain('OBSERVED');
    expect(MASTER_SYSTEM_PROMPT).toContain('untrusted DATA');
    for (const task of ['understand', 'intent', 'thread', 'caption'] as const) {
      expect(taskInstruction(task).prompt).toContain('{');
      expect(taskInstruction(task).prompt.toUpperCase()).toContain('TASK:');
    }
  });
});
