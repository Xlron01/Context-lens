import { runTask, DEFAULT_SETTINGS, type Settings } from '../ai/router';
import type { ExtensionMessage, RunTaskMessage, TaskResultMessage } from '../shared/messages';
import { resolveContext } from '../core/context-engine/resolver';
import { ContextGraph } from '../core/context-engine/graph';

const MENU_EXPLAIN = 'context-lens-explain';
const MENU_THREAD = 'context-lens-thread';

async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(['settings']);
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_EXPLAIN,
      title: 'Context Lens: Explain this',
      contexts: ['selection', 'page', 'link', 'image'],
    });
    chrome.contextMenus.create({
      id: MENU_THREAD,
      title: 'Context Lens: Who is replying to whom?',
      contexts: ['selection', 'page', 'link', 'image'],
    });
  });
});

// The context menu gives us a frame/tab, not the clicked element. We ask the
// content script in the focused tab to act on its last right-clicked element.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || (info.menuItemId !== MENU_EXPLAIN && info.menuItemId !== MENU_THREAD)) return;
  const task = info.menuItemId === MENU_EXPLAIN ? 'explain' : 'thread';
  chrome.tabs.sendMessage(tab.id, { type: 'RUN_ON_LAST_TARGET', task } as never, () => void chrome.runtime.lastError);
});

chrome.runtime.onMessage.addListener(
  (msg: ExtensionMessage, _sender, sendResponse: (resp: TaskResultMessage) => void) => {
    if (msg.type !== 'RUN_TASK') return false;

    (async () => {
      try {
        const settings = await loadSettings();
        // Rebuild the package from the serialized pieces (keeps the AI layer
        // independent of chrome APIs and easy to unit test).
        const graph = new ContextGraph([msg.target, ...msg.items.map((i) => i.node)]);
        const pkg = resolveContext(graph, msg.target.id, msg.platform, msg.pageUrl, msg.pageTitle) ?? {
          platform: msg.platform,
          pageUrl: msg.pageUrl,
          pageTitle: msg.pageTitle,
          target: msg.target,
          items: msg.items,
          truncated: msg.truncated,
        };
        const result = await runTask(msg.task, pkg, settings);
        sendResponse({
          type: 'TASK_RESULT',
          ok: true,
          headline: result.headline,
          sections: result.sections,
          provider: result.provider,
          model: result.model,
          truncated: msg.truncated,
        });
      } catch (err) {
        sendResponse({ type: 'TASK_RESULT', ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return true; // async response
  },
);
