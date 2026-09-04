import { adapterFor } from './adapters';
import { GenericAdapter } from './adapters/generic';
import { ContextGraph } from '../core/context-engine/graph';
import { resolveContext } from '../core/context-engine/resolver';
import { showPanel, updatePanel } from '../ui/panel/panel';
import type { ExtensionMessage, TaskResultMessage } from '../shared/messages';

const adapter = adapterFor(location.href);
let cachedGraph: ContextGraph | null = null;
let cachedAt = 0;
const CACHE_MS = 3000;

function currentGraph(): ContextGraph {
  if (cachedGraph && Date.now() - cachedAt < CACHE_MS) return cachedGraph;
  cachedGraph = new ContextGraph(adapter.collect(document.body));
  cachedAt = Date.now();
  return cachedGraph;
}

export function runTaskOnElement(task: 'explain' | 'thread', el: Element): void {
  // Refresh ids on generic pages before resolving the target.
  if (adapter instanceof GenericAdapter) adapter.tagBlocks(document.body);
  const targetId = adapter.resolveTarget(el);
  if (!targetId) {
    showPanel();
    updatePanel({
      type: 'TASK_RESULT',
      ok: false,
      error: 'Could not identify a post or comment at the clicked position. Try clicking directly on the text.',
    });
    return;
  }
  const graph = currentGraph();
  const pkg = resolveContext(graph, targetId, adapter.platform, location.href, document.title);
  if (!pkg) {
    showPanel();
    updatePanel({ type: 'TASK_RESULT', ok: false, error: 'Target disappeared from the page (feed refreshed?).' });
    return;
  }

  showPanel();
  updatePanel({ type: 'TASK_RESULT', ok: false, error: undefined, headline: 'Loading…' });

  const message: ExtensionMessage = {
    type: 'RUN_TASK',
    task,
    target: pkg.target,
    items: pkg.items,
    truncated: pkg.truncated,
    platform: pkg.platform,
    pageUrl: pkg.pageUrl,
    pageTitle: pkg.pageTitle,
  };
  chrome.runtime.sendMessage(message, (response: TaskResultMessage) => {
      updatePanel(response ?? { type: 'TASK_RESULT', ok: false, error: 'No response from background worker.' });
    },
  );
}

// Expose for the context-menu bridge in background/index.ts.
declare global {
  interface Window {
    __contextLens?: { runTaskOnElement: typeof runTaskOnElement };
  }
}
window.__contextLens = { runTaskOnElement };

// Context menus fire in the background worker, which only knows the tab —
// so we remember the last right-clicked element and act on it on request.
let lastTarget: Element | null = null;
document.addEventListener(
  'contextmenu',
  (e) => {
    lastTarget = e.target instanceof Element ? e.target : null;
  },
  true,
);

chrome.runtime.onMessage.addListener((msg: { type: string; task: 'explain' | 'thread' }) => {
  if (msg.type === 'RUN_ON_LAST_TARGET' && lastTarget) {
    runTaskOnElement(msg.task, lastTarget);
  }
});

// Keep ids fresh on dynamic feeds (infinite scroll / new replies).
const observer = new MutationObserver(() => {
  cachedGraph = null;
});
observer.observe(document.body, { childList: true, subtree: true });
