import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FolderInput, Pencil, Pin, ScrollText, Share, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/stories/frames';
import { List, ListRowContent, RowIcon } from './list';
import { ActionRow, type RowAction } from './row-actions';
import { Toaster, toastWithUndo } from './toaster';

const DOCS = ['Q4 roadmap memo', 'Lagos launch plan', 'Pricing review notes', 'Support playbook'];

function ActionRowsDemo() {
  const [docs, setDocs] = useState(DOCS);
  const actionsFor = (title: string): RowAction[] => [
    { id: 'pin', label: 'Pin', icon: Pin, swipe: 'leading', tone: 'orange', onSelect: () => {} },
    {
      id: 'share',
      label: 'Share',
      icon: Share,
      swipe: 'trailing',
      tone: 'blue',
      onSelect: () => {},
    },
    {
      id: 'move',
      label: 'Move',
      icon: FolderInput,
      swipe: 'trailing',
      tone: 'indigo',
      onSelect: () => {},
    },
    { id: 'rename', label: 'Rename', icon: Pencil, onSelect: () => {} },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      swipe: 'trailing',
      tone: 'red',
      onSelect: () => {
        setDocs((d) => d.filter((x) => x !== title));
        toastWithUndo(`Deleted “${title}”`, () => setDocs(DOCS));
      },
    },
  ];
  return (
    <Page width={393}>
      <List header="All documents">
        {docs.map((title) => (
          <ActionRow
            key={title}
            label={title}
            actions={actionsFor(title)}
            preview={
              <div className="p-4">
                <p className="text-headline">{title}</p>
                <p className="mt-1 text-callout text-muted-foreground">
                  Launch with five design partners in November; three risks named with owners.
                </p>
              </div>
            }
          >
            <ListRowContent
              href={`#${title}`}
              leading={<RowIcon icon={ScrollText} />}
              title={title}
              subtitle="2 h ago, Amaka Obi"
            />
          </ActionRow>
        ))}
      </List>
      <Toaster />
    </Page>
  );
}

const meta = {
  title: 'Components/ActionRow',
  component: ActionRowsDemo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Every secondary action on a row: swipe left for Share, Move and Delete (a full swipe deletes, with Undo), swipe right to Pin, long-press to lift a preview with the menu (slide onto an action and let go), right-click with a mouse, and a "…" button for keyboards and screen readers.',
      },
    },
  },
} satisfies Meta<typeof ActionRowsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Try it with touch emulation (swipe, long-press) or a mouse (right-click, hover for "…"). */
export const Rows: Story = {};
