'use client';

import { createContext, use } from 'react';

type AppInfo = { version: string };

const AppInfoContext = createContext<AppInfo>({ version: 'dev' });

/** Build facts the server knows (the image tag) that client screens show (About). */
export function AppInfoProvider({
  value,
  children,
}: {
  value: AppInfo;
  children: React.ReactNode;
}) {
  return <AppInfoContext value={value}>{children}</AppInfoContext>;
}

export function useAppInfo(): AppInfo {
  return use(AppInfoContext);
}
