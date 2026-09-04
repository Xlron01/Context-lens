import { CAPTION_STYLES, type CaptionStyle } from '../../ai/tasks';
import type { TaskResultMessage } from '../../shared/messages';

const HOST_ID = 'context-lens-host';

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel {
    position: fixed; top: 16px; right: 16px; width: 400px; max-height: 78vh;
    display: flex; flex-direction: column;
    z-index: 2147483647;
    background: #1c1c22; color: #eee; font: 14px/1.5 system-ui, sans-serif;
    border: 1px solid #3a3a44; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
  }
  .head { display:flex; align-items:center; gap:8px; padding: 12px 16px 8px; }
  .head h3 { margin: 0; font-size: 15px; color: #fff; flex: 1; }
  .body { overflow-y: auto; padding: 0 16px 12px; }
  .close { cursor: pointer; background: none; border: none; color: #888; font-size: 16px; padding: 2px 6px; }
  .close:hover { color: #fff; }

  .pipeline { margin: 4px 0 10px; padding: 8px 10px; background: #22222a; border-radius: 8px; font-size: 12px; }
  .step { display: flex; gap: 8px; padding: 2px 0; align-items: baseline; }
  .step .mark { width: 16px; text-align: center; flex: none; }
  .step.done .mark { color: #7ee2a8; }
  .step.active .mark { color: #eec37e; }
  .step.failed .mark { color: #ef9aa8; }
  .step .detail { color: #999; }
  .step.failed .detail { color: #ef9aa8; }

  .section { margin: 10px 0; padding: 8px 10px; background: #26262e; border-radius: 8px; }
  .section h4 { margin: 0 0 4px; font-size: 13px; color: #cfcfda; }
  .section p { margin: 0; white-space: pre-wrap; color: #ddd; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; vertical-align: middle; text-transform: uppercase; }
  .badge.observed { background: #1d3a2a; color: #7ee2a8; }
  .badge.inference { background: #33291a; color: #eec37e; }
  .badge.speculation { background: #3a1d24; color: #ef9aa8; }
  .error { color: #ef9aa8; white-space: pre-wrap; }

  .context-used { margin-top: 10px; padding: 8px 10px; background: #202028; border-radius: 8px; font-size: 12px; color: #aaa; }
  .context-used b { color: #ccc; display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .context-used .line { display: flex; gap: 6px; }
  .context-used .line .k { color: #888; min-width: 64px; }

  .captions { display: flex; flex-direction: column; gap: 8px; }
  .caption { display: flex; gap: 8px; align-items: stretch; background: #26262e; border-radius: 8px; padding: 8px 10px; }
  .caption p { flex: 1; margin: 0; white-space: pre-wrap; }
  .caption button { align-self: center; }

  .styles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .styles button { padding: 8px; }

  .actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .note { font-size: 11px; color: #777; margin-top: 8px; }
  button.act {
    background: #33333e; color: #eee; border: 1px solid #44444f; border-radius: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 13px;
  }
  button.act:hover { background: #3d3d4a; }
  button.act.primary { background: #4c5bd4; border-color: #4c5bd4; }
  button.act.primary:hover { background: #5a69e0; }
  button.act:disabled { opacity: .45; cursor: default; }
`;

type StepState = 'pending' | 'active' | 'done' | 'failed';
interface Step {
  id: string;
  label: string;
  state: StepState;
  detail?: string;
}

function ensurePanel(): { host: HTMLElement; panel: HTMLElement; body: HTMLElement; titleEl: HTMLElement } {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    // Full structure: panel > head(title + close) + body(scroll area).
    const panelEl = document.createElement('div');
    panelEl.className = 'panel';

    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('h3');
    title.textContent = 'Context Lens';
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.onclick = () => host?.remove();
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'body';

    panelEl.append(head, body);
    shadow.appendChild(panelEl);
  }
  const shadow = host.shadowRoot!;
  const panel = shadow.querySelector('.panel') as HTMLElement;
  return {
    host,
    panel,
    body: shadow.querySelector('.body') as HTMLElement,
    titleEl: shadow.querySelector('.head h3') as HTMLElement,
  };
}

export interface PanelUi {
  open(title: string): void;
  close(): void;
  setSteps(steps: Step[]): void;
  renderResult(msg: TaskResultMessage): void;
  renderCaptionChooser(onPick: (style: CaptionStyle) => void): void;
  renderCaptions(captions: string[], onMore: () => void): void;
  /** Show the exact context package that was (or would be) sent to the model. */
  renderContextPackage(text: string): void;
}

export function createPanel(): PanelUi {
  const api: PanelUi = {
    open(title: string) {
      const { panel, body, titleEl } = ensurePanel();
      titleEl.textContent = title;
      body.innerHTML = '';
      panel.hidden = false;
    },
    close() {
      document.getElementById(HOST_ID)?.remove();
    },
    setSteps(steps: Step[]) {
      const { body } = ensurePanel();
      let box = body.querySelector('.pipeline') as HTMLElement | null;
      if (!box) {
        box = document.createElement('div');
        box.className = 'pipeline';
        body.prepend(box);
      }
      box.innerHTML = '';
      for (const s of steps) {
        const line = document.createElement('div');
        line.className = `step ${s.state}`;
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = s.state === 'done' ? '✓' : s.state === 'active' ? '⟳' : s.state === 'failed' ? '✗' : '·';
        const label = document.createElement('span');
        label.textContent = s.label;
        line.append(mark, label);
        if (s.detail) {
          const d = document.createElement('span');
          d.className = 'detail';
          d.textContent = ` — ${s.detail}`;
          line.append(d);
        }
        box.append(line);
      }
    },
    renderResult(msg: TaskResultMessage) {
      const { body } = ensurePanel();
      if (!msg.ok) {
        const err = document.createElement('p');
        err.className = 'error';
        const e = msg.error as { code?: string; message?: string } | string | undefined;
        const text =
          typeof e === 'object' && e !== null
            ? `[${e.code}] ${e.message ?? ''}`
            : (e as string) ?? 'Unknown error.';
        err.textContent = `✗ ${text}`;
        body.append(err);
        return;
      }

      if (msg.captions && msg.captions.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'captions';
        for (const c of msg.captions) {
          const row = document.createElement('div');
          row.className = 'caption';
          const p = document.createElement('p');
          p.textContent = c;
          const btn = document.createElement('button');
          btn.className = 'act';
          btn.textContent = 'Copy';
          btn.onclick = () => {
            navigator.clipboard.writeText(c);
            btn.textContent = 'Copied ✓';
            setTimeout(() => (btn.textContent = 'Copy'), 1200);
          };
          row.append(p, btn);
          wrap.append(row);
        }
        body.append(wrap);
      } else {
        for (const s of msg.sections ?? []) {
          const box = document.createElement('div');
          box.className = 'section';
          const title = document.createElement('h4');
          title.textContent = s.title;
          const badge = document.createElement('span');
          badge.className = `badge ${s.confidence}`;
          badge.textContent = s.confidence;
          title.appendChild(badge);
          const content = document.createElement('p');
          content.textContent = s.body;
          box.append(title, content);
          body.append(box);
        }
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = 'Observed = explicitly written · Inference = strongly implied · Speculation = uncertain';
        body.append(note);
      }

      const meta = [msg.provider, msg.model, msg.ms != null ? `${msg.ms} ms` : null, msg.truncated ? 'context truncated' : null]
        .filter(Boolean)
        .join(' · ');
      if (meta) {
        const m = document.createElement('div');
        m.className = 'note';
        m.textContent = meta;
        body.append(m);
      }

      if (msg.contextSummary) {
        const box = document.createElement('div');
        box.className = 'context-used';
        const b = document.createElement('b');
        b.textContent = 'Context used';
        box.append(b);
        const rows: [string, string][] = [
          ['🎯 Target', msg.contextSummary.targetLabel],
          ['📎 Context', msg.contextSummary.items.length > 0 ? msg.contextSummary.items.join(', ') : 'None found'],
          ['🖼 Attachments', String(msg.contextSummary.attachments)],
          ['🌐 Research', msg.contextSummary.research],
        ];
        for (const [k, v] of rows) {
          const line = document.createElement('div');
          line.className = 'line';
          const kk = document.createElement('span');
          kk.className = 'k';
          kk.textContent = k;
          const vv = document.createElement('span');
          vv.textContent = v;
          line.append(kk, vv);
          box.append(line);
        }
        body.append(box);
      }

      if (msg.captions && msg.captions.length > 0) {
        const actions = document.createElement('div');
        actions.className = 'actions';
        const more = document.createElement('button');
        more.className = 'act';
        more.textContent = '↻ Generate more';
        more.onclick = () => (window as unknown as { __clMore?: () => void }).__clMore?.();
        actions.append(more);
        body.append(actions);
      }
    },
    renderCaptionChooser(onPick: (style: CaptionStyle) => void) {
      const { body } = ensurePanel();
      const q = document.createElement('p');
      q.textContent = 'What kind of caption?';
      body.append(q);
      const grid = document.createElement('div');
      grid.className = 'styles';
      for (const s of CAPTION_STYLES) {
        const btn = document.createElement('button');
        btn.className = 'act';
        btn.textContent = `${s.emoji} ${s.label}`;
        btn.onclick = () => onPick(s.id);
        grid.append(btn);
      }
      body.append(grid);
    },
    renderContextPackage(text: string) {
      const { body } = ensurePanel();
      const details = document.createElement('details');
      details.style.marginTop = '8px';
      const summary = document.createElement('summary');
      summary.textContent = '🐞 View context package';
      summary.style.cssText = 'cursor:pointer;font-size:12px;color:#999;';
      const pre = document.createElement('pre');
      pre.style.cssText =
        'max-height:260px;overflow:auto;background:#151519;border:1px solid #33333e;border-radius:8px;padding:8px;font-size:11px;white-space:pre-wrap;color:#bbb;';
      pre.textContent = text;
      details.append(summary, pre);
      body.append(details);
    },
    renderCaptions(captions: string[], onMore: () => void) {
      const { body } = ensurePanel();
      const wrap = document.createElement('div');
      wrap.className = 'captions';
      for (const c of captions) {
        const row = document.createElement('div');
        row.className = 'caption';
        const p = document.createElement('p');
        p.textContent = c;
        const btn = document.createElement('button');
        btn.className = 'act';
        btn.textContent = 'Copy';
        btn.onclick = () => {
          navigator.clipboard.writeText(c);
          btn.textContent = 'Copied ✓';
          setTimeout(() => (btn.textContent = 'Copy'), 1200);
        };
        row.append(p, btn);
        wrap.append(row);
      }
      body.append(wrap);
      const actions = document.createElement('div');
      actions.className = 'actions';
      const more = document.createElement('button');
      more.className = 'act';
      more.textContent = '↻ Generate more';
      more.onclick = onMore;
      actions.append(more);
      body.append(actions);
    },
  };
  return api;
}

// --- standalone helpers kept for compatibility -------------------------

export function showPanel(): void {
  ensurePanel();
}

export function hidePanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function updatePanel(msg: TaskResultMessage): void {
  const { panel, body, titleEl } = ensurePanel();
  panel.hidden = false;
  titleEl.textContent = 'Context Lens';
  body.innerHTML = '';
  const ui = createPanel();
  ui.renderResult(msg);
}

export type { Step };
