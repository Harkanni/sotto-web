import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Kbd, ModKey } from './kbd';

const meta = {
  title: 'Components/Kbd',
  component: Kbd,
  args: { children: 'K' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** ⌘ on Apple devices, Ctrl elsewhere: CSS picks the label, so server markup matches. */
export const Shortcuts: Story = {
  render: () => (
    <div className="flex flex-col gap-3 text-callout">
      <span className="flex items-center gap-2">
        Search and commands
        <Kbd>
          <ModKey />
        </Kbd>
        <Kbd>K</Kbd>
      </span>
      <span className="flex items-center gap-2 text-muted-foreground">
        Go to Meetings <Kbd>G</Kbd> then <Kbd>M</Kbd>
      </span>
      <span className="flex items-center gap-2 text-muted-foreground">
        Open <Kbd>↵</Kbd> Close <Kbd>esc</Kbd>
      </span>
    </div>
  ),
};
