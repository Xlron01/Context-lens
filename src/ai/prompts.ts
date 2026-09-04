import type { ContextPackage } from '../core/context-engine/resolver';

export type TaskKind = 'explain' | 'thread';

const STYLE = `You are Context Lens, an assistant that explains online discussions in context.
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

export function threadPrompt(pkg: ContextPackage, redactAuthors = false): { system: string; user: string } {
  return {
    system: `${STYLE}\nTask: analyze the conversation structure around the TARGET: who is replying to whom, on which point, where disagreements or misunderstandings are.`,
    user: `${renderContext(pkg, redactAuthors)}\n\nAnalyze the thread: (1) the reply chain around the target, (2) the point being debated, (3) where agreement/disagreement lies, (4) if a misunderstanding exists, where it started.`,
  };
}
