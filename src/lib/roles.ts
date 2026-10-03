import type { Schemas } from '@/lib/api/client';

/**
 * Workspace roles and collection access as people read them. The API decides what each role may
 * do (sotto-api `auth/roles.ts`); these mirror its rules only to show or hide controls, so a
 * screen never offers something the API would refuse.
 */

export type Role = Schemas['Role'];
export type Access = Schemas['Access'];

const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

/** True when `role` is at least `minimum` (owner > admin > member > viewer). */
export function atLeast(role: Role | null | undefined, minimum: Role): boolean {
  return role != null && RANK[role] >= RANK[minimum];
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

/** One line on what each role can do, under role pickers. */
export const ROLE_HINT: Record<Role, string> = {
  owner: 'Owners can do everything, including managing other owners.',
  admin: 'Admins also manage people, access and the audit log.',
  member: 'Members add and edit documents and meetings.',
  viewer: 'Viewers read and ask, and can’t change anything.',
};

/** The roles an invite can offer (owners are made from members, not invited). */
export const INVITE_ROLES: { value: Role; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
];

/** The roles someone with `mine` may hand out: owners anything, admins anything but owner. */
export function assignableRoles(mine: Role): Role[] {
  return mine === 'owner' ? ['owner', 'admin', 'member', 'viewer'] : ['admin', 'member', 'viewer'];
}

export const ACCESS_LABEL: Record<Access, string> = {
  view: 'View',
  edit: 'Edit',
  manage: 'Manage',
};

/** "You can …" under a collection's name. */
export const ACCESS_SENTENCE: Record<Access, string> = {
  view: 'You can view',
  edit: 'You can edit',
  manage: 'You manage this',
};

const ACCESS_RANK: Record<Access, number> = { view: 0, edit: 1, manage: 2 };

export function accessAtLeast(access: Access | null | undefined, minimum: Access): boolean {
  return access != null && ACCESS_RANK[access] >= ACCESS_RANK[minimum];
}
