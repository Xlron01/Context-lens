# Context Lens

A browser extension that helps you understand posts and comment threads **in context**.
Select any post/comment on X (Twitter) or Reddit and ask:

- **Explain this** — what does this mean, in its context?
- **Who is replying to whom?** — thread structure, points of disagreement, where a misunderstanding started.

## Architecture

```
Content script (page)
  ├─ Platform Adapters  →  canonical nodes (X / Reddit / generic fallback)
  ├─ Context Engine     →  graph + resolver + token budgeting (L0→L3)
  └─ Panel UI (shadow DOM)
        ↓ chrome.runtime message
Background service worker
  └─ Model Router  →  Gemini → Groq → NVIDIA → OpenRouter (fallback chain, BYOK)
```

- **Canonical model**: every platform is parsed into `{id, type, text, author, parentId, children, attachments}` — the rest of the system never knows which site it is on.
- **Context budgeting**: the target is always sent in full; parent, root post, sibling branch, and replies are added in priority order under an ~8k-token budget.
- **Provider abstraction**: all providers implement one `AIProvider` interface; the router falls through the chain on failure. No model lock-in.
- **Honesty framing**: results are rendered as *observed* / *inference* / *speculation* sections — the assistant analyzes arguments, not people.

## Build & install (Chrome)

```bash
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder

## Configure

Click the extension icon → paste at least one API key:

| Provider | Free tier | Get a key |
|----------|-----------|-----------|
| Gemini (recommended) | Yes | https://aistudio.google.com |
| Groq | Yes (rate-limited) | https://console.groq.com |
| NVIDIA NIM | Dev credits | https://build.nvidia.com |
| OpenRouter | Some free models | https://openrouter.ai |

Keys are stored in `chrome.storage.local` (Bring-Your-Own-Key; nothing is sent to our servers — there are none).

## Usage

On X or Reddit: right-click any post or comment → **Context Lens: Explain this** or **Context Lens: Who is replying to whom?** The result panel appears top-right.

## Development

```bash
npm run dev        # Vite dev server with extension hot reload
npm test           # Vitest unit tests
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
```

## Scope (Phase 1)

Done: Explain + Thread tasks, X + Reddit adapters (+ generic fallback), context engine with budgeting, provider fallback chain, BYOK popup, result panel.

Next phases: Facebook-specific adapter, Fact-check / Research / Argument pipelines (search layer), Caption generation, optional backend gateway + local models, Firefox build.
