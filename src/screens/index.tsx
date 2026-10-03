'use client';

import { EmptyState } from '@/components/widgets/async-widget';
import type { IllustrationName } from '@/components/widgets/illustrations';
import type { ScreenKind, StackEntry, Tab } from '@/lib/nav/routes';
import { AccountScreen } from './account';
import { AskScreen, ThreadScreen } from './ask';
import { AuditScreen } from './audit';
import { DocScreen } from './doc';
import { CollectionScreen, DocsScreen } from './docs';
import { HomeScreen } from './home';
import { MeetingScreen, MeetingsScreen } from './meetings';
import { MembersScreen } from './members';
import {
  AboutScreen,
  AppearanceScreen,
  ComponentsScreen,
  DeveloperScreen,
  LaterScreen,
  NotFoundScreen,
  ProfileScreen,
  WidgetStatesScreen,
} from './profile';
import { WorkspaceScreen } from './workspace';

/** Which component draws each kind of screen. The URL decides the kind (src/lib/nav/routes). */
const SCREENS: Record<ScreenKind, React.ComponentType> = {
  home: HomeScreen,
  docs: DocsScreen,
  ask: AskScreen,
  meetings: MeetingsScreen,
  profile: ProfileScreen,
  collection: CollectionScreen,
  doc: DocScreen,
  meeting: MeetingScreen,
  thread: ThreadScreen,
  account: AccountScreen,
  appearance: AppearanceScreen,
  developer: DeveloperScreen,
  'widget-states': WidgetStatesScreen,
  components: ComponentsScreen,
  about: AboutScreen,
  workspace: WorkspaceScreen,
  members: MembersScreen,
  ai: LaterScreen,
  usage: LaterScreen,
  audit: AuditScreen,
  'not-found': NotFoundScreen,
};

export function renderScreen(entry: StackEntry): React.ReactNode {
  const Component = SCREENS[entry.kind];
  return <Component />;
}

const PLACEHOLDERS: Partial<
  Record<Tab, { illustration: IllustrationName; title: string; description: string }>
> = {
  docs: {
    illustration: 'docs',
    title: 'Select a document',
    description: 'Its summary and text open here.',
  },
  ask: {
    illustration: 'chats',
    title: 'Select a chat',
    description: 'Or ask something new below the list.',
  },
  meetings: {
    illustration: 'recordings',
    title: 'Select a meeting',
    description: 'Its player, transcript and notes open here.',
  },
  profile: { illustration: 'tasks', title: 'Select a setting', description: 'Settings open here.' },
};

/** What the detail pane shows on wide windows before anything is selected. */
export function renderPlaceholder(tab: Tab): React.ReactNode {
  const p = PLACEHOLDERS[tab];
  return p ? <EmptyState {...p} /> : null;
}
