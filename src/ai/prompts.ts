import type { ContextPackage } from '../core/context-engine/resolver';
import { CAPTION_STYLES, type CaptionStyle, type TaskId } from './tasks';

const STYLE = `You are Context Lens, an assistant that helps people understand online content in context.
Rules:
- Ground every statement in the provided context. Never invent details.
- Separate what is OBSERVED (explicitly written), INFERENCE (strongly implied), and SPECULATION (possible but uncertain). Label each section accordingly.
- Analyze arguments, not people. No personal insults.
- Reply in the same language as the target content unless the user's request is in another language.
- Be concise. 3-6 sections max.`;

/** Render a context package as compact labeled blocks for the prompt. */
export function renderContext(pkg: ContextPackage, redactAuthors: boolean): string {
  const name = (author: string) => (redactAuthors ? '[redacted]' : `@${author}`);
  const lines: string[] = [
    `Platform: ${pkg.platform}`,
    `Page: ${pkg.pageTitle} (${pkg.pageUrl})`,
    '',
    `TARGET (${pkg.target.type} by ${name(pkg.target.author)}):`,
    pkg.target.text,
    pkg.target.attachments.length > 0
      ? `[${pkg.target.attachments.length} attachment(s): ${pkg.target.attachments
          .map((a) => `${a.kind}${a.altText ? ` "${a.altText}"` : ''}`)
          .join(', ')}]`
      : '',
    '',
    'CONTEXT:',
  ];
  if (pkg.items.length === 0) lines.push('(no additional context found — the target stands alone)');
  for (const item of pkg.items) {
    lines.push(`--- ${item.label} (${item.node.type} by ${name(item.node.author)}) ---`);
    lines.push(item.node.text);
  }
  if (pkg.truncated) lines.push('(context was truncated to fit budget)');
  return lines.filter((l) => l !== '').join('\n');
}

export function explainPrompt(pkg: ContextPackage, redactAuthors = false): { system: string; user: string } {
  return {
    system: `${STYLE}\nTask: explain the TARGET so the user understands what it means and why it was written.`,
    user: `${renderContext(pkg, redactAuthors)}\n\nExplain the target: what it means in this context, what it responds to (if anything), tone, and any assumptions it makes. Mark speculation clearly.`,
  };
}

export function intentPrompt(pkg: ContextPackage, redactAuthors = false): { system: string; user: string } {
  return {
    system: `${STYLE}\nTask: analyze what the author of the TARGET means — intended meaning, tone, sarcasm, assumptions, and whether they are responding to a specific point. Never present a reading of their mind as certain.`,
    user: `${renderContext(pkg, redactAuthors)}\n\nAnalyze the target's meaning: (1) what they explicitly say, (2) what they likely mean (label as inference), (3) possible sarcasm or subtext (label as speculation), (4) what they assume the reader believes, (5) if it reads like a reply, to which point.`,
  };
}

export function threadPrompt(pkg: ContextPackage, redactAuthors = false): { system: string; user: string } {
  return {
    system: `${STYLE}\nTask: analyze the conversation structure around the TARGET: who is replying to whom, on which point, where disagreements or misunderstandings are.`,
    user: `${renderContext(pkg, redactAuthors)}\n\nAnalyze the thread: (1) the reply chain around the target, (2) the point being debated, (3) where agreement/disagreement lies, (4) if a misunderstanding exists, where it started.`,
  };
}

export function captionPrompt(
  pkg: ContextPackage,
  style: CaptionStyle,
  opts: { redactAuthors?: boolean; styleProfile?: string; variation?: number } = {},
): { system: string; user: string } {
  const def = CAPTION_STYLES.find((s) => s.id === style) ?? CAPTION_STYLES[0];
  const styleLine = opts.styleProfile?.trim()
    ? `\nMatch the user's own writing style: ${opts.styleProfile.trim()}`
    : '';
  const variationLine = opts.variation && opts.variation > 0
    ? `\nThis is attempt #${opts.variation + 1}. Use a different angle than previous attempts.`
    : '';
  return {
    system: `You write repost captions for social media. Understand the post first, then write captions that are accurate to it — never misrepresent what the post says. Return ONLY a JSON object: {"captions": ["...", "...", "..."]} with exactly 3 caption options.`,
    user: `${renderContext(pkg, opts.redactAuthors ?? false)}\n\nWrite 3 repost caption options for the target.\nStyle: ${def.label} — ${def.instruction}${styleLine}${variationLine}`,
  };
}

export function buildPrompt(
  task: TaskId,
  pkg: ContextPackage,
  opts: { redactAuthors?: boolean; style?: CaptionStyle; styleProfile?: string; variation?: number } = {},
): { system: string; user: string } {
  const redact = opts.redactAuthors ?? false;
  switch (task) {
    case 'understand':
      return explainPrompt(pkg, redact);
    case 'intent':
      return intentPrompt(pkg, redact);
    case 'thread':
      return threadPrompt(pkg, redact);
    case 'caption':
      return captionPrompt(pkg, opts.style ?? 'reaction', {
        redactAuthors: redact,
        styleProfile: opts.styleProfile,
        variation: opts.variation,
      });
    default:
      return explainPrompt(pkg, redact);
  }
}
