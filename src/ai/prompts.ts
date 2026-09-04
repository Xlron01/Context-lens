import type { ContextPackage } from '../core/context-engine/resolver';

/** Render a context package as compact labeled blocks for the prompt. */
export function renderContext(pkg: ContextPackage, redactAuthors: boolean): string {
  const name = (author: string) => (redactAuthors ? '[redacted]' : `@${author}`);
  const lines: string[] = [
    `PLATFORM: ${pkg.platform}`,
    `PAGE_METADATA: ${pkg.pageTitle} (${pkg.pageUrl})`,
    '',
    `TARGET (${pkg.target.type} by ${name(pkg.target.author)}):`,
    pkg.target.text,
    pkg.target.attachments.length > 0
      ? `MEDIA: [${pkg.target.attachments.length} attachment(s): ${pkg.target.attachments
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

/** JSON view of a context package, for the debug panel. */
export function contextPackageJson(pkg: ContextPackage): string {
  return JSON.stringify(
    {
      platform: pkg.platform,
      page: { url: pkg.pageUrl, title: pkg.pageTitle },
      target: { type: pkg.target.type, id: pkg.target.id, author: pkg.target.author, text: pkg.target.text },
      context: pkg.items.map((i) => ({ relation: i.label, type: i.node.type, author: i.node.author, text: i.node.text })),
      media: pkg.target.attachments.map((a) => ({ type: a.kind, url: a.url, alt: a.altText ?? null })),
      budget: { truncated: pkg.truncated },
    },
    null,
    2,
  );
}
