import { adapterFor } from './adapters';
import { GenericAdapter } from './adapters/generic';
import { ContextGraph } from '../core/context-engine/graph';
import { resolveContext, type ContextPackage } from '../core/context-engine/resolver';
import { contextPackageJson } from '../ai/prompts';
import { TASKS, type CaptionStyle, type TaskId } from '../ai/tasks';
import { createPanel, type PanelUi } from '../ui/panel/panel';
import type {
  BackgroundToContent,
  PageInfoMessage,
  ProgressMessage,
  RunTaskMessage,
  TaskResultMessage,
} from '../shared/messages';

const adapter = adapterFor(location.href);
const panel = createPanel();

let cachedGraph: ContextGraph | null = null;
let cachedAt = 0;
const CACHE_MS = 3000;

interface BehaviorSettings {
  includeParent: boolean;
  includeReplies: boolean;
}
let behavior: BehaviorSettings = { includeParent: true, includeReplies: true };
chrome.storage.local.get(['settings']).then((s) => {
  const st = (s.settings as { behavior?: BehaviorSettings } | undefined)?.behavior;
  if (st) behavior = { includeParent: st.includeParent ?? true, includeReplies: st.includeReplies ?? true };
});
chrome.storage.onChanged.addListener((changes) => {
  const b = (changes.settings?.newValue as { behavior?: BehaviorSettings } | undefined)?.behavior;
  if (b) behavior = { includeParent: b.includeParent ?? true, includeReplies: b.includeReplies ?? true };
});

function currentGraph(): ContextGraph {
  if (cachedGraph && Date.now() - cachedAt < CACHE_MS) return cachedGraph;
  if (adapter instanceof GenericAdapter) adapter.tagBlocks(document.body);
  cachedGraph = new ContextGraph(adapter.collect(document.body));
  cachedAt = Date.now();
  return cachedGraph;
}

// --- pipeline state (visible debug: nothing ever "does nothing") ---------

let steps: { id: string; label: string; state: 'pending' | 'active' | 'done' | 'failed'; detail?: string }[] = [];

function setSteps(update?: (s: typeof steps) => void): void {
  if (update) update(steps);
  panel.setSteps(steps);
}

// --- context package building --------------------------------------------

interface PendingRequest {
  task: TaskId;
  pkg: ContextPackage;
  style?: CaptionStyle;
  variation: number;
  localTargetLabel: string;
}

let lastCaptionBase: { pkg: ContextPackage; style: CaptionStyle; variation: number } | null = null;

function buildPackage(task: TaskId, el: Element | null, selectionText?: string):
  { ok: true; pkg: ContextPackage; targetLabel: string } | { ok: false; error: string } {
  const graph = currentGraph();
  const pageTitle = document.title;
  const pageUrl = location.href;

  if (selectionText) {
    // Synthetic target for text selections; enclosing node (if any) becomes context.
    const anchorEl = (window.getSelection()?.anchorNode?.parentElement ?? null) as Element | null;
    const enclosingId = anchorEl ? adapter.resolveTarget(anchorEl) : null;
    const target = {
      id: `sel_${Math.abs(hash(selectionText))}`,
      type: 'unknown' as const,
      text: selectionText,
      author: 'unknown',
      parentId: enclosingId,
      childrenIds: [],
      attachments: [],
      url: null,
      order: 0,
    };
    const graphWithSel = new ContextGraph([target, ...graph.nodes.values()]);
    const pkg = resolveContext(graphWithSel, target.id, adapter.platform, pageUrl, pageTitle, {
      depth: TASKS[task].depth,
      includeParent: behavior.includeParent,
      includeReplies: behavior.includeReplies,
    });
    if (!pkg) return { ok: false, error: 'Could not build context for the selection.' };
    pkg.items = pkg.items.map((i) => (i.node.id === enclosingId ? { ...i, label: 'Contains selection' } : i));
    return { ok: true, pkg, targetLabel: 'Selected text' };
  }

  if (!el) return { ok: false, error: 'No target. Click a post or comment, or select text first.' };
  const targetId = adapter.resolveTarget(el);
  if (!targetId) {
    return {
      ok: false,
      error: 'Could not identify a post or comment there. Try clicking directly on the text, or select the text instead.',
    };
  }
  const pkg = resolveContext(graph, targetId, adapter.platform, pageUrl, pageTitle, {
    depth: TASKS[task].depth,
    includeParent: behavior.includeParent,
    includeReplies: behavior.includeReplies,
  });
  if (!pkg) return { ok: false, error: 'Target disappeared from the page (feed refreshed?). Try again.' };
  return { ok: true, pkg, targetLabel: `${pkg.target.type} by @${pkg.target.author}` };
}

