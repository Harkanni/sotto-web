import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowRight, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Upload files', variant: 'primary' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'destructive'] },
    size: { control: 'inline-radio', options: ['default', 'icon'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const;

/** What each state looks like, without needing a pointer: [data-*] mirrors the real state. */
const STATES: { name: string; props: Record<string, unknown> }[] = [
  { name: 'Default', props: {} },
  { name: 'Hover', props: { 'data-hovered': '' } },
  { name: 'Pressed', props: { 'data-pressed': '' } },
  { name: 'Focused', props: { 'data-focus-visible': '' } },
  { name: 'Disabled', props: { disabled: true } },
  { name: 'Loading', props: { loading: true } },
];

const LABEL: Record<(typeof VARIANTS)[number], string> = {
  primary: 'Upload files',
  secondary: 'Invite',
  ghost: 'See all',
  destructive: 'Delete',
};

/** The 4 variants × every state (brief §8). Switch the toolbar's theme for dark mode. */
export const StateMatrix: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] items-center gap-x-6 gap-y-4 text-footnote text-muted-foreground">
      <span />
      {VARIANTS.map((v) => (
        <span key={v} className="capitalize">
          {v}
        </span>
      ))}
      {STATES.map((state) => (
        <div key={state.name} className="contents">
          <span>{state.name}</span>
          {VARIANTS.map((v) => (
            <div key={v}>
              <Button variant={v} {...state.props}>
                {LABEL[v]}
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  args: { icon: <Upload aria-hidden />, children: 'Upload files' },
};

export const IconOnly: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="icon" aria-label="Add" icon={<Plus aria-hidden />} />
      <Button size="icon" variant="secondary" aria-label="Next" icon={<ArrowRight aria-hidden />} />
      <Button size="icon" variant="ghost" aria-label="Add" icon={<Plus aria-hidden />} />
      <Button size="icon" variant="destructive" aria-label="Delete" icon={<Trash2 aria-hidden />} />
      <Button size="icon" variant="ghost" aria-label="Add" icon={<Plus aria-hidden />} loading />
    </div>
  ),
};

/** The spinner keeps the button's width: with an icon it takes the icon's place. */
export const Loading: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button loading>Save changes</Button>
      <Button loading icon={<Upload aria-hidden />}>
        Uploading
      </Button>
      <Button variant="secondary" loading>
        Invite
      </Button>
    </div>
  ),
};

export const AsLink: Story = {
  render: () => (
    <Button asChild variant="secondary">
      <a href="#pricing">See pricing</a>
    </Button>
  ),
};
