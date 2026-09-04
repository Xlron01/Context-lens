import type { CanonicalNode, PlatformAdapter } from '../../core/canonical';

/**
 * X / Twitter adapter.
 *
 * X has no stable semantic DOM: class names are generated. We rely on the
 * data-testid attributes which have been stable for years ("tweet",
 * "tweetText") and fall back gracefully when they change.
 */
export class TwitterAdapter implements PlatformAdapter {
  readonly platform = 'twitter';

  matches(url: string): boolean {
    return /^https:\/\/(www\.)?(twitter|x)\.com\//.test(url);
  }

  collect(root: Element): CanonicalNode[] {
    const tweets = Array.from(root.querySelectorAll('article[data-testid="tweet"]'));
    const nodes: CanonicalNode[] = [];
    tweets.forEach((el, i) => {
      const node = this.parseTweet(el, i);
      if (node) nodes.push(node);
    });
    this.linkParents(nodes);
    return nodes;
  }

  resolveTarget(el: Element): string | null {
    const tweet = el.closest('article[data-testid="tweet"]');
    if (!tweet) return null;
    const id = tweet.getAttribute('data-cl-id');
    if (id) return id;
    // Generated ids are assigned during collect; content script keeps a map
    // from element to id using a WeakMap-like attribute.
    return tweet.getAttribute('data-context-lens-id');
  }

  private parseTweet(el: Element, index: number): CanonicalNode | null {
    const textEl = el.querySelector('[data-testid="tweetText"]');
    const text = (textEl?.textContent ?? '').trim();
    if (!text) return null;

    // Author: first link inside the user section (href="/handle").
    const authorLink = Array.from(el.querySelectorAll('a[href^="/"]')).find((a) => {
      const href = a.getAttribute('href') ?? '';
      return /^\/[A-Za-z0-9_]+$/.test(href.split('?')[0]);
    });
    const author = (authorLink?.getAttribute('href') ?? '').split('?')[0].slice(1) || 'unknown';

    // Tweet permalink: links containing /status/.
    const permalink = Array.from(el.querySelectorAll('a[href*="/status/"]'))
      .map((a) => a.getAttribute('href') ?? '')
      .find((href) => /\/status\/\d+/.test(href));

    const id = `tw_${index}_${hash(el, text)}`;
    el.setAttribute('data-context-lens-id', id);

    const attachments: CanonicalNode['attachments'] = Array.from(
      el.querySelectorAll('img[src*="pbs.twimg.com/media"]'),
    ).map((img) => ({
      kind: 'image' as const,
      url: img.getAttribute('src') ?? '',
      altText: img.getAttribute('alt') ?? undefined,
    }));

    const isQuote = Boolean(el.querySelector('div[data-testid="quoteTweet"], div[data-testid="QuoteTweet"]'));

    return {
      id,
      type: isQuote ? 'quote' : index === 0 ? 'post' : 'reply',
      text,
      author,
      parentId: null,
      childrenIds: [],
      attachments,
      url: permalink ?? null,
      order: index,
    };
  }

  /**
   * X renders a thread page as a chronological chain: ancestor tweets,
   * the focused tweet, then replies. Without platform ids in the DOM we
   * approximate: main-chain tweets (self-replies) link to the previous
   * tweet; top-level replies link to the focused tweet (index 0 chain head).
   * This is intentionally best-effort; the context engine tolerates noise.
   */
  private linkParents(nodes: CanonicalNode[]): void {
    if (nodes.length === 0) return;
    const focusIdx = this.focusIndex(nodes);
    nodes.forEach((n, i) => {
      if (i === 0) return;
      if (i <= focusIdx) {
        n.parentId = nodes[i - 1].id;
        nodes[i - 1].childrenIds.push(n.id);
      } else {
        n.parentId = nodes[focusIdx].id;
        nodes[focusIdx].childrenIds.push(n.id);
      }
    });
  }

  /** Index of the focused tweet on a status page (first after ancestors), 0 on timeline. */
  private focusIndex(nodes: CanonicalNode[]): number {
    const path = typeof location !== 'undefined' ? location.pathname : '';
    if (!path.includes('/status/')) return 0;
    const statusMatch = path.match(/\/status\/(\d+)/);
    if (!statusMatch) return 0;
    const idx = nodes.findIndex((n) => n.url?.includes(statusMatch[1]));
    return idx > 0 ? idx : 0;
  }
}

function hash(el: Element, text: string): string {
  const h = Array.from(text + el.childElementCount).reduce(
    (acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0,
    0,
  );
  return Math.abs(h).toString(36);
}
