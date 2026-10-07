import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Plus } from 'lucide-react';
import type { UploadItem } from '@/lib/uploads/store';
import { Page } from '@/stories/frames';
import { ProgressRing, TransferList } from './transfers';

const meta = {
  title: 'Uploads/Transfers',
  component: TransferList,
  args: { items: [] },
} satisfies Meta<typeof TransferList>;

export default meta;
type Story = StoryObj<typeof meta>;

const MB = 1024 * 1024;
const item = (over: Partial<UploadItem> & Pick<UploadItem, 'id' | 'state'>): UploadItem => ({
  fileId: null,
  name: 'Field research findings.pdf',
  title: 'Field research findings',
  size: 24 * MB,
  sent: 0,
  kind: 'document',
  offline: false,
  error: null,
  final: false,
  ...over,
});

/**
 * Every state a transfer row shows, as in the Add sheet: the bar slides (a translate, never a
 * width) and turns grey when paused; a failure trades the bar for its reason in red, with Retry
 * when trying again can help and Dismiss when it can't.
 */
export const States: Story = {
  args: {
    className: 'surface-elevated bg-card-nested',
    items: [
      item({ id: 'a', state: 'uploading', sent: 9.6 * MB }),
      item({
        id: 'b',
        state: 'queued',
        name: 'Design review.webm',
        title: 'Design review',
        kind: 'audio',
        size: 61 * MB,
      }),
      item({ id: 'c', state: 'paused', sent: 14 * MB, title: 'Pricing review notes' }),
      item({ id: 'd', state: 'paused', offline: true, sent: 3 * MB, title: 'Board pack' }),
      item({ id: 'e', state: 'finishing', sent: 24 * MB, title: 'Security questionnaire' }),
      item({
        id: 'f',
        state: 'failed',
        sent: 2 * MB,
        title: 'Weekly sync',
        kind: 'audio',
        error: 'Part of the file didn’t go through. Retry to send the rest.',
      }),
      item({
        id: 'g',
        state: 'failed',
        final: true,
        title: 'Scanned contract',
        error: 'This file is larger than 2 GB, the most Sotto takes.',
      }),
    ],
  },
  render: (args) => (
    <Page>
      {/* The Add sheet's surface, which the list sits on. */}
      <div className="mx-4 rounded-sheet bg-card p-4 shadow-sheet">
        <TransferList {...args} />
      </div>
    </Page>
  ),
};

/**
 * The ring around the + button (phones) and the sidebar's New icon: overall progress of every
 * upload, weighed by size. It fades in with the first upload and out with the last.
 */
export const ProgressRings: Story = {
  render: () => (
    <Page>
      <div className="flex items-center gap-6 px-4">
        {[0, 0.35, 0.8].map((p) => (
          <span
            key={p}
            className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab"
          >
            <Plus aria-hidden className="col-start-1 row-start-1 size-7" strokeWidth={2.25} />
            <ProgressRing progress={p} size={50} stroke={2.5} className="col-start-1 row-start-1" />
          </span>
        ))}
        <span className="grid size-11 place-items-center rounded-full text-primary-text">
          <Plus aria-hidden className="col-start-1 row-start-1 size-5" strokeWidth={2.25} />
          <ProgressRing progress={0.55} size={28} className="col-start-1 row-start-1" />
        </span>
      </div>
    </Page>
  ),
};
