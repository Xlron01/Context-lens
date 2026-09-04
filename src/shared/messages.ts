import type { CanonicalNode } from '../core/canonical';

/** Content script → background: run an AI task on the clicked node. */
export interface RunTaskMessage {
  type: 'RUN_TASK';
  task: 'explain' | 'thread';
  target: CanonicalNode;
  items: { label: string; node: CanonicalNode }[];
  truncated: boolean;
  platform: string;
  pageUrl: string;
  pageTitle: string;
}

/** Background → content: result of a RUN_TASK. */
export interface TaskResultMessage {
  type: 'TASK_RESULT';
  ok: boolean;
  headline?: string;
  sections?: { title: string; body: string; confidence: string }[];
  provider?: string;
  model?: string;
  error?: string;
  truncated?: boolean;
}

export type ExtensionMessage = RunTaskMessage | TaskResultMessage;
