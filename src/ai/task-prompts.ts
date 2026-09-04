/** Task-specific prompt instructions with strict JSON schemas. */
import { CAPTION_STYLES, type CaptionStyle, type TaskId } from './tasks';

export interface TaskInstruction {
  id: string;
  prompt: string;
}

export function taskInstruction(task: TaskId, opts: { style?: CaptionStyle; styleProfile?: string; variation?: number } = {}): TaskInstruction {
  switch (task) {
    case 'understand':
      return {
        id: 'UNDERSTAND',
        prompt: `TASK: UNDERSTAND

Explain the target in plain language, in its context.

Return exactly this JSON:
{
  "summary": "one-paragraph plain explanation",
  "observed": ["what is explicitly written"],
  "inference": ["what it strongly implies"],
  "speculation": ["possible but uncertain readings"],
  "context_used": ["which context items mattered"],
  "confidence": "high|medium|low"
}`,
      };
    case 'intent':
      return {
        id: 'INTENT',
        prompt: `TASK: INTENT

Explain the most likely meaning of the target in context.

Focus on: what the person is responding to, what position they appear to take,
implied meaning, tone, possible sarcasm.

Do not claim certainty about private intent.

Return exactly this JSON:
{
  "explicit_meaning": "what they literally say",
  "likely_meaning": "the most probable intended meaning",
  "tone": "tone in one or two words",
  "possible_sarcasm": true|false,
  "alternative_interpretation": "a rival reading, or empty string",
  "confidence": "high|medium|low"
}`,
      };
    case 'thread':
      return {
        id: 'THREAD_ANALYSIS',
        prompt: `TASK: THREAD_ANALYSIS

Analyze the conversation structure around the target.

Return exactly this JSON:
{
  "reply_chain": "who is replying to whom, in order",
  "point_of_debate": "the specific point being contested, or empty string",
  "agreements": ["where participants actually agree"],
  "disagreements": ["the real disagreements"],
  "misunderstanding": "where a misunderstanding started, or empty string",
  "confidence": "high|medium|low"
}

Do not assume two users disagree simply because their wording differs.`,
      };
    case 'caption': {
      const def = CAPTION_STYLES.find((s) => s.id === (opts.style ?? 'reaction')) ?? CAPTION_STYLES[0];
      const styleLine = opts.styleProfile?.trim()
        ? `\nUSER_STYLE (match this voice): ${opts.styleProfile.trim()}`
        : '';
      const variationLine =
        opts.variation && opts.variation > 0
          ? `\nThis is attempt #${opts.variation + 1}: use clearly different angles than previous attempts.`
          : '';
      return {
        id: 'REPOST_CAPTION',
        prompt: `TASK: REPOST_CAPTION

Understand the source post first, then generate 3 distinct repost captions.

Style: ${def.label} — ${def.instruction}

Requirements:
- Do not invent facts.
- Do not simply repeat the original post.
- Each caption must sound like something the user could naturally post.
- Add a perspective, reaction, observation, or question when appropriate.${styleLine}${variationLine}

Return exactly this JSON:
{
  "captions": [
    { "text": "...", "angle": "${def.id}" },
    { "text": "...", "angle": "${def.id}" },
    { "text": "...", "angle": "${def.id}" }
  ]
}`,
      };
    }
    default:
      return taskInstruction('understand');
  }
}
