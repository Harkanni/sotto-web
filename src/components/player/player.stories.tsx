import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useCallback, useRef, useState } from 'react';
import { Page } from '@/stories/frames';
import { WaveformScrubber } from './waveform';

/** A speech-like envelope: phrases and pauses, deterministic so screenshots compare. */
const PEAKS = Array.from({ length: 600 }, (_, i) => {
  const phrase = Math.sin(i / 23) * 0.5 + 0.5;
  const syllable = Math.abs(Math.sin(i * 1.7)) * 0.6 + 0.4;
  return i % 97 < 8 ? 0.04 : Math.min(1, phrase * syllable + 0.08);
});

/** The scrubber wired the way the player wires it: seeking moves the playhead at once. */
function Scrubber({
  peaks,
  start,
  disabled,
}: {
  peaks: readonly number[] | null;
  start: number;
  disabled?: boolean;
}) {
  const [position, setPosition] = useState(start);
  const listeners = useRef(new Set<(s: number) => void>());
  const onFrame = useCallback((listener: (s: number) => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);
  const seek = (seconds: number) => {
    setPosition(seconds);
    for (const l of listeners.current) l(seconds);
  };
  return (
    <div className="mx-4 rounded-card bg-card p-4">
      <WaveformScrubber
        peaks={peaks}
        duration={1_800}
        position={position}
        onFrame={onFrame}
        onSeek={seek}
        disabled={disabled}
        label="Position in Design review"
      />
    </div>
  );
}

const meta = {
  title: 'Meetings/Waveform scrubber',
  component: Scrubber,
  args: { peaks: PEAKS, start: 0 },
} satisfies Meta<typeof Scrubber>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The player's scrubber over a 30-minute meeting. The played part is indigo, revealed by two
 * opposing translates driven per frame (no React renders while playing); a native range input
 * on top gives dragging, tapping, the keyboard and screen readers.
 */
export const Playing: Story = {
  args: { start: 754 },
  render: (args) => (
    <Page>
      <Scrubber {...args} />
    </Page>
  ),
};

export const Start: Story = {
  render: (args) => (
    <Page>
      <Scrubber {...args} />
    </Page>
  ),
};

/** Sample meetings and files from before waveforms: an even, quiet track that reads the same. */
export const WithoutWaveform: Story = {
  args: { peaks: null, start: 300 },
  render: (args) => (
    <Page>
      <Scrubber {...args} />
    </Page>
  ),
};

/** While the audio loads, or for a sample meeting with no recording. */
export const Disabled: Story = {
  args: { peaks: PEAKS, start: 0, disabled: true },
  render: (args) => (
    <Page>
      <Scrubber {...args} />
    </Page>
  ),
};
