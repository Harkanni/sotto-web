'use client';

import { MessageCircle } from 'lucide-react';
import { createContext, use, useRef, useState } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { useIsWide } from '@/lib/hooks/use-media-query';
import { navigate } from '@/lib/nav/store';
import { AskPanel } from '../ask';

type AskToggle = { open: boolean; toggle: () => void } | null;
const AskToggleContext = createContext<AskToggle>(null);

/**
 * A detail screen with a resizable Ask panel beside it on wide windows (brief §9). On phones the
 * same button opens Ask scoped to the item instead.
 */
export function DetailWithAsk({
  about,
  base,
  children,
}: {
  about: string;
  base: string;
  children: React.ReactNode;
}) {
  const wide = useIsWide();
  const panel = useRef<PanelImperativeHandle | null>(null);
  const [open, setOpen] = useState(false);

  if (!wide) return <AskToggleContext value={null}>{children}</AskToggleContext>;

  const toggle = () => {
    const p = panel.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };

  return (
    <AskToggleContext value={{ open, toggle }}>
      <Group orientation="horizontal" className="absolute inset-0">
        <Panel id="detail" minSize="45%" className="relative">
          {children}
        </Panel>
        <Separator
          aria-label="Resize the Ask panel"
          className="relative w-px bg-separator outline-none before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-[''] data-[separator=hover]:bg-primary data-[separator=active]:bg-primary"
        />
        <Panel
          id="ask"
          panelRef={panel}
          collapsible
          collapsedSize={0}
          defaultSize={0}
          minSize="300px"
          maxSize="50%"
          onResize={(size) => setOpen(size.inPixels > 0)}
          className="relative"
        >
          {open && <AskPanel about={about} base={base} />}
        </Panel>
      </Group>
    </AskToggleContext>
  );
}

/** The nav bar's Ask button: toggles the side panel on wide windows, opens Ask on phones. */
export function AskButton({ scopeLabel }: { scopeLabel: string }) {
  const toggle = use(AskToggleContext);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        toggle ? (toggle.open ? 'Close Ask' : `Ask about ${scopeLabel}`) : `Ask about ${scopeLabel}`
      }
      aria-pressed={toggle ? toggle.open : undefined}
      aria-keyshortcuts="A"
      data-ask-toggle
      icon={<MessageCircle aria-hidden />}
      onClick={() => (toggle ? toggle.toggle() : navigate('/ask', { intent: 'none' }))}
      className={toggle?.open ? 'bg-primary-tint' : undefined}
    />
  );
}
