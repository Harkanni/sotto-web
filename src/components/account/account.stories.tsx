import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Page } from '@/stories/frames';
import { CreateWorkspaceSheet } from './workspace-actions';
import { WorkspaceTile } from './workspace-tile';

const meta = {
  title: 'Account',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A workspace's mark at the sidebar (28), switcher (32) and settings (64) sizes. */
export const Tiles: Story = {
  render: () => (
    <Page width={320}>
      <div className="flex items-end gap-4 px-6">
        <WorkspaceTile name="Kestrel Labs" />
        <WorkspaceTile name="Harbour Health" size={32} />
        <WorkspaceTile name="Lagos Logistics" size={64} />
      </div>
    </Page>
  ),
};

function CreateDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New workspace</Button>
      <CreateWorkspaceSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** New workspace: a name, and you own it. A sheet on phones, a dialog from 768 px. */
export const NewWorkspace: Story = { render: () => <CreateDemo /> };

export const NewWorkspacePhone: Story = {
  name: 'New workspace (phone)',
  tags: ['phone'],
  globals: { viewport: { value: 'iphone15' } },
  render: () => <CreateDemo />,
};