function describeContext(pkg: ContextPackage): string {
  if (pkg.items.length === 0) return 'standalone';
  return pkg.items.map((i) => i.label.toLowerCase()).join(', ');
}

// --- task runner ----------------------------------------------------------

async function startTask(task: TaskId, el: Element | null, selectionText?: string, style?: CaptionStyle): Promise<void> {
  try {
    await runTaskInner(task, el, selectionText, style);
  } catch (err) {
    // Last-resort guard: no action may ever fail silently.
    const message = err instanceof Error ? err.message : String(err);
    try {
      panel.open('Context Lens');
      setSteps();
      panel.renderResult({
        type: 'TASK_RESULT',
        ok: false,
        error: { code: 'PIPELINE_BROKEN', message: `Action handler failed: ${message}` },
      });
    } catch {
      console.error('[Context Lens] panel itself failed:', err);
    }
  }
}

async function runTaskInner(task: TaskId, el: Element | null, selectionText?: string, style?: CaptionStyle): Promise<void> {
  const def = TASKS[task];
  panel.open(`${def.label}`);

  steps = [
    { id: 'page', label: 'Reading page', state: 'active' },
    { id: 'target', label: 'Identify target', state: 'pending' },
    { id: 'context', label: 'Build context', state: 'pending' },
    { id: 'ai', label: 'Ask AI', state: 'pending' },
  ];
  setSteps();

  const built = buildPackage(task, el, selectionText);
  if (!built.ok) {
    steps = steps.map((s) => (s.id === 'page' || s.id === 'target' ? { ...s, state: 'failed', detail: built.error } : s));
    setSteps();
    panel.renderResult({
      type: 'TASK_RESULT',
      ok: false,
      error: { code: 'CONTEXT_NOT_FOUND', message: built.error, retryable: true },
    });
    return;
  }
  const { pkg, targetLabel } = built;

  steps[0] = { ...steps[0], state: 'done', detail: adapter.platform };
  steps[1] = { ...steps[1], state: 'done', detail: targetLabel };
  steps[2] = { ...steps[2], state: 'active', detail: describeContext(pkg) };
  setSteps();

  if (task === 'caption' && !style) {
    steps[2] = { ...steps[2], state: 'done', detail: describeContext(pkg) };
    setSteps();
    panel.renderCaptionChooser((picked) => void startTask('caption', el, selectionText, picked));
    return;
  }

  const chosenStyle = style ?? 'reaction';
  if (task === 'caption') lastCaptionBase = { pkg, style: chosenStyle, variation: 0 };

  const message: RunTaskMessage = {
    type: 'RUN_TASK',
    task,
    style: task === 'caption' ? chosenStyle : undefined,
    variation: task === 'caption' ? lastCaptionBase?.variation ?? 0 : undefined,
    target: pkg.target,
    items: pkg.items,
    truncated: pkg.truncated,
    platform: pkg.platform,
    pageUrl: pkg.pageUrl,
    pageTitle: pkg.pageTitle,
  };

  steps[2] = { ...steps[2], state: 'done', detail: describeContext(pkg) };
  steps[3] = { ...steps[3], state: 'active' };
  setSteps();

  chrome.runtime.sendMessage(message, (response: TaskResultMessage) => {
    if (!response) {
      steps[3] = { ...steps[3], state: 'failed', detail: 'No response from background worker.' };
      setSteps();
      panel.renderResult({
        type: 'TASK_RESULT',
        ok: false,
        error: {
          code: 'PIPELINE_BROKEN',
          message: 'Background worker unreachable. Reload the extension from chrome://extensions.',
        },
      });
      return;
    }
    if (response.ok) {
      steps[3] = { ...steps[3], state: 'done', detail: response.ms != null ? `${response.ms} ms` : undefined };
      setSteps();
    }
    panel.renderResult({ ...response, contextSummary: response.contextSummary ?? {
      targetLabel,
      items: pkg.items.map((i) => i.label),
      attachments: pkg.target.attachments.length,
      research: 'Not used',
    } });
    // Debug: show exactly what the model received.
    panel.renderContextPackage(contextPackageJson(pkg));
  });
}

