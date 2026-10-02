import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  BadgeCheck,
  CircleHelp,
  Keyboard,
  LogOut,
  Moon,
  ScrollText,
  Sparkles,
  Users,
} from 'lucide-react';
import { Page } from '@/stories/frames';
import { SensitivityBadge } from './badge';
import { List, ListRow, RowIcon } from './list';
import { Switch } from './switch';

const meta = {
  title: 'Components/List',
  component: List,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Page>
        <Story />
      </Page>
    ),
  ],
} satisfies Meta<typeof List>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped rows, iOS settings style: tinted icons, values, chevrons, inset separators. */
export const Settings: Story = {
  args: { children: null },
  render: () => (
    <>
      <List header="Workspace">
        <ListRow
          leading={<RowIcon icon={Users} tint="blue" />}
          title="Members"
          detail="7"
          href="#members"
        />
        <ListRow
          leading={<RowIcon icon={Sparkles} tint="purple" />}
          title="AI settings"
          detail="Private"
          href="#ai"
        />
        <ListRow
          leading={<RowIcon icon={BadgeCheck} tint="green" />}
          title="Usage and billing"
          href="#usage"
        />
      </List>
      <List header="App" footer="Sotto follows your device unless you choose here.">
        <ListRow
          leading={<RowIcon icon={Moon} tint="indigo" />}
          title="Appearance"
          detail="System"
          href="#appearance"
        />
        <ListRow
          leading={<RowIcon icon={Keyboard} tint="gray" />}
          title="Reduce motion"
          trailing={<Switch aria-label="Reduce motion" />}
        />
        <ListRow
          leading={<RowIcon icon={CircleHelp} tint="teal" />}
          title="About Sotto"
          href="#about"
        />
      </List>
    </>
  ),
};

/** Content rows: a kind icon, a title, a subtitle, and a label when it matters. */
export const Content: Story = {
  args: { children: null },
  render: () => (
    <List header="Pinned">
      <ListRow
        leading={<RowIcon icon={ScrollText} tint="indigo" />}
        title="Q4 roadmap memo"
        subtitle="2 h ago, Amaka Obi"
        href="#q4"
      />
      <ListRow
        leading={<RowIcon icon={ScrollText} tint="red" />}
        title="Security questionnaire for Bluebird Clinics"
        subtitle="Monday, Tunde Bakare"
        trailing={<SensitivityBadge level="confidential" />}
        href="#security"
      />
      <ListRow
        leading={<RowIcon icon={ScrollText} tint="orange" />}
        title="Board update, September"
        subtitle="24 Sept, Amaka Obi"
        trailing={<SensitivityBadge level="restricted" />}
        href="#board"
        selected
      />
    </List>
  ),
};

export const Actions: Story = {
  args: { children: null },
  render: () => (
    <List>
      <ListRow title="Export my data" onClick={() => {}} />
      <ListRow
        leading={<RowIcon icon={LogOut} tint="red" />}
        title="Sign out"
        destructive
        onClick={() => {}}
      />
    </List>
  ),
};
