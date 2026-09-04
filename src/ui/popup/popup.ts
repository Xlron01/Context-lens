import { DEFAULT_SETTINGS, type Settings } from '../../ai/router';

const FIELDS = ['gemini', 'groq', 'nvidia', 'openrouter'] as const;

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get(['settings']);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
  for (const id of FIELDS) {
    (document.getElementById(id) as HTMLInputElement).value = settings.keys[id]?.apiKey ?? '';
  }
  (document.getElementById('redact') as HTMLInputElement).checked = settings.redactAuthors;
}

document.getElementById('save')!.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(['settings']);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
  settings.keys = {};
  for (const id of FIELDS) {
    const key = (document.getElementById(id) as HTMLInputElement).value.trim();
    if (key) settings.keys[id] = { apiKey: key };
  }
  settings.redactAuthors = (document.getElementById('redact') as HTMLInputElement).checked;
  // Keep only providers with keys, in default order.
  settings.providerOrder = DEFAULT_SETTINGS.providerOrder.filter((p) => settings.keys[p]);
  await chrome.storage.local.set({ settings });

  const status = document.getElementById('status')!;
  if (settings.providerOrder.length === 0) {
    status.textContent = 'Add at least one API key (Gemini is the easiest free option).';
    status.className = 'status err';
  } else {
    status.textContent = `Saved. Providers: ${settings.providerOrder.join(' → ')}`;
    status.className = 'status ok';
  }
});

load();
