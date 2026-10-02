import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Skeleton, SkeletonText } from './skeleton';
import { Spinner } from './spinner';

const meta = {
  title: 'Components/Loading',
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Spinners: Story = {
  render: () => (
    <div className="flex items-center gap-6 text-muted-foreground">
      <Spinner size={16} />
      <Spinner size={20} />
      <Spinner size={28} />
      <span className="grid size-11 place-items-center rounded-button bg-primary text-primary-foreground">
        <Spinner size={20} />
      </span>
    </div>
  ),
};

/**
 * Skeletons mirror the final layout and are tinted from the surface they sit on (stronger in
 * dark). They shimmer slowly, and hold still under reduced motion.
 */
export const Skeletons: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-4">
      <div className="flex items-center gap-3 rounded-card bg-card p-4">
        <Skeleton className="size-9 rounded-[9px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-[64%]" />
          <Skeleton className="h-3 w-[40%]" />
        </div>
      </div>
      <div className="rounded-card bg-card p-4">
        <SkeletonText lines={4} />
      </div>
      <div className="p-4">
        <SkeletonText lines={2} />
      </div>
    </div>
  ),
};
