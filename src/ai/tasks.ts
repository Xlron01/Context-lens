/** Task registry: single source of truth for menus, prompts, and routing. */
export type TaskId =
  | 'understand'
  | 'intent'
  | 'thread'
  | 'caption'
  | 'argument'
  | 'verify'
  | 'discussion'
  | 'research';

export type CaptionStyle =
  | 'reaction'
  | 'insight'
  | 'question'
  | 'funny'
  | 'critical'
  | 'professional'
  | 'surprise';

/** How much context a task needs — cheaper tasks must not pay for deep context. */
export type ContextDepth = 'minimal' | 'standard';

export interface TaskDef {
  id: TaskId;
  label: string;
  tagline: string;
  /** V0.1 ships understand/intent/caption/thread; the rest stay visible but disabled ("soon"). */
  enabled: boolean;
  depth: ContextDepth;
}

export const TASKS: Record<TaskId, TaskDef> = {
  understand: {
    id: 'understand',
    label: 'Understand',
    tagline: 'What does this mean here?',
    enabled: true,
    depth: 'standard',
  },
  intent: {
    id: 'intent',
    label: 'What do they mean?',
    tagline: 'Intent, tone, subtext',
    enabled: true,
    depth: 'standard',
  },
  thread: {
    id: 'thread',
    label: 'Who is replying to whom?',
    tagline: 'Thread structure and disagreements',
    enabled: true,
    depth: 'standard',
  },
  caption: {
    id: 'caption',
    label: 'Create repost caption',
    tagline: 'Caption in your style',
    enabled: true,
    depth: 'minimal',
  },
  argument: {
    id: 'argument',
    label: 'Analyze argument',
    tagline: 'Claim → evidence → weakness',
    enabled: false,
    depth: 'standard',
  },
  verify: {
    id: 'verify',
    label: 'Check claims',
    tagline: 'Fact-check with sources',
    enabled: false,
    depth: 'standard',
  },
  discussion: {
    id: 'discussion',
    label: 'Analyze discussion',
    tagline: 'Whole-thread overview',
    enabled: false,
    depth: 'standard',
  },
  research: {
    id: 'research',
    label: 'Research',
    tagline: 'Multi-source deep dive',
    enabled: false,
    depth: 'standard',
  },
};

export const CAPTION_STYLES: { id: CaptionStyle; label: string; emoji: string; instruction: string }[] = [
  { id: 'reaction', label: 'Reaction', emoji: '🔥', instruction: 'A short gut-reaction caption (1-2 sentences), the kind people quote.' },
  { id: 'insight', label: 'Insight', emoji: '🧠', instruction: 'An analytical caption that names the interesting point in one or two sentences.' },
  { id: 'question', label: 'Question', emoji: '❓', instruction: 'A caption that ends with one engaging question the post raises.' },
  { id: 'funny', label: 'Funny', emoji: '😄', instruction: 'A witty, light caption. No meanness, no punching down.' },
  { id: 'critical', label: 'Critical', emoji: '🧐', instruction: 'A skeptical caption pointing at the weakest part of the claim — ideas, not people.' },
  { id: 'professional', label: 'Professional', emoji: '💼', instruction: 'A neutral, professional caption suitable for LinkedIn-style sharing.' },
  { id: 'surprise', label: 'Surprise me', emoji: '🎲', instruction: 'Any angle you find genuinely interesting. Be creative but accurate.' },
];

export const AI_MODES = ['auto', 'fast', 'deep'] as const;
export type AiMode = (typeof AI_MODES)[number];
