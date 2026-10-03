import { ThemeColorSync } from '@/components/shell/system';

/**
 * Sign-in, onboarding and invites: full-screen pages outside the app shell, on the same grey
 * page and in the same type, colour and motion as the app they lead into.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {children}
      <ThemeColorSync />
    </div>
  );
}
