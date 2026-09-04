import type { CanonicalNode } from '../canonical';

/** Indexed thread graph built from canonical nodes. */
export class ContextGraph {
  readonly nodes: Map<string, CanonicalNode>;
  private readonly roots: CanonicalNode[];

  constructor(nodes: CanonicalNode[]) {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    // Backfill children lists from parentId (adapters may set either side).
    for (const n of nodes) {
      if (n.parentId && this.nodes.has(n.parentId)) {
        const parent = this.nodes.get(n.parentId)!;
        if (!parent.childrenIds.includes(n.id)) parent.childrenIds.push(n.id);
      }
    }
    this.roots = nodes.filter((n) => !n.parentId || !this.nodes.has(n.parentId));
  }

  get(id: string): CanonicalNode | undefined {
    return this.nodes.get(id);
  }

  /** Chain from root to the target, exclusive of target. */
  ancestorChain(id: string): CanonicalNode[] {
    const chain: CanonicalNode[] = [];
    let cur = this.get(id);
    const guard = new Set<string>([id]);
    while (cur?.parentId && !guard.has(cur.parentId)) {
      const parent = this.get(cur.parentId);
      if (!parent) break;
      chain.unshift(parent);
      guard.add(parent.id);
      cur = parent;
    }
    return chain;
  }

  rootOf(id: string): CanonicalNode | undefined {
    const chain = this.ancestorChain(id);
    return chain.length > 0 ? chain[0] : this.get(id);
  }

  /** Direct children of target, ordered. */
  replies(id: string): CanonicalNode[] {
    const node = this.get(id);
    if (!node) return [];
    return node.childrenIds
      .map((cid) => this.get(cid))
      .filter((n): n is CanonicalNode => Boolean(n))
      .sort((a, b) => a.order - b.order);
  }

  /** Siblings of target (other replies to the same parent). */
  siblings(id: string): CanonicalNode[] {
    const node = this.get(id);
    if (!node?.parentId) return [];
    return this.replies(node.parentId).filter((n) => n.id !== id);
  }
}
