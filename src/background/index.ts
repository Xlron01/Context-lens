import { runTask, testProvider, DEFAULT_SETTINGS, toLensError, type Settings } from '../ai/router';
import { providerIds } from '../ai/router';
import type {
  ContentToBackground,
  LensError,
  ProviderHealthMessage,
  RunTaskMessage,
  TaskResultMessage,
} from '../shared/messages';
import type { ContextPackage } from '../core/context-engine/resolver';

const MENU_PARENT = 'context-lens';
const MENU_UNDERSTAND = 'context-lens-understand';
const MENU_POST = 'context-lens-post';
const MENU_THREAD = 'context-lens-thread';
const MENU_CAPTION = 'context-lens-caption';

async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(['settings']);
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

// Deterministic connectivity check used by the 🧪 self-test (no AI involved).
chrome.runtime.onMessage.addListener((msg: ContentToBackground, _sender, sendResponse) => {
  if ((msg as { type?: string }).type === 'PING') {
    sendResponse({ type: 'PONG', at: Date.now() });
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PARENT,
      title: 'Context Lens',
      contexts: ['selection', 'page', 'link', 'image'],
    });
    chrome.contextMenus.create({ id: MENU_UNDERSTAND, parentId: MENU_PARENT, title: 'Understand selected text', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_POST, parentId: MENU_PARENT, title: 'Analyze this post', contexts: ['page', 'link', 'image'] });
    chrome.contextMenus.create({ id: MENU_THREAD, parentId: MENU_PARENT, title: 'Who is replying to whom?', contexts: ['page', 'selection', 'link', 'image'] });
    chrome.contextMenus.create({ id: MENU_CAPTION, parentId: MENU_PARENT, title: 'Create repost caption', contexts: ['page', 'selection', 'link', 'image'] });
  });
});

// The context menu only knows the tab; the content script remembers the
// right-clicked element and selection and acts on them.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !String(info.menuItemId).startsWith('context-lens')) return;
  const taskByMenu: Record<string, string> = {
    [MENU_UNDERSTAND]: 'understand-sel',
    [MENU_POST]: 'understand',
    [MENU_THREAD]: 'thread',
    [MENU_CAPTION]: 'caption',
  };
  const action = taskByMenu[info.menuItemId as string];
  if (!action) return;
  chrome.tabs.sendMessage(tab.id, { type: 'RUN_MENU_ACTION', action }, () => void chrome.runtime.lastError);
});

chrome.runtime.onMessage.addListener((msg: ContentToBackground, sender, sendResponse) => {
  if (msg.type === 'TEST_PROVIDERS') {
    (async () => {
      const settings = await loadSettings();
      const ids = providerIds().filter((id) => settings.keys[id]);
      const results = await Promise.all(
        ids.map(async (id) => ({ id, ...(await testProvider(id, settings)) })),
      );
      const resp: ProviderHealthMessage = { type: 'PROVIDER_HEALTH', results };
      sendResponse(resp);
    })();
    return true;
  }

  if (msg.type !== 'RUN_TASK') return false;
  const run = msg as RunTaskMessage;

  (async () => {
    const tabId = sender.tab?.id;
    const onProgress = tabId
      ? (ev: { kind: string; provider?: string; detail?: string }) =>
          chrome.tabs.sendMessage(tabId, { type: 'TASK_PROGRESS', ...ev }, () => void chrome.runtime.lastError)
      : undefined;

    try {
      const settings = await loadSettings();
      // The content script already applied depth/budgeting — trust its package.
      const pkg: ContextPackage = {
        platform: run.platform,
        pageUrl: run.pageUrl,
        pageTitle: run.pageTitle,
        target: run.target,
        items: run.items,
        truncated: run.truncated,
      };
      const result = await runTask(run.task, pkg, settings, onProgress, {
        style: run.style,
        variation: run.variation,
      });
      const resp: TaskResultMessage = {
        type: 'TASK_RESULT',
        ok: true,
        task: run.task,
        headline: result.headline,
        sections: result.sections,
        captions: result.captions,
        provider: result.provider,
        model: result.model,
        ms: result.ms,
        contextSummary: {
          targetLabel: `${run.target.type} by ${run.target.author}`,
          items: run.items.map((i) => i.label),
          attachments: run.target.attachments.length,
          research: 'Not used',
        },
        truncated: run.truncated,
      };
      sendResponse(resp);
    } catch (err) {
      const lensError: LensError =
        (err as LensError)?.code !== undefined
          ? (err as LensError)
          : toLensError(err);
      sendResponse({ type: 'TASK_RESULT', ok: false, task: run.task, error: lensError });
    }
  })();

  return true; // async response
});
