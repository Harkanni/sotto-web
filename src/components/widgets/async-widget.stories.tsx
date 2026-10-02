import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { List, ListRow } from '@/components/ui/list';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, OfflineError } from '@/lib/sample/api';
import { AsyncWidget, EmptyState, ErrorState } from './async-widget';
import { Illustration, type IllustrationName } from './illustrations';

type State = 'loading' | 'empty' | 'error' | 'offline' | 'content';

const FILES = ['Q4 roadmap memo', 'Lagos launch plan', 'Pricing review notes'];

/** A real query whose answer the story decides, so AsyncWidget runs exactly as in the app. */
function RecentFiles({ state }: { state: State }) {
  const query = useQuery({
    queryKey: ['story', 'recent-files', state],
    retry: false,
    queryFn: (): Promise<string[]> => {
      if (state === 'loading') return new Promise(() => {});
      if (state === 'error')
        return Promise.reject(new ApiError('Server error', 'req_8f2c1a9d04be'));
      if (state === 'offline') return Promise.reject(new OfflineError());
      return Promise.resolve(state === 'empty' ? [] : FILES);
    },
  });
  return (
    <section aria-label="Recent files" className="w-[380px]">
      <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">Recent files</h2>
      <AsyncWidget
        query={query}
        label="Recent files"
        errorTitle="Couldn’t load recent files"
        className="overflow-hidden rounded-card bg-card"
        empty={{
          illustration: 'docs',
          title: 'No files yet',
          description: 'Upload a memo or a PDF and it shows up here.',
          action: (
            <Button variant="secondary" icon={<Plus aria-hidden />}>
              Upload files
            </Button>
          ),
        }}
        skeleton={
          <div className="flex flex-col gap-4 p-4">
            {FILES.map((f) => (
              <div key={f} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-[60%]" />
                <Skeleton className="h-3 w-[36%]" />
              </div>
            ))}
          </div>
        }
      >
        {(files) => (
          <List className="px-0">
            {files.map((f) => (
              <ListRow key={f} title={f} subtitle="2 h ago, Amaka Obi" href={`#${f}`} />
            ))}
          </List>
        )}
      </AsyncWidget>
    </section>
  );
}

const meta = {
  title: 'Widgets/AsyncWidget',
  component: RecentFiles,
  args: { state: 'content' },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['loading', 'empty', 'error', 'offline', 'content'],
    },
  },
} satisfies Meta<typeof RecentFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The skeleton mirrors the rows, appears only after 150 ms and stays at least 300 ms. */
export const Loading: Story = { args: { state: 'loading' } };
/** One illustration, a title, one line of help and one action. */
export const Empty: Story = { args: { state: 'empty' } };
/** Plain words, a Retry that refetches only this widget, and the request ID under Details. */
export const Failed: Story = { name: 'Error', args: { state: 'error' } };
export const Offline: Story = { args: { state: 'offline' } };
export const Content: Story = { args: { state: 'content' } };

/** Time-filtered widgets say so, and offer to change the range. */
export const NoDataForPeriod: Story = {
  render: () => (
    <div className="w-[380px] rounded-card bg-card">
      <EmptyState
        illustration="period"
        title="No data for this period"
        description="Nothing was recorded this year yet."
        action={<Button variant="ghost">Show this month</Button>}
      />
    </div>
  ),
};

export const ErrorWithoutRetry: Story = {
  render: () => (
    <div className="w-[380px] rounded-card bg-card">
      <ErrorState title="Couldn’t load this chat" requestId="req_41d09c7aa2f1" />
    </div>
  ),
};

const NAMES: IllustrationName[] = [
  'docs',
  'recordings',
  'chats',
  'tasks',
  'search',
  'period',
  'offline',
  'error',
  'processing',
];

/** One line style, in the accent colour, drawn inline so it follows the theme. */
export const Illustrations: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      {NAMES.map((name) => (
        <figure
          key={name}
          className="flex flex-col items-center gap-2 rounded-card bg-card p-4 text-footnote text-muted-foreground"
        >
          <Illustration name={name} className="h-auto w-24 text-primary-text" />
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
};
