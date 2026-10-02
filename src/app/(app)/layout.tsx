import { AppShell } from '@/components/shell/app-shell';
import { NavProvider } from '@/lib/nav/hooks';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavProvider>
      <AppShell />
      {children}
    </NavProvider>
  );
}