// provider progress from background → pipeline display
chrome.runtime.onMessage.addListener((msg: BackgroundToContent) => {
  if (msg.type === 'TASK_PROGRESS') {
    const p = msg as ProgressMessage;
    if (p.kind === 'ask') {
      steps[3] = { ...steps[3], state: 'active', label: `Ask ${p.provider}`, detail: p.detail };
    } else if (p.kind === 'provider-failed') {
      steps.push({ id: `fail-${p.provider}`, label: `${p.provider} failed`, state: 'failed', detail: p.detail });
      steps[3] = { ...steps[3], state: 'active' };
    } else if (p.kind === 'fallback') {
      steps.push({ id: `fb-${p.provider}`, label: `Falling back to ${p.provider}`, state: 'active' });
    } else if (p.kind === 'done') {
      steps = steps.map((s) => (s.state === 'active' ? { ...s, state: 'done' } : s));
    }
    setSteps();
  }
});

// "Generate more" hook wired from the panel
(window as unknown as { __clMore?: () => void }).__clMore = () => {
  if (!lastCaptionBase) return;
  lastCaptionBase.variation += 1;
  const { pkg, style, variation } = lastCaptionBase;
  const message: RunTaskMessage = {
    type: 'RUN_TASK',
    task: 'caption',
    style,
    variation,
    target: pkg.target,
    items: pkg.items,
    truncated: pkg.truncated,
    platform: pkg.platform,
    pageUrl: pkg.pageUrl,
    pageTitle: pkg.pageTitle,
  };
  chrome.runtime.sendMessage(message, (response: TaskResultMessage) => {
    if (response?.ok && response.captions) panel.renderCaptions(response.captions, () => (window as unknown as { __clMore?: () => void }).__clMore?.());
    else if (response) panel.renderResult(response);
  });
};

// --- deterministic self-test (no AI) ---------------------------------------

async function runSelfTest(): Promise<void> {
  panel.open('🧪 Pipeline self-test');
  steps = [
    { id: 'loaded', label: 'Extension loaded', state: 'active' },
    { id: 'content', label: 'Content script connected', state: 'pending' },
    { id: 'background', label: 'Background worker connected', state: 'pending' },
    { id: 'target', label: 'Target detected', state: 'pending' },
    { id: 'context', label: 'Context extracted', state: 'pending' },
    { id: 'providers', label: 'Providers configured', state: 'pending' },
  ];
  setSteps();
  const mark = (id: string, state: 'done' | 'failed', detail?: string) => {
    steps = steps.map((s) => (s.id === id ? { ...s, state, detail } : s));
    setSteps();
  };

  mark('loaded', 'done');
  mark('content', 'done', adapter.platform);

  // Background round-trip.
  const pong = await new Promise<boolean>((resolve) => {
    chrome.runtime.sendMessage({ type: 'PING' }, (resp) => {
      void chrome.runtime.lastError;
      resolve(Boolean(resp?.type === 'PONG'));
    });
  });
  mark('background', pong ? 'done' : 'failed', pong ? 'round-trip ok' : 'PING got no PONG — reload the extension');

  // Target + context.
  const graph = currentGraph();
  const primary = primaryTargetId();
  mark('target', primary ? 'done' : 'failed', primary ? `${graph.get(primary)?.type} detected` : 'no post/comment found on this page');
  if (primary) {
    const built = buildPackage('understand', document.querySelector(`[data-context-lens-id="${primary}"]`));
    mark('context', built.ok ? 'done' : 'failed', built.ok ? `${built.pkg.items.length} context item(s), ~${Math.ceil((built.pkg.target.text.length + built.pkg.items.reduce((a, i) => a + i.node.text.length, 0)) / 4)} tokens` : built.error);
    if (built.ok) panel.renderContextPackage(contextPackageJson(built.pkg));
  } else {
    mark('context', 'failed', 'skipped (no target)');
  }

  // Providers configured (no API call).
  const stored = await chrome.storage.local.get(['settings']);
  const keys = (stored.settings as { keys?: Record<string, unknown> } | undefined)?.keys ?? {};
  const configured = Object.keys(keys).filter((k) => keys[k]);
  mark('providers', configured.length > 0 ? 'done' : 'failed', configured.length > 0 ? configured.join(', ') : 'add a key in Settings — tasks will fail with NO_PROVIDER');

  panel.renderResult({
    type: 'TASK_RESULT',
    ok: true,
    headline: pong && primary && configured.length > 0 ? 'Pipeline healthy ✓' : 'Pipeline issues found ✗',
    sections: [
      {
        title: 'What this means',
        body:
          pong && primary
            ? configured.length > 0
              ? 'The full click → context → background → AI pipeline is wired. Try Understand on a real post now.'
              : 'The pipeline works up to the AI call. Add an API key in Settings to complete it.'
            : 'The pipeline is broken at the marked step. Reload the extension, refresh the page, and re-run this test.',
        confidence: 'observed',
      },
    ],
  });
}

