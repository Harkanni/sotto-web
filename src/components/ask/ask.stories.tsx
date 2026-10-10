import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import type { ChatMessage, Conversation } from '@/lib/api/ask';
import { ConversationView } from '@/screens/ask';
import { Composer, SCOPES, type Mention } from '@/screens/parts/composer';
import { STAND_IN_CHAT, standInAnswer } from '@/stories/ask-fixtures';
import { Page } from '@/stories/frames';

/**
 * Ask's chat (Phase 5): a question on the right, the answer with its data-route badge, numbered
 * citations that open the source, the sources, actions and follow-ups. One story per state an
 * answer can be in.
 */
const meta = {
  title: 'Ask/Chat',
  component: ConversationView,
  args: {
    chat: STAND_IN_CHAT,
    base: '/ask',
    regenerating: null,
    onAgain: () => {},
    onAsk: () => {},
  },
  decorators: [
    (Story) => (
      <Page width={420}>
        <Story />
      </Page>
    ),
  ],
} satisfies Meta<typeof ConversationView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A chat with one answer in a given state. */
function chatWith(answer: Partial<ChatMessage>): Conversation {
  return { ...STAND_IN_CHAT, messages: [STAND_IN_CHAT.messages[0]!, standInAnswer(answer)] };
}

export const Answered: Story = {};

/** Being written: the words glide in, a caret follows them, Stop replaces Send below. */
export const Streaming: Story = {
  args: {
    chat: chatWith({
      status: 'streaming',
      content: 'The launch plan names three risks: connectivity on field visits [1], data',
      followUps: [],
      citations: [standInAnswer().citations[0]!],
    }),
  },
};

/** Before the first words: retrieval is running. */
export const Thinking: Story = {
  args: { chat: chatWith({ status: 'streaming', content: '', citations: [], followUps: [] }) },
};

/** No AI model on this server: the passages that match best, labelled as such. */
export const PassagesOnly: Story = {
  args: {
    chat: chatWith({
      content: '',
      model: 'none',
      passagesOnly: true,
      route: { kind: null, label: 'Passages only · no AI model' },
      followUps: [],
    }),
  },
};

/** Nothing in the library answers it: said plainly, no guessing, nothing to cite. */
export const NotFound: Story = {
  args: { chat: chatWith({ content: '', notFound: true, citations: [], followUps: [] }) },
};

/** An outside model answered: what it wasn't allowed to read is counted. */
export const HiddenSources: Story = {
  args: {
    chat: chatWith({
      route: { kind: 'managed', label: 'Managed · Hosted model' },
      hidden: { restricted: 2, confidential: 1 },
    }),
  },
};

/** The model didn't answer: why, and Try again. Nothing was sent anywhere else. */
export const Failed: Story = {
  args: {
    chat: chatWith({
      status: 'failed',
      content: '',
      citations: [],
      followUps: [],
      error: {
        code: 'chat_unavailable',
        message:
          'The model that answers questions isn’t responding. Nothing was sent anywhere else. Try again in a moment.',
      },
    }),
  },
};

/** Stopped part-way: what arrived is kept, and a cited source is no longer available. */
export const StoppedWithHiddenSource: Story = {
  args: {
    chat: chatWith({
      status: 'stopped',
      content: 'The launch plan names three risks: connectivity on field visits [1] and',
      followUps: [],
      citations: [
        {
          n: 1,
          available: false,
          fileId: null,
          kind: null,
          title: null,
          page: null,
          startMs: null,
          endMs: null,
          quote: null,
        },
      ],
    }),
  },
};

function ComposerDemo({ running = false, picked = [] as Mention[] }) {
  const [scope, setScope] = useState('all');
  const [mentions, setMentions] = useState<Mention[]>(picked);
  return (
    <div className="w-[390px] bg-background pt-6">
      <Composer
        onSend={() => {}}
        scope={scope}
        onScopeChange={setScope}
        scopes={[...SCOPES, { value: 'c:product', label: 'Product' }]}
        mentions={mentions}
        onMentionsChange={setMentions}
        running={running}
        onStop={() => {}}
      />
    </div>
  );
}

/** The composer: scope chips above, @ to pick files, Send in thumb reach. */
export const ComposerIdle: StoryObj = { render: () => <ComposerDemo /> };

/** Files picked with @ replace the scope chips; each can be removed. */
export const ComposerWithFiles: StoryObj = {
  render: () => (
    <ComposerDemo
      picked={[
        { id: 'f_launch', title: 'Lagos launch plan', kind: 'document' },
        { id: 'f_weekly', title: 'Weekly product sync', kind: 'audio' },
      ]}
    />
  ),
};

/** While an answer is written, Send becomes Stop. */
export const ComposerRunning: StoryObj = { render: () => <ComposerDemo running /> };
