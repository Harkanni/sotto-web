import { checkLabel, fetchApiStatus, formatUptime, type ApiStatus } from '@/lib/status';

// Always render on request: the page reports live status, so it must never be cached at build.
export const dynamic = 'force-dynamic';

const PHASES = [
  { n: 1, name: 'Foundations and always-on demo', current: true },
  { n: 2, name: 'Design system and app shell' },
  { n: 3, name: 'Accounts and workspaces' },
  { n: 4, name: 'Uploads, recordings and transcripts' },
  { n: 5, name: 'Ask and search, with sources' },
];

function Dot({ tone }: { tone: 'ok' | 'warn' | 'off' }) {
  const colour = tone === 'ok' ? 'bg-success' : tone === 'warn' ? 'bg-destructive' : 'bg-separator';
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${colour}`} />;
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'off';
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-4 py-2.5">
      {tone && <Dot tone={tone} />}
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground tabular-nums">{value}</span>
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="px-4 text-[13px] font-normal tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="divide-y divide-separator overflow-hidden rounded-card bg-card">{children}</ul>
    </section>
  );
}

function ApiRows({ status }: { status: ApiStatus }) {
  if (status.state === 'unreachable') {
    return (
      <Row
        label="API"
        value={status.reason === 'timeout' ? 'Not answering' : 'Not reachable yet'}
        tone="off"
      />
    );
  }
  return (
    <>
      <Row
        label="API"
        value={status.state === 'ok' ? 'Ready' : 'Degraded'}
        tone={status.state === 'ok' ? 'ok' : 'warn'}
      />
      {Object.entries(status.checks).map(([name, ok]) => (
        <Row
          key={name}
          label={checkLabel(name)}
          value={ok ? 'Connected' : 'Down'}
          tone={ok ? 'ok' : 'warn'}
        />
      ))}
      <Row label="API version" value={status.version} />
      <Row label="API uptime" value={formatUptime(status.uptimeSeconds)} />
    </>
  );
}

export default async function StatusPage() {
  const status = await fetchApiStatus(process.env.API_URL ?? 'http://localhost:4000');
  const webVersion = process.env.APP_VERSION ?? 'dev';

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 pt-14 pb-16">
      <header className="space-y-3 px-4">
        <p className="text-[15px] font-semibold text-primary-text">Sotto</p>
        <h1 className="text-[34px] leading-tight font-bold tracking-tight">Building in the open</h1>
        <p className="text-muted-foreground">
          Private AI for your team’s memos and meetings. This page is the always-on demo. It updates
          every time new work is merged.
        </p>
      </header>

      <Group title="System">
        <ApiRows status={status} />
        <Row label="Web version" value={webVersion} />
      </Group>

      <Group title="Roadmap">
        {PHASES.map((phase) => (
          <Row
            key={phase.n}
            label={`${phase.n}. ${phase.name}`}
            value={phase.current ? 'In progress' : 'Next'}
            tone={phase.current ? 'ok' : 'off'}
          />
        ))}
      </Group>

      <p className="px-4 text-[13px] text-muted-foreground">
        Nothing here uses real customer data. Phase 2 replaces this page with the app shell.
      </p>
    </main>
  );
}
