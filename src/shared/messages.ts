import type { CanonicalNode } from '../core/canonical';
import type { TaskId, CaptionStyle } from '../ai/tasks';

/** Unified error contract — the UI renders exactly this. */
export interface LensError {
  code:
    | 'NO_PROVIDER'
    | 'PROVIDER_AUTH'
    | 'PROVIDER_RATE_LIMIT'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_FAILED'
    | 'CONTEXT_NOT_FOUND'
    | 'PARSE_FAILED'
    | 'PIPELINE_BROKEN';
  message: string;
  provider?: string;
  retryable?: boolean;
}

/** Content script → background: run an AI task on a resolved context package. */
export interface RunTaskMessage {
  type: 'RUN_TASK';
  task: TaskId;
  style?: CaptionStyle;
  variation?: number;
  target: CanonicalNode;
  items: { label: string; node: CanonicalNode }[];
  truncated: boolean;
  platform: string;
  pageUrl: string;
  pageTitle: string;
}

/** Background → content: streaming pipeline updates while a task runs. */
export interface ProgressMessage {
  type: 'TASK_PROGRESS';
  kind: 'ask' | 'provider-failed' | 'fallback' | 'done';
  provider?: string;
  detail?: string;
}

/** Background → content: final result. */
export interface TaskResultMessage {
  type: 'TASK_RESULT';
  ok: boolean;
  task?: TaskId;
  headline?: string;
  sections?: { title: string; body: string; confidence: string }[];
  captions?: string[];
  provider?: string;
  model?: string;
  ms?: number;
  /** Context indicator shown under the result ("what did the AI see"). */
  contextSummary?: { targetLabel: string; items: string[]; attachments: number; research: string };
  error?: LensError;
  truncated?: boolean;
}

/** Content → background: deterministic no-AI pipeline check. */
export interface PingMessage {
  type: 'PING';
}

export interface PongMessage {
  type: 'PONG';
  at: number;
}

/** Popup → content script: what can you see on this page? */
export interface DescribePageMessage {
  type: 'DESCRIBE_PAGE';
}

export interface PageInfoMessage {
  type: 'PAGE_INFO';
  supported: boolean;
  platform: string;
  pageTitle: string;
  url: string;
  stats: { posts: number; comments: number; images: number };
  primary?: { type: string; author: string; preview: string };
}

/** Popup → content script: run a task on the page's primary target. */
export interface RunFromPopupMessage {
  type: 'RUN_FROM_POPUP';
  task: TaskId;
}

/** Popup → background: ping all configured providers. */
export interface TestProvidersMessage {
  type: 'TEST_PROVIDERS';
}

export interface ProviderHealthMessage {
  type: 'PROVIDER_HEALTH';
  results: { id: string; ok: boolean; ms: number; error?: string }[];
}

export type ContentToBackground = RunTaskMessage | TestProvidersMessage | DescribePageMessage | RunFromPopupMessage;
export type BackgroundToContent = ProgressMessage | TaskResultMessage | PageInfoMessage;
