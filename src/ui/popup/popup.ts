import { DEFAULT_SETTINGS, PROVIDER_INFO, type Settings } from '../../ai/router';
import { AI_MODES, CAPTION_STYLES, TASKS, type AiMode, type TaskId } from '../../ai/tasks';
import type { PageInfoMessage, ProviderHealthMessage } from '../../shared/messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const LAUNCHER_ACTIONS: { task: TaskId; emoji: string; sub?: string }[] = [
  { task: 'understand', emoji: '🧠', sub: TASKS.understand.tagline },
  { task: 'verify', emoji: '🔎', sub: 'Coming in V0.3' },
  { task: 'caption', emoji: '✍', sub: TASKS.caption.tagline },
  { task: 'argument', emoji: '⚖', sub: 'Coming in V0.2' },
];

let settings: Settings = { ...DEFAULT_SETTINGS };
let tabId: number | null = null;

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  const stored = await chrome.storage.local.get(['settings']);
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };

  renderLauncher();
  renderSettings();
  void detectPage();
}

async function detectPage(): Promise<void> {
  const box = $('detection');
  if (tabId == null) {
    box.innerHTML = `<div class="line warn">⚠ No active tab.</div>`;
    return;
  }
  const detection = box;
  try {
    const info = await chrome.tabs.sendMessage(tabId, { type: 'DESCRIBE_PAGE' }) as PageInfoMessage;
    if (!info || !info.supported) {
      detection.innerHTML = `
        <div class="line warn">⚠ Could not identify a post here.</div>
        <div class="preview">Context Lens works on X, Reddit, and YouTube. Open a post and try again, or select text to use the lens.</div>`;
      return;
    }
    const platformName = info.platform === 'twitter' ? 'X / Twitter' : info.platform === 'reddit' ? 'Reddit' : info.platform === 'youtube' ? 'YouTube' : 'this page';
    detection.innerHTML = `
      <div class="line"><span class="ok">✓</span> ${escapeHtml(platformName)} detected</div>
      ${info.stats.posts ? `<div class="line"><span class="ok">✓</span> ${info.stats.posts} post${info.stats.posts > 1 ? 's' : ''}</div>` : ''}
      ${info.stats.comments ? `<div class="line"><span class="ok">✓</span> ${info.stats.comments} comment${info.stats.comments > 1 ? 's' : ''} found</div>` : ''}
      ${info.stats.images ? `<div class="line"><span class="ok">✓</span> ${info.stats.images} image${info.stats.images > 1 ? 's' : ''}</div>` : ''}
      ${info.primary ? `<div class="preview">"${escapeHtml(info.primary.preview)}…"</div>` : ''}`;
    ($('analyzeCurrent') as HTMLButtonElement).disabled = false;
  } catch {
    detection.innerHTML = `
      <div class="line warn">⚠ Context Lens is not active on this page.</div>
      <div class="preview">It runs on X, Reddit, and YouTube. Reload the page after installing, then try again.</div>`;
    ($('analyzeCurrent') as HTMLButtonElement).disabled = true;
  }
}

function renderLauncher(): void {
  const actions = $('actions');
  actions.innerHTML = '';
  for (const a of LAUNCHER_ACTIONS) {
    const def = TASKS[a.task];
    const btn = document.createElement('button');
    btn.className = `action${a.task === 'discussion' ? ' wide' : ''}`;
    if (!def.enabled) btn.disabled = true;
    btn.innerHTML = `<span class="emoji">${a.emoji}</span><span class="label">${def.label}</span><span class="sub">${a.sub}</span>`;
    btn.onclick = () => void runFromPopup(a.task);
    actions.append(btn);
  }

  // AI status row
  const status = $('status');
  const chips = PROVIDER_INFO.map(({ id, label }) => {
    const has = Boolean(settings.keys[id]?.apiKey);
    return `<span class="chip ${has ? 'good' : 'off'}">${label} ${has ? '✓' : '—'}</span>`;
  }).join('');
  const configured = PROVIDER_INFO.filter((p) => settings.keys[p.id]?.apiKey).length;
  status.innerHTML = `<span>AI: ${settings.aiMode}</span>${chips}${
    configured === 0 ? '<span style="color:#eec37e">· add a key in ⚙ Settings</span>' : ''
  }`;
}

async function runFromPopup(task: TaskId): Promise<void> {
  if (tabId == null) return;
  await chrome.tabs.sendMessage(tabId, { type: 'RUN_FROM_POPUP', task }).catch(() => undefined);
  window.close();
}

// ---------------- settings view ----------------

