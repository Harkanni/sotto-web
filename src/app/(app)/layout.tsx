import { AppInfoProvider } from '@/components/shell/app-info';
import { AppShell } from '@/components/shell/app-shell';
import { NavProvider } from '@/lib/nav/hooks';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppInfoProvider value={{ version: process.env.APP_VERSION ?? 'dev' }}>
      <NavProvider>
        <AppShell />
        {children}
      </NavProvider>
    </AppInfoProvider>
  );
}
