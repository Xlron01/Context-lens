import type { CanonicalNode } from '../canonical';
import type { ContextItem } from './resolver';

export const DEFAULT_TOKEN_BUDGET = 8000;

/** Rough token estimate: ~4 chars per token, English/Arabic mix. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function nodeTokens(n: CanonicalNode): number {
  return estimateTokens(n.text) + 20; // overhead for labels/author
}

/**
 * Greedy budgeting: the target always goes in full; context items are added
 * in priority order until the budget is exhausted. Long items get truncated
 * rather than dropped when they would just barely overflow.
 */
export function budgetPackage(
  target: CanonicalNode,
  items: ContextItem[],
  budget: number,
): { items: ContextItem[]; truncated: boolean } {
  let used = nodeTokens(target);
  const out: ContextItem[] = [];
  let truncated = false;

  for (const item of items) {
    const cost = nodeTokens(item.node);
    if (used + cost <= budget) {
      out.push(item);
      used += cost;
      continue;
    }
    const remaining = budget - used;
    if (remaining > 200) {
      // Include a truncated version of this item.
      const maxChars = remaining * 4 - 20;
      out.push({
        label: `${item.label} (truncated)`,
        node: { ...item.node, text: clip(item.node.text, maxChars) },
      });
      truncated = true;
    }
    truncated = true;
    break;
  }

  return { items: out, truncated };
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars))}…`;
}
