import { Suspense } from 'react';
import { SignIn } from '@/components/auth/sign-in';

export const metadata = { title: 'Sign in' };

export default function SignInPage() {
  // useSearchParams needs a boundary; the screen renders in full on the first client pass.
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