function renderSettings(): void {
  // provider cards: key + base URL + deep/fast model ids + docs link
  const wrap = $('providers');
  wrap.innerHTML = '';
  for (const p of PROVIDER_INFO) {
    const cfg = settings.keys[p.id] ?? {};
    const div = document.createElement('div');
    div.className = 'prov';
    div.innerHTML = `
      <div class="row">
        <span class="name">${p.label}</span>
        <span class="status idle" data-status="${p.id}">—</span>
      </div>
      <div class="fields">
        <div class="full">
          <label>API key</label>
          <input type="password" data-key="${p.id}" placeholder="Paste your ${p.label} key" value="${escapeHtml(cfg.apiKey ?? '')}" />
        </div>
        <div class="full">
          <label>Base URL</label>
          <input type="text" data-baseurl="${p.id}" placeholder="${escapeHtml(p.baseUrl)}" value="${escapeHtml(cfg.baseUrl ?? '')}" />
        </div>
        <div>
          <label>Model (deep)</label>
          <input type="text" data-model="${p.id}" placeholder="${escapeHtml(p.defaultModel)}" value="${escapeHtml(cfg.model ?? '')}" />
        </div>
        <div>
          <label>Model (fast)</label>
          <input type="text" data-fastmodel="${p.id}" placeholder="${escapeHtml(p.fastModel)}" value="${escapeHtml(cfg.fastModel ?? '')}" />
        </div>
      </div>
      <div class="meta">Key &amp; model ids: <a href="${p.docsUrl}" target="_blank" rel="noreferrer">${p.docsUrl.replace(/^https:\/\//, '')}</a> — leave fields empty to use the defaults.</div>`;
    wrap.append(div);
  }

  // modes
  const modes = $('modes');
  modes.innerHTML = '';
  for (const m of AI_MODES) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="aiMode" value="${m}" ${settings.aiMode === m ? 'checked' : ''} /> ${m}`;
    modes.append(label);
  }

  // caption styles
  const sel = $('captionStyle') as HTMLSelectElement;
  sel.innerHTML = CAPTION_STYLES.map((s) => `<option value="${s.id}" ${settings.captionStyle === s.id ? 'selected' : ''}>${s.emoji} ${s.label}</option>`).join('');

  ($('styleProfile') as HTMLTextAreaElement).value = settings.styleProfile;
  ($('redact') as HTMLInputElement).checked = settings.redactAuthors;
  ($('includeParent') as HTMLInputElement).checked = settings.behavior.includeParent;
  ($('includeReplies') as HTMLInputElement).checked = settings.behavior.includeReplies;
}

$('save').addEventListener('click', async () => {
  settings.keys = {};
  for (const p of PROVIDER_INFO) {
    const key = (document.querySelector(`input[data-key="${p.id}"]`) as HTMLInputElement | null)?.value.trim() ?? '';
    if (!key) continue;
    const baseUrl = (document.querySelector(`input[data-baseurl="${p.id}"]`) as HTMLInputElement).value.trim();
    const model = (document.querySelector(`input[data-model="${p.id}"]`) as HTMLInputElement).value.trim();
    const fastModel = (document.querySelector(`input[data-fastmodel="${p.id}"]`) as HTMLInputElement).value.trim();
    settings.keys[p.id] = {
      apiKey: key,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
      fastModel: fastModel || undefined,
    };
  }
  settings.aiMode = (document.querySelector('input[name="aiMode"]:checked') as HTMLInputElement)?.value as AiMode;
  settings.captionStyle = ($('captionStyle') as HTMLSelectElement).value as Settings['captionStyle'];
  settings.styleProfile = ($('styleProfile') as HTMLTextAreaElement).value;
  settings.redactAuthors = ($('redact') as HTMLInputElement).checked;
  settings.behavior = {
    includeParent: ($('includeParent') as HTMLInputElement).checked,
    includeReplies: ($('includeReplies') as HTMLInputElement).checked,
  };
  settings.providerOrder = DEFAULT_SETTINGS.providerOrder.filter((p) => settings.keys[p]);
  await chrome.storage.local.set({ settings });
  const msg = $('msg');
  if (settings.providerOrder.length === 0) {
    msg.textContent = 'Saved — but add at least one API key to use Context Lens.';
    msg.className = 'msg err';
  } else {
    msg.textContent = 'Saved ✓';
    msg.className = 'msg ok';
  }
  renderLauncher();
});

$('testBtn').addEventListener('click', async () => {
  ($('testResult') as HTMLElement).textContent = 'Testing…';
  const resp = (await chrome.runtime.sendMessage({ type: 'TEST_PROVIDERS' })) as ProviderHealthMessage;
  if (!resp?.results) {
    ($('testResult') as HTMLElement).textContent = 'Test failed.';
    return;
  }
  for (const r of resp.results) {
    const el = document.querySelector(`[data-status="${r.id}"]`) as HTMLElement | null;
    if (el) {
      el.textContent = r.ok ? `✓ ${r.ms} ms` : `✗ ${r.error ?? 'failed'}`;
      el.className = `status ${r.ok ? 'ok' : 'err'}`;
    }
  }
  ($('testResult') as HTMLElement).textContent = resp.results.every((r) => r.ok) ? 'All good ✓' : '';
});

$('openSettings').addEventListener('click', () => {
  ($('launcher') as HTMLElement).style.display = 'none';
  ($('settingsView') as HTMLElement).style.display = 'block';
});

$('backBtn').addEventListener('click', () => {
  ($('settingsView') as HTMLElement).style.display = 'none';
  ($('launcher') as HTMLElement).style.display = 'block';
});

$('analyzeCurrent').addEventListener('click', () => void runFromPopup('understand'));

$('selfTest').addEventListener('click', async () => {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SELFTEST' });
    ($('selfTestHint') as HTMLElement).textContent = 'running in the page — check the panel';
    setTimeout(() => (($('selfTestHint') as HTMLElement).textContent = 'runs without AI — checks the full pipeline'), 4000);
  } catch {
    ($('selfTestHint') as HTMLElement).textContent = '✗ content script unreachable — reload the page';
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

init();
