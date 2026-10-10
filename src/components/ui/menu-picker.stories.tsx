import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Page } from '@/stories/frames';
import { List, ListRow, RowIcon } from './list';
import { MenuPicker } from './menu-picker';

const meta = {
  title: 'Components/Menu picker',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Page>
        <div className="py-4">
          <Story />
        </div>
      </Page>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const GROUPS = [
  {
    heading: 'Private',
    choices: [{ value: 'p', label: 'llama-3.3-70b', detail: 'Private · Sotto-hosted model' }],
  },
  {
    heading: 'Your API key',
    choices: [
      { value: 'a', label: 'claude-sonnet', detail: 'Claude · your API key' },
      { value: 'b', label: 'gpt-x', detail: 'OpenAI · your API key' },
    ],
  },
];

function Picker({ groups = GROUPS }: { groups?: typeof GROUPS }) {
  const [value, setValue] = useState('p');
  return (
    <List header="Default">
      <ListRow
        leading={<RowIcon icon={Sparkles} tint="purple" />}
        title="Default model"
        trailing={
          <MenuPicker label="Default model" value={value} groups={groups} onChange={setValue} />
        }
      />
    </List>
  );
}

/** The value in grey with ⇅; the menu groups choices by where they run, the current one checked. */
export const Grouped: Story = { render: () => <Picker /> };

/** One choice: plain text, nothing to pick. */
export const SingleChoice: Story = { render: () => <Picker groups={[GROUPS[0]!]} /> };
