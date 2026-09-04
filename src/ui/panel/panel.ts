import type { TaskResultMessage } from '../../shared/messages';

const HOST_ID = 'context-lens-host';

const CSS = `
  :host { all: initial; }
  .panel {
    position: fixed; top: 16px; right: 16px; width: 380px; max-height: 70vh;
    overflow-y: auto; z-index: 2147483647;
    background: #1c1c22; color: #eee; font: 14px/1.5 system-ui, sans-serif;
    border: 1px solid #3a3a44; border-radius: 12px; padding: 14px 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
  }
  .panel h3 { margin: 0 0 8px; font-size: 15px; color: #fff; }
  .panel .meta { font-size: 11px; color: #888; margin-bottom: 10px; }
  .panel .section { margin: 10px 0; padding: 8px 10px; background: #26262e; border-radius: 8px; }
  .panel .section h4 { margin: 0 0 4px; font-size: 13px; color: #cfcfda; }
  .panel .section p { margin: 0; white-space: pre-wrap; color: #ddd; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; vertical-align: middle; }
  .badge.observed { background: #1d3a2a; color: #7ee2a8; }
  .badge.inference { background: #33291a; color: #eec37e; }
  .badge.speculation { background: #3a1d24; color: #ef9aa8; }
  .error { color: #ef9aa8; }
  .close { float: right; cursor: pointer; background: none; border: none; color: #888; font-size: 16px; }
  .note { font-size: 11px; color: #777; margin-top: 8px; }
`;

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    const panel = document.createElement('div');
    panel.className = 'panel';
    shadow.appendChild(panel);
  }
  return host;
}

export function showPanel(): void {
  ensureHost();
}

export function hidePanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function updatePanel(msg: TaskResultMessage): void {
  const host = ensureHost();
  const panel = host.shadowRoot!.querySelector('.panel') as HTMLElement;
  panel.innerHTML = '';

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '✕';
  close.onclick = hidePanel;
  panel.appendChild(close);

  if (!msg.ok) {
    if (msg.headline) {
      const h = document.createElement('h3');
      h.textContent = msg.headline;
      panel.appendChild(h);
    }
    const err = document.createElement('p');
    err.className = 'error';
    err.textContent = msg.error ?? 'Unknown error.';
    panel.appendChild(err);
    return;
  }

  const h = document.createElement('h3');
  h.textContent = msg.headline || 'Result';
  panel.appendChild(h);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${msg.provider ?? ''} · ${msg.model ?? ''}${msg.truncated ? ' · context truncated' : ''}`;
  panel.appendChild(meta);

  for (const s of msg.sections ?? []) {
    const box = document.createElement('div');
    box.className = 'section';
    const title = document.createElement('h4');
    title.textContent = s.title;
    const badge = document.createElement('span');
    badge.className = `badge ${s.confidence}`;
    badge.textContent = s.confidence;
    title.appendChild(badge);
    const body = document.createElement('p');
    body.textContent = s.body;
    box.appendChild(title);
    box.appendChild(body);
    panel.appendChild(box);
  }

  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = 'Observed = explicitly written · Inference = strongly implied · Speculation = uncertain';
  panel.appendChild(note);
}
