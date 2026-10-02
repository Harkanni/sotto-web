'use client';

import { Screen } from '@/components/shell/screen';
import { NavLink } from '@/lib/nav/link';
import { DEFAULT_TITLE, pushPath, type StackEntry, type Tab } from '@/lib/nav/routes';

function Rows({
  from,
  kind,
  count,
}: {
  from: string;
  kind: 'doc' | 'meeting' | 'thread';
  count: number;
}) {
  return (
    <ul className="mx-4 overflow-hidden rounded-card bg-card">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="border-b-[0.5px] border-separator last:border-0">
          <NavLink
            href={pushPath(from, kind, `${kind[0]}${i + 1}`)}
            className="flex min-h-11 items-center px-4 py-3 active:bg-row-pressed"
          >
            {DEFAULT_TITLE[kind]} {i + 1}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function renderScreen(entry: StackEntry): React.ReactNode {
  const title = entry.id ? `${DEFAULT_TITLE[entry.kind]} ${entry.id}` : DEFAULT_TITLE[entry.kind];
  const kind = entry.kind === 'meetings' ? 'meeting' : entry.kind === 'ask' ? 'thread' : 'doc';
  return (
    <Screen title={title}>
      <Rows from={entry.key} kind={kind} count={30} />
    </Screen>
  );
}

export function renderPlaceholder(tab: Tab): React.ReactNode {
  return <p className="text-muted-foreground">Select an item in {DEFAULT_TITLE[tab]}</p>;
}
