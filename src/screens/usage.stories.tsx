import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { List } from '@/components/ui/list';
import type { Plan, UsageReport } from '@/lib/api/billing';
import { Page } from '@/stories/frames';
import { MeterRow, UsageChart } from './usage';

/** Stand-in plan and usage (Storybook has no API): placeholder numbers, like the real config. */
const PRO: Plan = {
  id: 'PRO',
  name: 'Pro',
  summary: 'Managed AI included, no keys to look after.',
  price: { monthly: 1_500_000, yearly: 15_000_000 },
  currency: 'NGN',
  placeholderPrices: true,
  modes: ['PRIVATE', 'BYOK', 'MANAGED'],
  limits: {
    privateTokens: 2_000_000,
    managedTokens: 2_000_000,
    transcriptionMinutes: 600,
    storageBytes: 20 * 1024 ** 3,
  },
  features: ['Managed AI', 'More private AI'],
  selfServe: true,
};

function days(n: number, shape: (i: number) => number): UsageReport['daily'] {
  const start = Date.UTC(2026, 9, 10) - (n - 1) * 86_400_000;
  return Array.from({ length: n }, (_, i) => {
    const total = Math.round(shape(i));
    return {
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      privateTokens: Math.round(total * 0.6),
      managedTokens: Math.round(total * 0.3),
      byokTokens: Math.round(total * 0.1),
      transcriptionMinutes: 0,
    };
  });
}

const meta = {
  title: 'Screens/Usage and billing',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Page>
        <div className="flex flex-col gap-7 py-4">
          <Story />
        </div>
      </Page>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Calm, near the limit (amber), used up (red, with what to do), not included, unlimited. */
export const Meters: Story = {
  render: () => (
    <List header="This month">
      <MeterRow meter={{ id: 'privateTokens', used: 412_000, limit: 2_000_000 }} plan={PRO} />
      <MeterRow meter={{ id: 'managedTokens', used: 1_730_000, limit: 2_000_000 }} plan={PRO} />
      <MeterRow meter={{ id: 'transcriptionMinutes', used: 600, limit: 600 }} plan={PRO} />
      <MeterRow meter={{ id: 'storageBytes', used: 3.2 * 1024 ** 3, limit: null }} plan={PRO} />
      <MeterRow
        meter={{ id: 'managedTokens', used: 0, limit: 0 }}
        plan={{ ...PRO, id: 'FREE', name: 'Free' }}
      />
    </List>
  ),
};

/** Thirty days of questions: one accent series, the busiest day marked, tap a day for its split. */
export const DailyChart: Story = {
  render: () => (
    <UsageChart
      daily={days(30, (i) => 20_000 + 18_000 * Math.sin(i / 3) ** 2 + (i % 7 === 5 ? 0 : 6_000))}
    />
  ),
};

/** Ninety days are thinner bars with 1px gaps. */
export const NinetyDays: Story = {
  render: () => <UsageChart daily={days(90, (i) => (i % 7 >= 5 ? 1_000 : 30_000 + i * 300))} />,
};

/** Nothing asked yet: a flat baseline and a plain line saying so. */
export const NoUsage: Story = {
  render: () => <UsageChart daily={days(7, () => 0)} />,
};
