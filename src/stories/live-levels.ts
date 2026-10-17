import type { LevelSource } from '@/components/live/live-parts';

/**
 * Stand-in microphone levels for stories (no microphone in Storybook): syllables riding a slow
 * phrase envelope, with pauses between phrases, 20 times a second like the capture's own.
 * Deterministic, so a story looks the same every time it opens.
 */
export const standInLevels: LevelSource = (listener) => {
  let t = 0;
  const id = setInterval(() => {
    t += 1;
    const phrase = Math.max(0, Math.sin(t / 9));
    const syllable = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.7) * Math.cos(t * 0.6));
    listener(phrase > 0.05 ? Math.min(1, 0.08 + phrase * syllable * 0.85) : 0);
  }, 50);
  return () => clearInterval(id);
};
