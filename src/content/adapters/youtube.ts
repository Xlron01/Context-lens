import type { CanonicalNode, PlatformAdapter } from '../../core/canonical';

/**
 * YouTube adapter. Parses the watch page: video as the root post and
 * comment threads (with nested replies) as comments/replies.
 *
 * YouTube's DOM changes frequently and much of it is behind scrolling and
 * lazy loading, so this is best-effort: elements are queried with several
 * fallback selectors.
 */
export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube';

  matches(url: string): boolean {
    return /^https:\/\/(www\.|m\.)?youtube\.com\//.test(url);
  }

  collect(root: Element): CanonicalNode[] {
    const nodes: CanonicalNode[] = [];
    let order = 0;

    // Video "post": title + channel (+ description snippet).
    const title =
      root.querySelector('ytd-watch-metadata h1 .yt-core-attributed-string')?.textContent?.trim() ??
      root.querySelector('ytd-watch-metadata h1')?.textContent?.trim() ??
      '';
    if (title) {
      const channel =
        root.querySelector('ytd-watch-metadata ytd-channel-name #text a')?.textContent?.trim() ??
        root.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent?.trim() ??
        'unknown';
      const description =
        root.querySelector('#description-inline-expander .yt-core-attributed-string')?.textContent?.trim() ?? '';
      nodes.push({
        id: 'yt_post_0',
        type: 'post',
        text: [title, description].filter(Boolean).join('\n\n').slice(0, 4000),
        author: channel,
        parentId: null,
        childrenIds: [],
        attachments: [],
        url: location.href,
        order: order++,
      });
    }

    // Comment threads (top-level).
    for (const thread of Array.from(root.querySelectorAll('ytd-comment-thread-renderer'))) {
      const main = thread.querySelector('ytd-comment-view-model') ?? thread;
      const node = this.parseComment(main, order, null);
      if (node) {
        thread.setAttribute('data-context-lens-id', node.id);
        nodes.push(node);
        order++;
        // Replies within the thread.
        for (const reply of Array.from(
          thread.querySelectorAll(
            'ytd-comment-replies-renderer ytd-comment-view-model, ytd-comment-replies-renderer ytd-comment-renderer',
          ),
        )) {
          const replyNode = this.parseComment(reply, order, node.id);
          if (replyNode) {
            reply.setAttribute('data-context-lens-id', replyNode.id);
            nodes.push(replyNode);
            order++;
          }
        }
      }
    }

    return nodes;
  }

  resolveTarget(el: Element): string | null {
    const holder = el.closest('[data-context-lens-id]');
    if (holder) return holder.getAttribute('data-context-lens-id');
    // Fallback: element inside a comment view model but not yet tagged.
    const vm = el.closest('ytd-comment-view-model, ytd-comment-thread-renderer');
    if (vm) {
      const id = vm.getAttribute('data-context-lens-id');
      if (id) return id;
    }
    // Clicking the video itself targets the post.
    if (el.closest('ytd-watch-metadata')) return 'yt_post_0';
    return null;
  }

  private parseComment(el: Element, order: number, parentId: string | null): CanonicalNode | null {
    const author =
      el.querySelector('#author-text')?.textContent?.trim() ??
      el.querySelector('a#author')?.textContent?.trim() ??
      'unknown';
    const text =
      el.querySelector('#content-text .yt-core-attributed-string')?.textContent?.trim() ??
      el.querySelector('#content-text')?.textContent?.trim() ??
      '';
    if (!text) return null;
    return {
      id: `yt_c_${order}_${Math.abs(hash(author + text)).toString(36)}`,
      type: parentId ? 'reply' : 'comment',
      text,
      author,
      parentId,
      childrenIds: [],
      attachments: [],
      url: null,
      order,
    };
  }
}

function hash(s: string): number {
  return Array.from(s).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
}
