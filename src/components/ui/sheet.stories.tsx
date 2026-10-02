import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FileAudio, Mic, PenLine, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';
import { List, ListRow, RowIcon } from './list';
import { Sheet, type Detent } from './sheet';

function SheetDemo({
  detents,
  long,
  footer,
}: {
  detents?: Detent[];
  long?: boolean;
  footer?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open the sheet</Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={long ? 'Move to a collection' : 'Add to Sotto'}
        description={long ? 'Choose where “Q4 roadmap memo” lives.' : undefined}
        detents={detents}
        footer={
          footer ? (
            <Button className="w-full" onClick={() => setOpen(false)}>
              Move
            </Button>
          ) : undefined
        }
      >
        {long ? (
          <List className="pb-2">
            {Array.from({ length: 14 }, (_, i) => (
              <ListRow key={i} title={`Collection ${i + 1}`} onClick={() => {}} />
            ))}
          </List>
        ) : (
          <List className="pb-2">
            <ListRow leading={<RowIcon icon={Upload} />} title="Upload files" onClick={() => {}} />
            <ListRow
              leading={<RowIcon icon={Mic} tint="red" />}
              title="Record a meeting"
              onClick={() => {}}
            />
            <ListRow
              leading={<RowIcon icon={FileAudio} tint="orange" />}
              title="Import audio"
              onClick={() => {}}
            />
            <ListRow
              leading={<RowIcon icon={PenLine} tint="teal" />}
              title="New note"
              onClick={() => {}}
            />
          </List>
        )}
      </Sheet>
    </>
  );
}

const meta = {
  title: 'Components/Sheet',
  component: SheetDemo,
  parameters: {
    docs: {
      description: {
        component:
          'A bottom sheet on phones (detents, a grabber, drag to dismiss with velocity, the page receding behind), a centred dialog from 768 px. Resize the viewport to see both.',
      },
    },
  },
} satisfies Meta<typeof SheetDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FitsItsContent: Story = { args: {} };
/** Opens at medium; drag up for large, down to close. */
export const MediumAndLarge: Story = {
  args: { detents: ['medium', 'large'], long: true, footer: true },
};
export const PhoneSheet: Story = {
  args: {},
  tags: ['phone'],
  globals: { viewport: { value: 'iphone15' } },
};
