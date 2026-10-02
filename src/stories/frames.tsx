/**
 * Story frames: the surfaces components sit on in the app, so they're judged in context.
 * Used by stories only.
 */
export function Page({ children, width = 420 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      className="flex flex-col gap-6 bg-background py-6 text-foreground"
      style={{ width, minHeight: 200 }}
    >
      {children}
    </div>
  );
}

/**
 * The phone's screen, for shell pieces that pin to its edges (tab bar, + button, offline strip).
 * Fills the story's viewport, which phone-tagged stories set to iPhone 15.
 */
export function PhoneStage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      style={{ transform: 'translateZ(0)' }}
    >
      {children}
    </div>
  );
}

/** Placeholder content to sit behind translucent materials. */
export function Filler({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-card bg-card px-4 py-3">
          <p className="text-body">Q{(i % 4) + 1} roadmap memo</p>
          <p className="text-subhead text-muted-foreground">2 h ago, Amaka Obi</p>
        </div>
      ))}
    </div>
  );
}
