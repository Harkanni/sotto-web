import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from './button';
import { Toaster, toastPreview, toastWithUndo } from './toaster';

function ToastDemo({ show }: { show?: 'undo' | 'preview' | 'plain' }) {
  useEffect(() => {
    // After the Toaster has mounted.
    const t = setTimeout(() => {
      if (show === 'undo') toastWithUndo('Deleted “Q4 roadmap memo”', () => {});
      if (show === 'preview')
        toastPreview('Recording arrives in Phase 4', 'This sample workspace can’t record yet.');
      if (show === 'plain')
        toast('Link copied', { description: 'Only people in this workspace can open it.' });
    }, 50);
    return () => clearTimeout(t);
  }, [show]);
  return (
    <div className="flex h-[360px] w-[440px] flex-col items-center justify-start gap-3 pt-6">
      <Button onClick={() => toastWithUndo('Deleted “Q4 roadmap memo”', () => {})}>
        Delete with Undo
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toastPreview('Notes arrive in Phase 4', 'This sample workspace can’t save notes yet.')
        }
      >
        Preview notice
      </Button>
      <Toaster />
    </div>
  );
}

const meta = {
  title: 'Components/Toast',
  component: ToastDemo,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ToastDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Delete never asks first; it offers Undo for five seconds. */
export const UndoToast: Story = { args: { show: 'undo' } };
/** Labelled previews say what will happen and when it arrives. */
export const PreviewToast: Story = { args: { show: 'preview' } };
export const PlainToast: Story = { args: { show: 'plain' } };
