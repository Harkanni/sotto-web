'use client';

import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { Screen } from '@/components/shell/screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { List, ListRow, RowIcon } from '@/components/ui/list';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { TextField } from '@/components/ui/text-field';
import { AsyncWidget } from '@/components/widgets/async-widget';
import { useMe, useUpdateMe } from '@/lib/api/hooks';
import {
  AuthRequestError,
  cancelledCeremony,
  useAddPasskey,
  useDeletePasskey,
  usePasskeys,
  useRenamePasskey,
  type Passkey,
} from '@/lib/auth/account';
import { supportsPasskeys } from '@/lib/auth/client';
import { fullDate } from '@/lib/format';
import { useIsClient } from '@/lib/prefs/stored';
import { RowsSkeleton } from './parts/rows';

function passkeyDetails(passkey: Passkey): string {
  const added = `Added ${fullDate(new Date(passkey.createdAt).getTime())}`;
  return passkey.backedUp ? `${added}, synced` : `${added}, this device only`;
}

/** A passkey's own sheet: rename it, or remove it. */
function PasskeySheet({
  passkey,
  open,
  onOpenChange,
}: {
  passkey: Passkey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rename = useRenamePasskey();
  const remove = useDeletePasskey();
  const [name, setName] = useState(passkey?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const dirty = Boolean(name.trim()) && name.trim() !== (passkey?.name ?? '');

  const save = () => {
    if (!passkey || !dirty) return;
    rename.mutate(
      { id: passkey.id, name: name.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast('Passkey renamed', { description: name.trim() });
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={passkey?.name || 'Passkey'}
      description={passkey ? passkeyDetails(passkey) : undefined}
      footer={
        <Button className="w-full" disabled={!dirty} loading={rename.isPending} onClick={save}>
          Save name
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pt-1 pb-2">
        <form
          noValidate
          className="px-[var(--gutter)]"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <TextField
            label="Name"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="iPhone, work laptop…"
            value={name}
            error={error}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </form>
        <ConfirmAction
          surface="sheet"
          label="Remove passkey"
          confirmLabel="Remove"
          note="You won’t be able to sign in with it again. Email links still work."
          loading={remove.isPending}
          onConfirm={() => {
            if (!passkey) return;
            remove.mutate(passkey.id, {
              onSuccess: () => {
                onOpenChange(false);
                toast('Passkey removed', { description: passkey.name || undefined });
              },
              onError: (e) => toast(messageOf(e)),
            });
          }}
        />
      </div>
    </Sheet>
  );
}

function addFailure(error: unknown): string | null {
  if (cancelledCeremony(error)) return null;
  const code = error instanceof AuthRequestError ? error.code : undefined;
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'This device already has a passkey for Sotto.';
  }
  return messageOf(error);
}

/** Your passkeys: add one on this device, rename or remove the others. */
function Passkeys() {
  const passkeys = usePasskeys();
  const add = useAddPasskey();
  const supported = useIsClient() && supportsPasskeys();
  const [target, setTarget] = useState<Passkey | null>(null);
  const [open, setOpen] = useState(false);

  const addOne = () =>
    add.mutate(undefined, {
      onSuccess: () => toast('Passkey added', { description: 'Use it next time you sign in.' }),
      onError: (error) => {
        const message = addFailure(error);
        if (message) toast(message);
      },
    });

  return (
    <section aria-label="Passkeys" className="flex flex-col gap-1.5">
      <h2 className="px-[calc(var(--gutter)+16px)] text-footnote text-muted-foreground">
        Passkeys
      </h2>
      <AsyncWidget
        query={passkeys}
        isEmpty={() => false}
        label="Passkeys"
        errorTitle="Couldn’t load your passkeys"
        empty={{ illustration: 'key', title: 'No passkeys yet' }}
        skeleton={
          <div className="px-[var(--gutter)]">
            <RowsSkeleton rows={2} />
          </div>
        }
      >
        {(list) => (
          <List
            aria-label="Your passkeys"
            footer={
              supported
                ? 'Sign in with Face ID, Touch ID, Windows Hello or your device’s PIN instead of an email link.'
                : 'This browser can’t make passkeys. Add one from a phone or computer that can.'
            }
          >
            {list.map((passkey) => (
              <ListRow
                key={passkey.id}
                plain
                chevron
                leading={<RowIcon icon={KeyRound} tint="gray" />}
                title={passkey.name || 'Passkey'}
                subtitle={passkeyDetails(passkey)}
                onClick={() => {
                  setTarget(passkey);
                  setOpen(true);
                }}
              />
            ))}
            <ListRow
              leading={<RowIcon icon={Plus} tint="indigo" />}
              title="Add a passkey"
              trailing={
                add.isPending ? <Spinner size={18} className="text-muted-foreground" /> : undefined
              }
              rowProps={{
                'aria-busy': add.isPending || undefined,
                'aria-disabled': !supported || undefined,
              }}
              className={!supported ? 'pointer-events-none opacity-40' : undefined}
              onClick={() => {
                if (!add.isPending && supported) addOne();
              }}
            />
          </List>
        )}
      </AsyncWidget>
      <PasskeySheet key={target?.id} passkey={target} open={open} onOpenChange={setOpen} />
    </section>
  );
}

/** Your account: the name your team sees, your sign-in email, and your passkeys. */
export function AccountScreen() {
  const me = useMe();
  const user = me.data?.user;
  const update = useUpdateMe();
  // null until you type, so the field follows /me until then.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? user?.name ?? '';
  const dirty = draft !== null && Boolean(draft.trim()) && draft.trim() !== user?.name;

  const save = () => {
    if (draft !== null && !draft.trim()) return setError('Enter your name.');
    if (!dirty || draft === null) return;
    update.mutate(
      { name: draft.trim() },
      {
        onSuccess: () => {
          setDraft(null);
          toast('Name saved');
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  };

  return (
    <Screen
      title="Account"
      largeTitle={false}
      actions={
        <Button variant="ghost" disabled={!dirty} loading={update.isPending} onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-7 pt-4">
        <header className="flex flex-col items-center gap-3 px-[var(--gutter)] text-center">
          {user ? (
            <Avatar name={user.name || user.email} src={user.image ?? undefined} size={64} />
          ) : (
            <Skeleton className="size-16 rounded-full" />
          )}
          {user ? (
            <div className="min-w-0 max-w-full">
              <p className="truncate text-title-2">{user.name || 'Add your name'}</p>
              <p className="truncate text-callout text-muted-foreground">{user.email}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-52" />
            </div>
          )}
        </header>

        <form
          noValidate
          className="px-[var(--gutter)]"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <TextField
            label="Name"
            surface="page"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="done"
            placeholder="First and last name"
            disabled={!user}
            value={value}
            error={error}
            hint="Your team sees it on members, comments and the audit log."
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
        </form>

        <List header="Email" footer="Sign-in links and invites go to this address.">
          <ListRow title={user?.email ?? '…'} />
        </List>

        <Passkeys />
      </div>
    </Screen>
  );
}
