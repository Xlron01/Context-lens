/** Canonical, platform-agnostic representation of a post/comment/reply. */
export type NodeType = 'post' | 'comment' | 'reply' | 'quote' | 'unknown';

export interface CanonicalNode {
  /** Stable id within the page (platform id if available, else generated). */
  id: string;
  type: NodeType;
  text: string;
  author: string;
  parentId: string | null;
  childrenIds: string[];
  attachments: Attachment[];
  url: string | null;
  /** Approximate DOM position, used to sort siblings chronologically. */
  order: number;
}

export interface Attachment {
  kind: 'image' | 'video' | 'link';
  url: string;
  altText?: string;
}

export interface PlatformAdapter {
  readonly platform: string;
  /** True if this adapter can parse the current page. */
  matches(url: string): boolean;
  /** Parse visible content into canonical nodes. Best effort; never throws. */
  collect(root: Element): CanonicalNode[];
  /** Map a right-clicked element to the closest canonical node id. */
  resolveTarget(el: Element): string | null;
}
