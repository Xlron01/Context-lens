import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { RedditAdapter } from '../src/content/adapters/reddit';
import { GenericAdapter } from '../src/content/adapters/generic';

const newRedditHtml = `
<body>
  <shreddit-post id="t3_abc" post-title="Is Rust really faster than Go?" author="op_user" permalink="/r/rust/comments/abc/x/">
    <div slot="text-body">Benchmarks seem mixed, what gives?</div>
  </shreddit-post>
  <shreddit-comment id="t1_c1" author="alice">
    <div slot="comment">Rust wins on CPU-bound workloads when written carefully.</div>
  </shreddit-comment>
  <shreddit-comment id="t1_c2" author="bob">
    <div slot="comment">Go wins on iteration speed, benchmarks miss that.</div>
  </shreddit-comment>
</body>`;

const oldRedditHtml = `
<body>
  <a class="title">Old reddit post title</a>
  <div class="comment" data-full-name="t1_a">
    <div class="entry"><a class="author">alice</a>
      <div class="usertext-body">top comment from alice</div>
    </div>
    <div class="child">
      <div class="comment" data-full-name="t1_b">
        <div class="entry"><a class="author">bob</a>
          <div class="usertext-body">nested reply from bob</div>
        </div>
      </div>
    </div>
  </div>
</body>`;

describe('RedditAdapter', () => {
  it('parses new reddit post + comments', () => {
    const dom = new JSDOM(newRedditHtml);
    const adapter = new RedditAdapter();
    const nodes = adapter.collect(dom.window.document.body);
    expect(nodes).toHaveLength(3);
    const post = nodes.find((n) => n.type === 'post')!;
    expect(post.author).toBe('op_user');
    expect(post.text).toContain('Is Rust really faster');
    const comments = nodes.filter((n) => n.type === 'comment');
    expect(comments.map((c) => c.author).sort()).toEqual(['alice', 'bob']);
  });

  it('parses old reddit nested comments', () => {
    const dom = new JSDOM(oldRedditHtml);
    const adapter = new RedditAdapter();
    const nodes = adapter.collect(dom.window.document.body);
    expect(nodes).toHaveLength(3);
    const nested = nodes.find((n) => n.id === 't1_b')!;
    expect(nested.parentId).toBe('t1_a');
    expect(nested.type).toBe('reply');
  });
});

describe('GenericAdapter', () => {
  it('collects text blocks and tags them for target resolution', () => {
    const dom = new JSDOM(`
      <body>
        <div><p>This is a reasonably long post body text block right here.</p></div>
        <div><p>And this is a second comment-like block with enough text.</p></div>
      </body>
    `);
    const adapter = new GenericAdapter();
    adapter.tagBlocks(dom.window.document.body);
    const nodes = adapter.collect(dom.window.document.body);
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[1].parentId).toBe(nodes[0].id);
    const p = dom.window.document.querySelectorAll('p')[1]!;
    expect(adapter.resolveTarget(p)).toBe(nodes[1].id);
  });
});
