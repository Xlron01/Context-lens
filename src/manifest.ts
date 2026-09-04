import { defineManifest } from '@crxjs/vite-plugin';

export const manifest = defineManifest({
  manifest_version: 3,
  name: 'Context Lens',
  version: '0.2.0',
  description: 'Understand posts, comments, and threads in context: Understand, Intent, Thread analysis, and captions.',
  permissions: ['contextMenus', 'storage', 'activeTab'],
  host_permissions: [
    'https://twitter.com/*',
    'https://x.com/*',
    'https://reddit.com/*',
    'https://www.reddit.com/*',
    'https://old.reddit.com/*',
    'https://www.youtube.com/*',
    'https://m.youtube.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://integrate.api.nvidia.com/*',
    'https://api.groq.com/*',
    'https://openrouter.ai/*',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [
        'https://twitter.com/*',
        'https://x.com/*',
        'https://reddit.com/*',
        'https://www.reddit.com/*',
        'https://old.reddit.com/*',
        'https://www.youtube.com/*',
        'https://m.youtube.com/*',
      ],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/ui/popup/index.html',
  },
});
