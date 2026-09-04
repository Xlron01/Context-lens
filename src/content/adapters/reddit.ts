import type { CanonicalNode, PlatformAdapter } from '../../core/canonical';

/**
 * Reddit adapter. Supports both new Reddit (shreddit-* custom elements)
 * and old Reddit (classic .comment divs).
 */
export class RedditAdapter implements PlatformAdapter {
  readonly platform = 'reddit';

  matches(url: string): boolean {
    return /^https:\/\/(www\.|old\.)?reddit\.com\//.test(url);
  }

  collect(root: Element): CanonicalNode[] {
    const nodes: CanonicalNode[] = [];
    let order = 0;

    // Root post: new Reddit.
    const post = root.querySelector('shreddit-post');
    if (post) {
      const title = (post.getAttribute('post-title') ?? '').trim();
      const body = (root.querySelector('[slot="text-body"]')?.textContent ?? '').trim();
      const id = post.getAttribute('id') ?? `rd_post_${order}`;
      if (title || body) {
        nodes.push({
          id,
          type: 'post',
          text: [title, body].filter(Boolean).join('\n\n'),
          author: post.getAttribute('author') ?? 'unknown',
          parentId: null,
          childrenIds: [],
          attachments: this.postAttachments(root),
          url: post.getAttribute('permalink')
            ? `https://www.reddit.com${post.getAttribute('permalink')}`
            : null,
          order: order++,
        });
      }
    } else {
      // Old Reddit root post.
      const title = root.querySelector('a.title, p.title a')?.textContent?.trim() ?? '';
      const body = root.querySelector('.expando .usertext-body, .expando .md')?.textContent?.trim() ?? '';
      const author = root.querySelector('.tagline a.author')?.textContent?.trim() ?? 'unknown';
      if (title || body) {
        nodes.push({
          id: 'rd_post_0',
          type: 'post',
          text: [title, body].filter(Boolean).join('\n\n'),
          author,
          parentId: null,
          childrenIds: [],
          attachments: [],
          url: root.ownerDocument?.defaultView?.location.href ?? null,
          order: order++,
        });
      }
    }

    // Comments: new Reddit.
    const newComments = Array.from(root.querySelectorAll('shreddit-comment'));
    for (const c of newComments) {
      const node = this.parseNewComment(c, order);
      if (node) {
        nodes.push(node);
        order++;
      }
    }

    // Comments: old Reddit (skip if new parser already worked).
    if (newComments.length === 0) {
      const oldComments = Array.from(root.querySelectorAll('div.comment'));
      const seen = new Set<Element>();
      for (const c of oldComments) {
        // Only top-most comments; nested ones are handled via recursion.
        if (c.parentElement?.closest('div.comment')) continue;
        order = this.collectOldComment(c, nodes, order, seen);
      }
    }

    return nodes;
  }

  resolveTarget(el: Element): string | null {
    const c = el.closest('shreddit-comment, div.comment');
    if (!c) return null;
    if (c.tagName === 'SHREDDIT-COMMENT' || c instanceof HTMLElement) {
      return c.getAttribute('data-context-lens-id') ?? c.getAttribute('id');
    }
    return null;
  }

  private parseNewComment(el: Element, order: number): CanonicalNode | null {
    const body = el.querySelector('[slot="comment"]');
    const text = (body?.textContent ?? '').trim();
    if (!text) return null;
    const id = el.getAttribute('id') ?? `rd_c_${order}`;
    el.setAttribute('data-context-lens-id', id);
    const parentEl = el.parentElement?.closest('shreddit-comment');
    const parentId = parentEl
      ? (parentEl.getAttribute('id') ?? parentEl.getAttribute('data-context-lens-id'))
      : null;
    return {
      id,
      type: parentId ? 'reply' : 'comment',
      text,
      author: el.getAttribute('author') ?? 'unknown',
      parentId,
      childrenIds: [],
      attachments: [],
      url: null,
      order,
    };
  }

  private collectOldComment(el: Element, nodes: CanonicalNode[], order: number, _seen: Set<Element>): number {
    const body = el.querySelector(':scope > .entry .usertext-body');
    const text = (body?.textContent ?? '').trim();
    if (text) {
      const id = el.getAttribute('data-full-name') ?? `rd_c_${order}`;
      el.setAttribute('data-context-lens-id', id);
      const parentEl = el.parentElement?.closest('div.comment');
      const parentId = parentEl
        ? (parentEl.getAttribute('data-full-name') ??
          parentEl.getAttribute('data-context-lens-id'))
        : 'rd_post_0';
      nodes.push({
        id,
        type: parentId === 'rd_post_0' ? 'comment' : 'reply',
        text,
        author: el.querySelector(':scope > .entry a.author')?.textContent?.trim() ?? 'unknown',
        parentId,
        childrenIds: [],
        attachments: [],
        url: null,
        order: order++,
      });
    }
    for (const child of Array.from(el.querySelectorAll(':scope > .child > div.comment'))) {
      order = this.collectOldComment(child, nodes, order, _seen);
    }
    return order;
  }

  private postAttachments(root: Element): CanonicalNode['attachments'] {
    return Array.from(root.querySelectorAll('img[src*="i.redd.it"], gallery-carousel img'))
      .map((img) => ({
        kind: 'image' as const,
        url: img.getAttribute('src') ?? '',
        altText: img.getAttribute('alt') ?? undefined,
      }))
      .filter((a) => a.url);
  }
}
