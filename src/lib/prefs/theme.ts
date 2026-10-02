/**
 * Switches the theme with a crossfade (a View Transition of the whole page) where supported and
 * motion isn't reduced; otherwise instantly. next-themes stores the choice.
 */
export function setThemeSmoothly(next: string, setTheme: (theme: string) => void) {
  const root = document.documentElement;
  const resolved =
    next === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : next;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!document.startViewTransition || reduced || root.dataset.theme === resolved) {
    setTheme(next);
    return;
  }

  // Freeze CSS transitions, so the incoming snapshot already has its final colours.
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(freeze);
  const transition = document.startViewTransition(() => {
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    setTheme(next);
  });
  void transition.finished.finally(() => freeze.remove());
}
