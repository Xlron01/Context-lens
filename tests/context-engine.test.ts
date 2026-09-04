import { describe, expect, it } from 'vitest';
import { ContextGraph } from '../src/core/context-engine/graph';
import { resolveContext } from '../src/core/context-engine/resolver';
import { budgetPackage, DEFAULT_TOKEN_BUDGET } from '../src/core/context-engine/budget';
import type { CanonicalNode } from '../src/core/canonical';

function node(id: string, parentId: string | null, text = `text of ${id}`, order = 0): CanonicalNode {
  return {
    id,
    type: parentId ? 'reply' : 'post',
    text,
    author: `user_${id}`,
    parentId,
    childrenIds: [],
    attachments: [],
    url: null,
    order,
  };
}

describe('ContextGraph', () => {
  it('builds children from parentId', () => {
    const graph = new ContextGraph([node('a', null), node('b', 'a'), node('c', 'b')]);
    expect(graph.replies('a').map((n) => n.id)).toEqual(['b']);
    expect(graph.replies('b').map((n) => n.id)).toEqual(['c']);
  });

  it('returns ancestor chain root→parent', () => {
    const graph = new ContextGraph([node('a', null), node('b', 'a'), node('c', 'b')]);
    expect(graph.ancestorChain('c').map((n) => n.id)).toEqual(['a', 'b']);
    expect(graph.rootOf('c')?.id).toBe('a');
  });

  it('survives cycles', () => {
    const x = node('x', 'y');
    const y = node('y', 'x');
    const graph = new ContextGraph([x, y]);
    // Must terminate; chain contains at most the other node.
    expect(graph.ancestorChain('x').map((n) => n.id)).toEqual(['y']);
  });
});

describe('resolver', () => {
  it('packages parent, root, replies, siblings', () => {
    const nodes = [
      node('post', null, 'root post text'),
      node('c1', 'post', 'first comment', 1),
      node('c2', 'post', 'second comment', 2),
      node('r1', 'c1', 'reply to c1 (target)', 3),
      node('r1b', 'c1', 'sibling reply to target', 4),
      node('r2', 'r1', 'reply to target', 5),
    ];
    const graph = new ContextGraph(nodes);
    const pkg = resolveContext(graph, 'r1', 'reddit', 'https://reddit.com/x', 'Test page')!;
    expect(pkg.target.id).toBe('r1');
    const labels = pkg.items.map((i) => i.label);
    expect(labels).toContain('Direct parent');
    expect(labels).toContain('Root post');
    expect(labels).toContain('Reply to target');
    expect(labels).toContain('Sibling reply');
  });
});

describe('budget', () => {
  it('drops items when over budget', () => {
    const target = node('t', null, 'x'.repeat(4000)); // ~1000 tokens
    const items = Array.from({ length: 50 }, (_, i) => ({
      label: `item${i}`,
      node: node(`n${i}`, 't', 'y'.repeat(4000), i),
    }));
    const { items: kept, truncated } = budgetPackage(target, items, 3000);
    expect(kept.length).toBeLessThan(items.length);
    expect(truncated).toBe(true);
  });

  it('keeps everything under budget', () => {
    const target = node('t', null, 'short');
    const items = [{ label: 'a', node: node('a', 't', 'also short') }];
    const { items: kept, truncated } = budgetPackage(target, items, DEFAULT_TOKEN_BUDGET);
    expect(kept).toHaveLength(1);
    expect(truncated).toBe(false);
  });
});
