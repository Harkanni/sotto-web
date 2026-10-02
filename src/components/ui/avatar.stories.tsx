import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Avatar, AvatarStack } from './avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: { name: 'Ada Okafor', size: 40 },
  argTypes: { size: { control: 'inline-radio', options: [24, 32, 40, 64] } },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Initials on a gradient picked from the name, so the same person always looks the same. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar name="Ada Okafor" size={64} />
      <Avatar name="Amaka Obi" size={40} />
      <Avatar name="Jonas Weber" size={32} />
      <Avatar name="Tunde Bakare" size={24} />
    </div>
  ),
};

export const Stack: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <AvatarStack names={['Sofia Marin', 'Amaka Obi']} />
      <AvatarStack
        names={['Ada Okafor', 'Amaka Obi', 'Tunde Bakare', 'Jonas Weber', 'Priya Raman']}
        max={3}
      />
      <AvatarStack names={['Kwame Mensah', 'Ada Okafor', 'Priya Raman']} size={32} />
    </div>
  ),
};
