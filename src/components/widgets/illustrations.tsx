/**
 * Empty- and error-state illustrations (brief §8): one line style — 2.5 px rounded strokes in
 * the accent colour with a soft tint fill — drawn inline, so they follow the theme. Sotto's
 * sound-bar mark recurs as the motif. Decorative: the state's title says what happened.
 */

export type IllustrationName =
  | 'docs'
  | 'recordings'
  | 'chats'
  | 'tasks'
  | 'search'
  | 'period'
  | 'offline'
  | 'error'
  | 'processing';

const PAPER = 'var(--surface, var(--card))';

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      width="120"
      height="90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

const Tint = { fill: 'currentColor', fillOpacity: 0.12 } as const;

const ART: Record<IllustrationName, React.ReactNode> = {
  docs: (
    <>
      <rect x="30" y="18" width="44" height="58" rx="7" transform="rotate(-9 52 47)" {...Tint} />
      <path d="M50 12h25l15 15v45a7 7 0 0 1-7 7H50a7 7 0 0 1-7-7V19a7 7 0 0 1 7-7Z" fill={PAPER} />
      <path d="M75 12v9a6 6 0 0 0 6 6h9" />
      <path d="M53 41h27M53 51h27M53 61h16" />
    </>
  ),
  recordings: (
    <>
      <rect x="47" y="12" width="26" height="42" rx="13" {...Tint} />
      <path d="M37 44a23 23 0 0 0 46 0M60 67v10M49 77h22" />
      <path d="M20 39v12M27 33v24M93 33v24M100 39v12" />
    </>
  ),
  chats: (
    <>
      <path
        d="M24 14h50a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H40l-12 10V54h-4a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10Z"
        fill={PAPER}
      />
      <path d="M36 30v10M44 26v18M52 30v10M60 33v4" />
      <path
        d="M96 38h-6v26a10 10 0 0 1-10 10H62v2a10 10 0 0 0 10 10h14l10 8v-8a10 10 0 0 0 10-10V48a10 10 0 0 0-10-10Z"
        {...Tint}
      />
    </>
  ),
  tasks: (
    <>
      <rect x="28" y="10" width="64" height="72" rx="10" {...Tint} />
      <path d="m40 30 5 5 9-10M40 50l5 5 9-10M40 70l5 5 9-10" />
      <path d="M62 31h18M62 51h18M62 71h12" />
    </>
  ),
  search: (
    <>
      <circle cx="54" cy="40" r="22" {...Tint} />
      <path d="m70 56 18 18" strokeWidth="5" />
      <path d="M45 40h18" />
    </>
  ),
  period: (
    <>
      <rect x="22" y="16" width="76" height="62" rx="10" fill={PAPER} />
      <path d="M22 32h76M40 10v12M80 10v12" />
      <path d="M36 66V56M50 66V60M64 66V58M78 66v-6" {...Tint} strokeOpacity="0.45" />
      <path d="M34 48h52" strokeDasharray="1 7" />
    </>
  ),
  offline: (
    <>
      <path d="M36 70h48a18 18 0 0 0 3-35.7A24 24 0 0 0 42.5 30 20 20 0 0 0 36 70Z" {...Tint} />
      <path d="m30 14 60 62" />
    </>
  ),
  error: (
    <>
      <path d="M20 46h10l6-14 8 30 8-38 8 34 6-12h8" strokeOpacity="0.4" />
      <path d="M84 24 104 60H64Z" fill={PAPER} />
      <path d="M84 37v10M84 53v.5" />
    </>
  ),
  processing: (
    <>
      <rect x="18" y="20" width="84" height="50" rx="12" {...Tint} />
      <path d="M36 38v14M46 32v26M56 36v18M66 30v30M76 38v14M86 42v6" />
    </>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return <Frame className={className}>{ART[name]}</Frame>;
}
