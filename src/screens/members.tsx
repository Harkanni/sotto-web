'use client';

import { Check, Link2, Mail, RotateCw, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { TextField } from '@/components/ui/text-field';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import type { Schemas } from '@/lib/api/client';
import {
  inviteLink,
  useActiveWorkspace,
  useChangeRole,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useSendInvite,
} from '@/lib/api/hooks';
import { expiresLabel } from '@/lib/format';
import {
  INVITE_ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  assignableRoles,
  atLeast,
  type Role,
} from '@/lib/roles';
import { RowsSkeleton } from './parts/rows';

type Member = Schemas['Member'];
type PendingInvite = Schemas['PendingInvite'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "an Admin", "a Member". */
function withArticle(role: Role): string {
  return `${role === 'owner' || role === 'admin' ? 'an' : 'a'} ${ROLE_LABEL[role]}`;
}

function firstName(member: Member): string {
  return member.name.trim().split(/\s+/)[0] || member.email;
}

/** A sheet whose subject stays on screen while it slides away. */
function useSheetTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  return {
    target,
    open,
    setOpen,
    show: (value: T) => {
      setTarget(value);
      setOpen(true);
    },
  };
}

// ── Invite someone ─────────────────────────────────────────────────────────────────────

function InviteSheet({
  open,
  onOpenChange,
  workspaceName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
}) {
  const send = useSendInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) return setError('Enter an email address.');
    send.mutate(
      { email: address, role },
      {
        onSuccess: () => {
          onOpenChange(false);
          setEmail('');
          setRole('member');
          toast('Invite sent', { description: address });
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      title="Invite people"
      description={`They get an email with a link to join ${workspaceName}.`}
      footer={
        <Button className="w-full" loading={send.isPending} onClick={submit}>
          Send invite
        </Button>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4 px-[var(--gutter)] pt-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="colleague@company.com"
          value={email}
          error={error}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <SegmentedControl<Role>
            aria-label="Role"
            value={role}
            onValueChange={setRole}
            segments={INVITE_ROLES}
          />
          {/* Two lines reserved: the sheet is measured once, and hints differ in length. */}
          <p className="min-h-9 px-4 text-footnote text-muted-foreground">{ROLE_HINT[role]}</p>
        </div>
      </form>
    </Sheet>
  );
}

// ── One person ─────────────────────────────────────────────────────────────────────────

function MemberSheet({
  member,
  myRole,
  open,
  onOpenChange,
}: {
  member: Member | null;
  myRole: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const change = useChangeRole();
  const remove = useRemoveMember();
  // The role on screen follows a change at once; the list behind catches up after.
  const [role, setRole] = useState<Role | null>(member?.role ?? null);
  const pending = change.isPending ? change.variables.role : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={member?.name || member?.email || 'Member'}
      description={member?.name ? member.email : undefined}
    >
      {member && (
        <div className="flex flex-col gap-6 pt-1 pb-2">
          <section aria-label="Role" className="px-[var(--gutter)]">
            <h3 className="px-4 pb-1.5 text-footnote text-muted-foreground">Role</h3>
            <ul className="surface-elevated overflow-hidden rounded-card bg-card-nested [--surface:var(--card-nested)]">
              {assignableRoles(myRole).map((r) => (
                <ListRow
                  key={r}
                  plain
                  title={ROLE_LABEL[r]}
                  trailing={
                    pending === r ? (
                      <Spinner size={18} className="text-muted-foreground" />
                    ) : (
                      <Check
                        aria-hidden
                        className={role === r ? 'size-5 text-primary-text' : 'size-5 opacity-0'}
                        strokeWidth={2.5}
                      />
                    )
                  }
                  rowProps={{ 'aria-pressed': role === r }}
                  onClick={() => {
                    if (role === r || change.isPending) return;
                    change.mutate(
                      { id: member.id, role: r },
                      {
                        onSuccess: (updated) => {
                          setRole(updated.role);
                          toast(`${firstName(member)} is now ${withArticle(updated.role)}`);
                        },
                        onError: (e) => toast(messageOf(e)),
                      },
                    );
                  }}
                />
              ))}
            </ul>
            {/* Two lines reserved, so the sheet keeps its size whichever role is chosen. */}
            <p className="min-h-[42px] px-4 pt-1.5 text-footnote text-muted-foreground">
              {role && ROLE_HINT[role]}
            </p>
          </section>
          <ConfirmAction
            surface="sheet"
            label="Remove from workspace"
            confirmLabel={`Remove ${firstName(member)}`}
            note="They lose access at once, including to collections shared with them. Invite them again to bring them back."
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(member.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast(`Removed ${member.name || member.email}`);
                },
                onError: (e) => toast(messageOf(e)),
              })
            }
          />
        </div>
      )}
    </Sheet>
  );
}

// ── One open invite ────────────────────────────────────────────────────────────────────

