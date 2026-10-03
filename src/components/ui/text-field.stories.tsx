import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Page } from '@/stories/frames';
import { SottoMark } from './brand';
import { TextField } from './text-field';

const meta = {
  title: 'Components/Text field',
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

function Field(props: Partial<React.ComponentProps<typeof TextField>>) {
  const [value, setValue] = useState(String(props.defaultValue ?? ''));
  return (
    <TextField
      label="Email"
      placeholder="name@company.com"
      {...props}
      defaultValue={undefined}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

/** On the grey page (sign-in, onboarding): a white field. 17 px text, 50 px tall. */
export const OnThePage: Story = {
  render: () => (
    <>
      <Field surface="page" />
      <Field
        surface="page"
        label="Your name"
        placeholder="First and last name"
        defaultValue="Ada Okafor"
      />
      <Field surface="page" hint="They get an email with a link to join." />
    </>
  ),
};

/** Inside cards and sheets: a filled field, like the search field. */
export const InACard: Story = {
  render: () => (
    <div className="flex flex-col gap-4 rounded-card bg-card p-4">
      <Field label="Collection name" placeholder="Board and finance" />
      <Field label="Disabled" disabled defaultValue="Kestrel Labs" />
    </div>
  ),
};

/** An error replaces the hint, is announced, and outlines the field. */
export const WithError: Story = {
  render: () => (
    <Field
      surface="page"
      defaultValue="ada@"
      error="Enter your email address, like ada@company.com."
    />
  ),
};

/** Sotto's mark: the theme's indigo with the four-bar waveform. */
export const Mark: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <SottoMark size={64} className="rounded-[18px] shadow-fab" title="Sotto" />
      <SottoMark size={40} />
      <SottoMark size={28} />
    </div>
  ),
};
