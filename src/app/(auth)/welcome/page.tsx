import { Suspense } from 'react';
import { Welcome } from '@/components/auth/welcome';

export const metadata = { title: 'Welcome' };

export default function WelcomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}
