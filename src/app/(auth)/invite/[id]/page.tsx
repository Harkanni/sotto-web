import { Invite } from '@/components/auth/invite';

export const metadata = { title: 'Invitation' };

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Invite id={id} />;
}
