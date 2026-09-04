import type { CanonicalNode, PlatformAdapter } from '../../core/canonical';

/**
 * Heuristic fallback adapter for unsupported platforms (Facebook etc.).
 *
 * Facebook's DOM is obfuscated and unstable, so we do the simplest useful
 * thing: collect the largest text blocks near the click target and guess
 * parentage by DOM proximity. Quality is lower but Explain still works.
 */
export class GenericAdapter implements PlatformAdapter {
  readonly platform = 'generic';

  matches(_url: string): boolean {
    return true;
  }

  collect(root: Element): CanonicalNode[] {
    const blocks = this.textBlocks(root);
    return blocks.map((b, i) => ({
      id: b.el.getAttribute('data-context-lens-id') ?? `gen_${i}`,
      type: i === 0 ? 'post' : 'comment',
      text: b.text,
      author: 'unknown',
      parentId: i === 0 ? null : 'gen_0',
      childrenIds: [],
      attachments: [],
      url: null,
      order: i,
    }));
  }

  resolveTarget(el: Element): string | null {
    const block = el.closest('[data-context-lens-id]');
    return block?.getAttribute('data-context-lens-id') ?? null;
  }

  /** Tag candidate blocks with ids as a side effect so resolveTarget works. */
  tagBlocks(root: Element): void {
    this.textBlocks(root).forEach((b, i) => {
      if (!b.el.getAttribute('data-context-lens-id')) {
        b.el.setAttribute('data-context-lens-id', `gen_${i}`);
      }
    });
  }

  private textBlocks(root: Element): { el: Element; text: string }[] {
    const out: { el: Element; text: string }[] = [];
    // SHOW_TEXT = 4 (numeric literal: NodeFilter global is absent in tests).
    const walker = (root.ownerDocument ?? root).createTreeWalker(root, 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').trim();
      if (text.length < 20) continue;
      const parent = (node as Text).parentElement;
      if (!parent) continue;
      // Skip if an ancestor already captured (avoid duplicates).
      if (out.some((o) => o.el.contains(parent))) continue;
      if (out.some((o) => parent.contains(o.el))) {
        // Replace the shorter nested one.
        const idx = out.findIndex((o) => parent.contains(o.el));
        out[idx] = { el: parent, text: (parent.textContent ?? '').trim() };
      } else {
        out.push({ el: parent, text });
      }
      if (out.length >= 200) break;
    }
    return out.filter((o) => o.text.length >= 20);
  }
}
