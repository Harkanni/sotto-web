import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Page } from '@/stories/frames';
import { SearchField } from './search-field';
import { SegmentedControl } from './segmented-control';
import { Switch } from './switch';

const meta = {
  title: 'Components/Controls',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Page>
        <div className="flex flex-col gap-6 px-4">
          <Story />
        </div>
      </Page>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Segmented({ options, label }: { options: string[]; label: string }) {
  const [value, setValue] = useState(options[0]!);
  return (
    <SegmentedControl
      aria-label={label}
      value={value}
      onValueChange={setValue}
      segments={options.map((o) => ({ value: o, label: o }))}
    />
  );
}

/** The thumb springs between equal segments; arrow keys move it; each hit area is 44 px. */
export const SegmentedControls: Story = {
  render: () => (
    <>
      <Segmented label="Hand" options={['Left hand', 'Right hand']} />
      <Segmented label="Theme" options={['System', 'Light', 'Dark']} />
      <Segmented label="Section" options={['Summary', 'Transcript', 'Actions', 'Chapters']} />
    </>
  ),
};

export const Switches: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Switch aria-label="Off" />
      <Switch aria-label="On" defaultChecked />
      <Switch aria-label="Disabled" disabled />
      <Switch aria-label="Disabled on" disabled defaultChecked />
    </div>
  ),
};

function Search({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <SearchField value={value} onValueChange={setValue} placeholder="Search documents" />;
}

/** Focusing slides Cancel in; typing shows the clear button. Text is 17 px, so iOS never zooms. */
export const SearchFields: Story = {
  render: () => (
    <>
      <Search />
      <Search initial="pricing" />
    </>
  ),
};