function PendingInviteSheet({
  invite,
  open,
  onOpenChange,
}: {
  invite: PendingInvite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const send = useSendInvite();
  const revoke = useRevokeInvite();
  const details = invite
    ? `${ROLE_LABEL[invite.role]}, ${expiresLabel(new Date(invite.expiresAt).getTime()).toLowerCase()}`
    : undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={invite?.email ?? 'Invite'}
      description={details}
    >
      {invite && (
        <div className="flex flex-col gap-6 pt-1 pb-2">
          <ul className="surface-elevated mx-[var(--gutter)] overflow-hidden rounded-card bg-card-nested [--surface:var(--card-nested)]">
            <ListRow
              leading={<RowIcon icon={Link2} tint="blue" />}
              title="Copy invite link"
              onClick={() => {
                navigator.clipboard.writeText(inviteLink(invite.id)).then(
                  () => toast('Link copied', { description: 'Only this person can use it.' }),
                  () => toast('The link couldn’t be copied. Resend the email instead.'),
                );
              }}
            />
            <ListRow
              leading={<RowIcon icon={RotateCw} tint="indigo" />}
              title={invite.expired ? 'Renew and resend' : 'Resend invite'}
              trailing={
                send.isPending ? <Spinner size={18} className="text-muted-foreground" /> : undefined
              }
              rowProps={{ 'aria-busy': send.isPending || undefined }}
              onClick={() => {
                if (send.isPending) return;
                send.mutate(
                  { email: invite.email, role: invite.role, resend: true },
                  {
                    onSuccess: () => {
                      onOpenChange(false);
                      toast('Invite sent again', { description: invite.email });
                    },
                    onError: (e) => toast(messageOf(e)),
                  },
                );
              }}
            />
          </ul>
          <ConfirmAction
            surface="sheet"
            label="Withdraw invite"
            confirmLabel="Withdraw"
            note="The link stops working. You can invite them again later."
            loading={revoke.isPending}
            onConfirm={() =>
              revoke.mutate(invite.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast('Invite withdrawn', { description: invite.email });
                },
                onError: (e) => toast(messageOf(e)),
              })
            }
          />
        </div>
      )}
    </Sheet>
  );
}

// ── The screen ─────────────────────────────────────────────────────────────────────────

/** Who can change this person: admins everyone but owners, owners everyone; never yourself. */
function canManage(myRole: Role, member: Member): boolean {
  if (member.you) return false;
  return member.role === 'owner' ? myRole === 'owner' : atLeast(myRole, 'admin');
}

/** People in the workspace and the invites still open (admins and owners). */
export function MembersScreen() {
  const workspace = useActiveWorkspace();
  const admin = atLeast(workspace?.role, 'admin');
  const members = useMembers(admin);
  const [inviting, setInviting] = useState(false);
  const memberSheet = useSheetTarget<Member>();
  const inviteSheet = useSheetTarget<PendingInvite>();

  if (workspace && !admin) {
    return (
      <Screen title="Members" largeTitle={false}>
        <div className="mx-[var(--gutter)] mt-4 rounded-card bg-card">
          <EmptyState
            illustration="team"
            title="Only admins manage people"
            description={`Ask an admin or owner of ${workspace.name} to invite someone or change a role.`}
          />
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Members" largeTitle={false}>
      <div className="flex flex-col gap-7 pt-4">
        <List>
          <ListRow
            leading={<RowIcon icon={UserPlus} tint="indigo" />}
            title="Invite people"
            onClick={() => setInviting(true)}
          />
        </List>
        <AsyncWidget
          query={members}
          label="Members"
          errorTitle="Couldn’t load the members"
          isEmpty={() => false}
          empty={{ illustration: 'team', title: 'No one here yet' }}
          skeleton={
            <div className="px-[var(--gutter)]">
              <RowsSkeleton rows={4} round />
            </div>
          }
        >
          {({ members: people, invites }) => (
            <div className="flex flex-col gap-7">
              <List header={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}>
                {people.map((m) => {
                  const manageable = workspace ? canManage(workspace.role, m) : false;
                  return (
                    <ListRow
                      key={m.id}
                      plain
                      chevron={manageable}
                      leading={<Avatar name={m.name || m.email} src={m.image ?? undefined} />}
                      title={m.you ? `${m.name || m.email} (you)` : m.name || m.email}
                      subtitle={m.email}
                      detail={ROLE_LABEL[m.role]}
                      onClick={manageable ? () => memberSheet.show(m) : undefined}
                    />
                  );
                })}
              </List>
              {invites.length > 0 && (
                <List
                  header="Invites"
                  footer="Invites last a week. Resend one to give it another week."
                >
                  {invites.map((invite) => (
                    <ListRow
                      key={invite.id}
                      plain
                      chevron
                      leading={
                        <span
                          aria-hidden
                          className="grid size-8 place-items-center rounded-full bg-fill text-muted-foreground"
                        >
                          <Mail className="size-4" />
                        </span>
                      }
                      title={invite.email}
                      subtitle={
                        invite.expired ? (
                          <span className="text-warning-text">Expired</span>
                        ) : (
                          expiresLabel(new Date(invite.expiresAt).getTime())
                        )
                      }
                      detail={ROLE_LABEL[invite.role]}
                      onClick={() => inviteSheet.show(invite)}
                    />
                  ))}
                </List>
              )}
            </div>
          )}
        </AsyncWidget>
      </div>
      <InviteSheet
        open={inviting}
        onOpenChange={setInviting}
        workspaceName={workspace?.name ?? 'the workspace'}
      />
      {workspace && (
        <MemberSheet
          key={memberSheet.target?.id}
          member={memberSheet.target}
          myRole={workspace.role}
          open={memberSheet.open}
          onOpenChange={memberSheet.setOpen}
        />
      )}
      <PendingInviteSheet
        invite={inviteSheet.target}
        open={inviteSheet.open}
        onOpenChange={inviteSheet.setOpen}
      />
    </Screen>
  );
}
