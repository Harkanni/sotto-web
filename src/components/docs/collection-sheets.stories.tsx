import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { STORY_COLLECTIONS } from '@/stories/fixtures';
import { AccessSheet } from './access-sheet';
import { CreateCollectionSheet, RenameCollectionSheet } from './collection-sheets';

const meta = {
  title: 'Docs/Collection sheets',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: 'iphone15' } };
const board = STORY_COLLECTIONS.find((c) => c.id === 'col_board')!;

function Demo({ which }: { which: 'create' | 'rename' | 'access' }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      {which === 'create' && <CreateCollectionSheet open={open} onOpenChange={setOpen} />}
      {which === 'rename' && (
        <RenameCollectionSheet collection={board} open={open} onOpenChange={setOpen} />
      )}
      {which === 'access' && <AccessSheet collection={board} open={open} onOpenChange={setOpen} />}
    </>
  );
}

/** A name, and whether it starts restricted. */
export const NewCollection: Story = { render: () => <Demo which="create" /> };

export const Rename: Story = { render: () => <Demo which="rename" /> };

/**
 * Who can open "Board and finance": restricted, viewers can view by role, Tunde edits by name,
 * and Ada (the owner who made it) always manages. Save turns on once something changes.
 */
export const WhoHasAccess: Story = { render: () => <Demo which="access" /> };

export const WhoHasAccessPhone: Story = {
  name: 'Who has access (phone)',
  tags: ['phone'],
  globals: PHONE,
  render: () => <Demo which="access" />,
};