// --- popup bridge ----------------------------------------------------------

function primaryTargetId(): string | null {
  const graph = currentGraph();
  const post = [...graph.nodes.values()].find((n) => n.type === 'post');
  const first = [...graph.nodes.values()].sort((a, b) => a.order - b.order)[0];
  return post?.id ?? first?.id ?? null;
}

function describePage(): PageInfoMessage {
  const graph = currentGraph();
  const nodes = [...graph.nodes.values()];
  const posts = nodes.filter((n) => n.type === 'post').length;
  const comments = nodes.filter((n) => n.type !== 'post').length;
  const images = nodes.reduce((acc, n) => acc + n.attachments.length, 0);
  const primary = nodes.find((n) => n.id === primaryTargetId());
  return {
    type: 'PAGE_INFO',
    supported: adapter.platform !== 'generic' || nodes.length > 0,
    platform: adapter.platform,
    pageTitle: document.title,
    url: location.href,
    stats: { posts, comments, images },
    primary: primary ? { type: primary.type, author: primary.author, preview: primary.text.slice(0, 120) } : undefined,
  };
}

chrome.runtime.onMessage.addListener((msg: { type: string; task?: TaskId; action?: string }, _s, sendResponse) => {
  if (msg.type === 'DESCRIBE_PAGE') {
    sendResponse(describePage());
  } else if (msg.type === 'SELFTEST') {
    void runSelfTest();
  } else if (msg.type === 'RUN_FROM_POPUP' && msg.task) {
    const id = primaryTargetId();
    if (!id) {
      panel.open('Context Lens');
      setSteps();
      panel.renderResult({
        type: 'TASK_RESULT',
        ok: false,
        error: {
          code: 'CONTEXT_NOT_FOUND',
          message: 'Could not identify a post on this page. Scroll a bit and retry, or click a specific post.',
          retryable: true,
        },
      });
    } else {
      const el = document.querySelector(`[data-context-lens-id="${id}"]`);
      void startTask(msg.task, el);
    }
  } else if (msg.type === 'RUN_MENU_ACTION') {
    const selection = window.getSelection()?.toString().trim();
    if (msg.action === 'understand-sel' && selection) {
      void startTask('understand', null, selection);
    } else {
      void startTask(msg.action === 'caption' ? 'caption' : msg.action === 'thread' ? 'thread' : 'understand', lastRightClicked);
    }
  }
  return true;
});

// --- floating ✨ lens + action menu ---------------------------------------

const LENS_ID = 'context-lens-lens';
const MENU_ID = 'context-lens-menu';
let lastRightClicked: Element | null = null;

function isEditable(el: Element): boolean {
  return el.closest('input, textarea, [contenteditable="true"], [role="textbox"]') != null;
}

function positionHost(host: HTMLElement, x: number, y: number): void {
  host.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
  host.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
}

