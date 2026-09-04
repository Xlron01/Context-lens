/**
 * Task layer result parsing: model raw text → normalized UI result.
 * Never throws: unparsable output degrades to a raw-text section.
 */
import type { TaskId } from './tasks';

export interface UiSection {
  title: string;
  body: string;
  confidence: 'observed' | 'inference' | 'speculation';
}

export interface UiResult {
  headline: string;
  sections: UiSection[];
  captions?: string[];
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  const end = cleaned.lastIndexOf('}');
  const candidate = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return salvageFields(candidate);
  }
}

/** Regex-based field recovery for slightly broken JSON (truncated output etc). */
function salvageFields(text: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const stringField = /"([a-zA-Z_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = stringField.exec(text))) out[m[1]] = m[2];

  const arrayField = /"([a-zA-Z_]+)"\s*:\s*\[([^\]]*)\]/g;
  while ((m = arrayField.exec(text))) {
    const items = Array.from(m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)).map((x) => x[1]);
    if (items.length > 0) out[m[1]] = items;
  }

  if (text.includes('"possible_sarcasm"') && text.includes('true')) out.possible_sarcasm = true;
  return Object.keys(out).length > 0 ? out : null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(typeof x === 'object' && x !== null ? (x as { text?: unknown }).text ?? x : x)).filter((s) => s.trim()) : [];

/** Parse a task result according to its schema; falls back to raw display. */
export function parseTaskResult(task: TaskId, raw: string): UiResult {
  const parsed = extractJson(raw);

  if (parsed) {
    // Caption schema: { captions: [{text, angle}] | ["..."] }
    if (Array.isArray(parsed.captions)) {
      const captions = arr(parsed.captions);
      if (captions.length > 0) return { headline: 'Captions', sections: [], captions };
    }

    // Legacy/generic schema: { headline, sections }
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return {
        headline: str(parsed.headline) || 'Result',
        sections: parsed.sections.map((s) => normalizeSection(s as Record<string, unknown>)),
      };
    }

    switch (task) {
      case 'understand': {
        const sections: UiSection[] = [];
        const summary = str(parsed.summary);
        if (summary) sections.push({ title: 'Summary', body: summary, confidence: 'observed' });
        pushList(sections, 'Observed', parsed.observed, 'observed');
        pushList(sections, 'Likely meaning', parsed.inference, 'inference');
        pushList(sections, 'Speculation', parsed.speculation, 'speculation');
        if (sections.length > 0) return { headline: summary || 'Understanding', sections };
        break;
      }
      case 'intent': {
        const sections: UiSection[] = [];
        const explicit = str(parsed.explicit_meaning);
        const likely = str(parsed.likely_meaning);
        if (explicit) sections.push({ title: 'What they say', body: explicit, confidence: 'observed' });
        if (likely) sections.push({ title: 'What they likely mean', body: likely, confidence: 'inference' });
        const tone = str(parsed.tone);
        if (tone) sections.push({ title: 'Tone', body: tone, confidence: 'inference' });
        if (parsed.possible_sarcasm === true)
          sections.push({ title: 'Possible sarcasm', body: 'The wording may be sarcastic — read with care.', confidence: 'speculation' });
        const alt = str(parsed.alternative_interpretation);
        if (alt) sections.push({ title: 'Alternative reading', body: alt, confidence: 'speculation' });
        if (sections.length > 0) return { headline: likely || explicit || 'Intent', sections };
        break;
      }
      case 'thread': {
        const sections: UiSection[] = [];
        const chain = str(parsed.reply_chain);
        const debate = str(parsed.point_of_debate);
        if (chain) sections.push({ title: 'Reply chain', body: chain, confidence: 'observed' });
        if (debate) sections.push({ title: 'Point of debate', body: debate, confidence: 'inference' });
        const agreements = arr(parsed.agreements);
        const disagreements = arr(parsed.disagreements);
        if (agreements.length || disagreements.length)
          sections.push({
            title: 'Agreement / disagreement',
            body: `${agreements.length ? `Agree on: ${agreements.join('; ')}` : 'No clear agreement found.'}\n${
              disagreements.length ? `Disagree on: ${disagreements.join('; ')}` : 'No clear disagreement found.'
            }`,
            confidence: 'inference',
          });
        const mis = str(parsed.misunderstanding);
        if (mis) sections.push({ title: 'Where the misunderstanding starts', body: mis, confidence: 'speculation' });
        if (sections.length > 0) return { headline: 'Thread analysis', sections };
        break;
      }
      default:
        break;
    }
  }

  // Never die on unexpected output: show it as a raw section.
  if (parsed) {
    const firstVal = Object.values(parsed).find((v) => typeof v === 'string' && (v as string).trim());
    if (firstVal) {
      return { headline: 'Result', sections: [{ title: 'Response', body: str(firstVal).slice(0, 2000), confidence: 'inference' }] };
    }
  }
  return {
    headline: 'Result',
    sections: [{ title: 'Raw response', body: raw.slice(0, 2000), confidence: 'inference' }],
  };
}

function pushList(sections: UiSection[], title: string, value: unknown, confidence: UiSection['confidence']): void {
  const items = arr(value);
  if (items.length > 0) sections.push({ title, body: items.map((s) => `• ${s}`).join('\n'), confidence });
}

function normalizeSection(s: Record<string, unknown>): UiSection {
  const c = str(s.confidence);
  return {
    title: str(s.title) || 'Section',
    body: str(s.body),
    confidence: c === 'observed' || c === 'speculation' ? c : 'inference',
  };
}
