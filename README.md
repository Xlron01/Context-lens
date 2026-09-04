# Context Lens

A browser extension that helps you understand posts, comments, and threads **in context** — a lens over the page you're already reading, not another app to learn.

## Interaction model

Four ways in, no workflow to memorize:

1. **Hover** a post or comment → a small ✨ appears → open the action menu
2. **Select text** → ✨ appears next to the selection → Understand it in place
3. **Click the extension icon** → Action launcher: "X / Twitter detected ✓ … What do you want to do?"
4. **Right-click** → Context Lens submenu (fallback)

Every run shows a **visible pipeline** (reading page → found target → built context → asking provider → done/failed with reason). There is no silent state.

Tasks (V0.1): 🧠 Understand · 💬 What do they mean? (intent) · 🧵 Who is replying to whom? (thread) · ✍ Create repost caption (7 styles + "Generate more" + your own style profile). Visible-but-disabled: argument analysis, fact check, discussion, deep research.

## Architecture

```
Content script (page)
  ├─ Platform Adapters  →  canonical nodes (X / Reddit / YouTube / generic fallback)
  ├─ Context Engine     →  graph + resolver (task-specific depth) + token budgeting
  └─ Panel UI (shadow DOM): pipeline status, results, context indicator
        ↓ chrome.runtime message
Background service worker
  └─ Model Router  →  Gemini → Groq → NVIDIA → OpenRouter
       (auto fallback with visible per-provider errors, BYOK, AI mode: auto/fast/deep)
```

- **Canonical model**: every platform is parsed into `{id, type, text, author, parentId, children, attachments}` — the rest of the system never knows which site it is on.
- **Task-specific context**: caption tasks pay for minimal context (target + root post); understand/intent/thread get the standard package — cost scales with the task.
- **Context indicator**: every result shows what the AI actually saw (target, context items, attachments, research usage).
- **Honesty framing**: results render as *observed* / *inference* / *speculation*. Captions never misrepresent the post. Arguments are analyzed, not people.

## Build & install (Chrome)

```bash
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder

## Configure

Click the extension icon → **⚙ Settings**:

- **AI Providers** — paste keys; "Test providers" pings each one and shows latency
- **AI Mode** — Auto (default) / Fast / Deep
- **Behavior** — context toggles, redact author handles
- **Captions** — default style + "My writing style" profile (e.g. "Casual, short, sarcastic, English")

| Provider | Free tier | Get a key |
|----------|-----------|-----------|
| Gemini (recommended) | Yes | https://aistudio.google.com |
| Groq | Yes (rate-limited) | https://console.groq.com |
| NVIDIA NIM | Dev credits | https://build.nvidia.com |
| OpenRouter | Some free models | https://openrouter.ai |

🔑 Keys are stored locally in `chrome.storage.local` (Bring-Your-Own-Key). Nothing is sent anywhere except the providers you configure.

## Development

```bash
npm run dev        # Vite dev server with extension hot reload
npm test           # Vitest unit tests
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
```

## Roadmap

- **V0.1 (done)**: Understand, Intent, Thread, Captions, floating ✨ lens, action launcher, visible pipeline, provider health
- **V0.2**: Argument analysis
- **V0.3**: Fact checking (claim extraction → search → evidence → verdict)
- **V0.4**: Deep research
- **Later**: Facebook/LinkedIn adapters, generic article mode, backend gateway option, Firefox build