function lensHost(): HTMLElement {
  let host = document.getElementById(LENS_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = LENS_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .lens {
        position: fixed; z-index: 2147483646; width: 26px; height: 26px;
        border-radius: 50%; border: 1px solid rgba(255,255,255,.25);
        background: rgba(28,28,34,.92); color: #fff; font-size: 14px; line-height: 24px;
        text-align: center; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.4);
        user-select: none; font-family: system-ui, sans-serif;
      }
      .lens:hover { background: #4c5bd4; }
      .menu {
        position: fixed; z-index: 2147483647; width: 260px;
        background: #1c1c22; border: 1px solid #3a3a44; border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.5); color: #eee;
        font: 13px/1.4 system-ui, sans-serif; overflow: hidden; padding: 6px;
      }
      .menu .title { font-size: 11px; color: #888; padding: 6px 10px 4px; text-transform: uppercase; letter-spacing: .05em; }
      .menu button {
        display: block; width: 100%; text-align: left; background: none; border: none;
        color: #eee; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px;
      }
      .menu button:hover { background: #2c2c36; }
      .menu button.soon { opacity: .4; cursor: default; }
      .menu button .sub { display: block; font-size: 11px; color: #999; }
      .menu .sep { height: 1px; background: #2c2c36; margin: 4px 8px; }
    `;
    shadow.append(style);
  }
  return host;
}

function showLens(x: number, y: number, targetEl: Element | null, selectionText: string | null): void {
  const host = lensHost();
  if (!host.shadowRoot!.querySelector('.lens')) {
    const lens = document.createElement('div');
    lens.className = 'lens';
    lens.textContent = '✨';
    lens.onmouseenter = () => {
      const r = lens.getBoundingClientRect();
      showMenu(r.left - 10, r.bottom + 6, targetEl, selectionText);
      host.remove();
    };
    host.shadowRoot!.append(lens);
  }
  const lens = host.shadowRoot!.querySelector('.lens') as HTMLElement;
  lens.dataset.x = String(x);
  host.style.left = `${Math.min(x, window.innerWidth - 40)}px`;
  host.style.top = `${Math.min(y, window.innerHeight - 40)}px`;
  (lens as HTMLElement & { _t?: Element | null })._t = targetEl;
  (lens as HTMLElement & { _s?: string | null })._s = selectionText;
}

function showMenu(x: number, y: number, targetEl: Element | null, selectionText: string | null): void {
  document.getElementById(MENU_ID)?.remove();
  const fresh = document.createElement('div');
  fresh.id = MENU_ID;
  const shadow = fresh.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = (lensHost().shadowRoot!.querySelector('style') as HTMLStyleElement).textContent;
  shadow.append(styleEl);
  const menu = document.createElement('div');
  menu.className = 'menu';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = selectionText ? '✨ Selected text' : targetEl ? '✨ Context Lens' : '✨ Context Lens';
  menu.append(title);

  const run = (task: TaskId) => {
    fresh.remove();
    if (selectionText) void startTask(task, null, selectionText);
    else void startTask(task, targetEl);
  };

  for (const def of Object.values(TASKS)) {
    if (def.id === 'caption' || def.id === 'understand' || def.id === 'intent' || def.id === 'thread') {
      const btn = document.createElement('button');
      btn.innerHTML = `${def.label}<span class="sub">${def.tagline}</span>`;
      btn.onclick = () => run(def.id);
      menu.append(btn);
    } else if (['argument', 'verify', 'discussion', 'research'].includes(def.id)) {
      const btn = document.createElement('button');
      btn.className = 'soon';
      btn.innerHTML = `${def.label} — soon<span class="sub">${def.tagline}</span>`;
      menu.append(btn);
    }
  }
  shadow.append(menu);
  document.documentElement.append(fresh);
  // .menu is position:fixed — position it explicitly in viewport coords.
  const menuEl = shadow.querySelector('.menu') as HTMLElement;
  menuEl.style.left = `${Math.max(4, Math.min(x, window.innerWidth - 276))}px`;
  menuEl.style.top = `${Math.max(4, Math.min(y, window.innerHeight - 320))}px`;
  const host = fresh as HTMLElement & { style: CSSStyleDeclaration };
  void host;
  setTimeout(() => {
    const dismiss = (e: MouseEvent) => {
      if (!fresh.shadowRoot!.querySelector('.menu')?.contains(e.target as Node) && e.target !== fresh) {
        fresh.remove();
        document.removeEventListener('mousedown', dismiss, true);
      }
    };
    document.addEventListener('mousedown', dismiss, true);
  }, 0);
}

// hover → lens on canonical nodes
let hoverTimer: number | undefined;
document.addEventListener(
  'mousemove',
  (e) => {
    if (hoverTimer) return;
    hoverTimer = window.setTimeout(() => {
      hoverTimer = undefined;
      const el = e.target instanceof Element ? e.target : null;
      if (!el || isEditable(el) || el.closest(`#${LENS_ID}, #${MENU_ID}`)) return;
      const sel = window.getSelection();
      const selection = sel && !sel.isCollapsed ? sel.toString().trim() : null;
      if (selection && selection.length > 3) {
        const range = sel!.getRangeAt(0).getBoundingClientRect();
        if (range.width || range.height) {
          showLens(range.right + 6, range.top - 14, null, selection);
          return;
        }
      }
      if (adapter.resolveTarget(el)) {
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.height > 20) {
          showLens(r.right - 18, r.top + 8, el, null);
          return;
        }
      }
      document.getElementById(LENS_ID)?.remove();
    }, 120);
  },
  { passive: true },
);

// scroll/most navigation → clean up
document.addEventListener(
  'contextmenu',
  (e) => {
    lastRightClicked = e.target instanceof Element ? e.target : null;
    document.getElementById(LENS_ID)?.remove();
    document.getElementById(MENU_ID)?.remove();
  },
  true,
);

function hash(s: string): number {
  return Array.from(s).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
}
