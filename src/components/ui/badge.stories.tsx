import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge, SensitivityBadge } from './badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'Sample', tone: 'accent' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">Neutral</Badge>
      <Badge tone="accent">Accent</Badge>
      <Badge tone="success">Success</Badge>
      <Badge tone="warning">Warning</Badge>
      <Badge tone="danger">Danger</Badge>
    </div>
  ),
};

/** Docs sensitivity labels. Internal is the default and isn't shown in lists. */
export const Sensitivity: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <SensitivityBadge level="public" />
      <SensitivityBadge level="internal" />
      <SensitivityBadge level="confidential" />
      <SensitivityBadge level="restricted" />
    </div>
  ),
};
