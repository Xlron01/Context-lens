import type { CanonicalNode } from '../canonical';
import { ContextGraph } from './graph';
import { budgetPackage, DEFAULT_TOKEN_BUDGET } from './budget';

/** What the LLM should see for a task on a target node. */
export interface ContextPackage {
  platform: string;
  pageUrl: string;
  pageTitle: string;
  target: CanonicalNode;
  /** Ordered context items with a reason label, already budgeted. */
  items: ContextItem[];
  truncated: boolean;
}

export interface ContextItem {
  label: string;
  node: CanonicalNode;
}

export interface ResolveOptions {
  tokenBudget?: number;
}

/**
 * Resolve the minimal-but-sufficient context for a target:
 *   L0 target → L1 parent + root post → L2 sibling branch → capped.
 * The output is token-budgeted by budget.ts.
 */
export function resolveContext(
  graph: ContextGraph,
  targetId: string,
  platform: string,
  pageUrl: string,
  pageTitle: string,
  opts: ResolveOptions = {},
): ContextPackage | null {
  const target = graph.get(targetId);
  if (!target) return null;

  const raw: ContextItem[] = [];

  // L1: direct parent and root post.
  const chain = graph.ancestorChain(targetId);
  const parent = chain[chain.length - 1];
  if (parent) raw.push({ label: 'Direct parent', node: parent });

  const root = graph.rootOf(targetId);
  if (root && root.id !== parent?.id && root.id !== targetId) {
    raw.push({ label: 'Root post', node: root });
  }
  // Intermediate ancestors between root and parent (short threads only).
  for (const a of chain.slice(0, -1)) {
    if (a.id !== root?.id) raw.push({ label: 'Ancestor', node: a });
  }

  // L2: replies to the target and conversation around the parent.
  for (const r of graph.replies(targetId).slice(0, 10)) {
    raw.push({ label: 'Reply to target', node: r });
  }
  if (parent) {
    for (const s of graph.siblings(targetId).slice(0, 5)) {
      raw.push({ label: 'Sibling reply', node: s });
    }
  }

  const { items, truncated } = budgetPackage(target, raw, opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET);

  return { platform, pageUrl, pageTitle, target, items, truncated };
}
