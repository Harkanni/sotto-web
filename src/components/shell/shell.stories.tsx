import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Filler, PhoneStage } from '@/stories/frames';
import { AddSheet } from './add-sheet';
import { CommandPalette } from './command-palette';
import { DropTarget } from './drop-overlay';
import { Fab } from './fab';
import { emitShellEvent } from './shell-events';
import { ShortcutsSheet } from './shortcuts';
import { Sidebar } from './sidebar';
import { OfflineStrip } from './system';
import { TabBar } from './tab-bar';

const meta = {
  title: 'Shell',
  parameters: { layout: 'centered' },
  // Instant sample data, so the palette's results are there on the first frame.
  beforeEach: () => {
    localStorage.setItem(
      'sotto.dev.sample',
      JSON.stringify({ latency: 'instant', state: 'normal' }),
    );
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Phone-only pieces render at the iPhone 15 size; the "phone" tag tells the story tests. */
const PHONE = { viewport: { value: 'iphone15' } };

/** Translucent, five tabs with icon and label; the active one in indigo. Phones only. */
export const TabBarPhone: Story = {
  name: 'Tab bar',
  tags: ['phone'],
  globals: PHONE,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <PhoneStage>
      <Filler />
      <TabBar active="docs" />
    </PhoneStage>
  ),
};

/** 56 px, 16 px above the tab bar, mirrored for left-handed use. Hidden on Ask. */
export const PlusButton: Story = {
  name: '+ button',
  tags: ['phone'],
  globals: PHONE,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <PhoneStage>
      <Filler />
      <Fab hidden={false} />
      <TabBar active="home" />
    </PhoneStage>
  ),
};

/** Rises from behind the tab bar; the + button and toasts make room. */
export const OfflineStripPhone: Story = {
  name: 'Offline strip',
  tags: ['phone'],
  globals: PHONE,
  parameters: { layout: 'fullscreen' },
  render: () => {
    document.documentElement.setAttribute('data-offline', '');
    return (
      <PhoneStage>
        <Filler />
        <OfflineStrip state="offline" />
        <Fab hidden={false} />
        <TabBar active="docs" />
      </PhoneStage>
    );
  },
};

export const BackOnline: Story = {
  tags: ['phone'],
  globals: PHONE,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <PhoneStage>
      <Filler />
      <OfflineStrip state="back" />
      <TabBar active="docs" />
    </PhoneStage>
  ),
};

/** Tablets and desktops: workspace, search (⌘K), sections, New and Profile. */
export const SidebarWide: Story = {
  name: 'Sidebar',
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="grid h-[640px] grid-cols-[272px_1fr] bg-background">
      <Sidebar active="meetings" />
      <div />
    </div>
  ),
};

function Opened({
  event,
  children,
}: {
  event: 'open-palette' | 'open-shortcuts' | 'open-add';
  children: React.ReactNode;
}) {
  useEffect(() => {
    const t = setTimeout(() => emitShellEvent(event), 0);
    return () => clearTimeout(t);
  }, [event]);
  return (
    <div className="h-[640px] w-full bg-background">
      <Filler rows={6} />
      {children}
    </div>
  );
}

/** Recent items, documents, meetings, chats, Go to and commands; ⌘↵ asks Sotto. */
export const Palette: Story = {
  name: '⌘K palette',
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Opened event="open-palette">
      <CommandPalette />
      <Toaster />
    </Opened>
  ),
};

export const KeyboardShortcuts: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Opened event="open-shortcuts">
      <ShortcutsSheet />
    </Opened>
  ),
};

/** Upload files, Record a meeting, Import audio, New note (labelled previews until Phase 4). */
export const AddToSotto: Story = {
  tags: ['phone'],
  globals: PHONE,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Opened event="open-add">
      <AddSheet />
      <Toaster />
    </Opened>
  ),
};

/** Dragging files anywhere over the app raises this target. */
export const DropFiles: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="h-[640px] bg-background">
      <Filler rows={6} />
      <DropTarget visible />
    </div>
  ),
};
