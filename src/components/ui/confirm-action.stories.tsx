import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { Page } from '@/stories/frames';
import { ConfirmAction } from './confirm-action';

const meta = {
  title: 'Components/ConfirmAction',
  component: ConfirmAction,
  parameters: { layout: 'centered' },
  args: {
    label: 'Remove from workspace',
    confirmLabel: 'Remove Tunde',
    note: 'They lose access at once, including to collections shared with them. Invite them again to bring them back.',
    onConfirm: () => {},
  },
  render: (args) => (
    <Page width={393}>
      <ConfirmAction {...args} />
    </Page>
  ),
} satisfies Meta<typeof ConfirmAction>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The red row, with what will happen written under it. */
export const Default: Story = {};

/** After the first press: Cancel (focused) and the action, in the same 44 px. */
export const Confirming: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Remove from workspace' }),
    );
  },
};

export const Removing: Story = {
  args: { loading: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Remove from workspace' }),
    );
  },
};

/** Inside a sheet the row sits on the nested surface. */
export const OnASheet: Story = {
  args: {
    surface: 'sheet',
    label: 'Remove passkey',
    confirmLabel: 'Remove',
    note: 'Email links still work.',
  },
  render: (args) => (
    <div className="w-[393px] bg-card py-6 text-foreground">
      <ConfirmAction {...args} />
    </div>
  ),
};
