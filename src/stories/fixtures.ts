import type { QueryClient } from '@tanstack/react-query';
import type { Schemas } from '@/lib/api/client';
import { apiKeys } from '@/lib/api/hooks';
import type { SampleScope } from '@/lib/sample/scope';

/**
 * A stand-in account for Storybook, which runs without the API: an owner whose workspace loaded
 * the sample content, a viewer, an open invite, the four sample collections and the board's
 * access list. Seeded into each story's query cache (.storybook/preview.tsx). Stories only.
 */

const WORKSPACE = 'w_story';

export const STORY_ME: Schemas['Me'] = {
  user: {
    id: 'u_ada',
    email: 'ada@kestrel.example',
    name: 'Ada Obi',
    image: null,
    handedness: 'right',
  },
  workspace: {
    id: WORKSPACE,
    name: 'Kestrel Labs',
    role: 'owner',
    sample: {
      collections: {
        product: 'col_product',
        customers: 'col_customers',
        board: 'col_board',
        handbook: 'col_handbook',
      },
      filesLoaded: true,
    },
  },
  csrfToken: 'story',
};

export const STORY_WORKSPACES: Schemas['WorkspaceSummary'][] = [
  { id: WORKSPACE, name: 'Kestrel Labs', role: 'owner', active: true, members: 3 },
  { id: 'w_other', name: 'Harbour Health', role: 'member', active: false, members: 12 },
];

const at = '2026-10-01T09:00:00.000Z';

export const STORY_MEMBERS: Schemas['MemberList'] = {
  members: [
    {
      id: 'm_ada',
      userId: 'u_ada',
      name: 'Ada Obi',
      email: 'ada@kestrel.example',
      image: null,
      role: 'owner',
      joinedAt: at,
      you: true,
    },
    {
      id: 'm_tunde',
      userId: 'u_tunde',
      name: 'Tunde Bakare',
      email: 'tunde@kestrel.example',
      image: null,
      role: 'member',
      joinedAt: at,
      you: false,
    },
    {
      id: 'm_bisi',
      userId: 'u_bisi',
      name: 'Bisi Adeyemi',
      email: 'bisi@kestrel.example',
      image: null,
      role: 'viewer',
      joinedAt: at,
      you: false,
    },
  ],
  invites: [
    {
      id: 'inv_kwame',
      email: 'kwame@kestrel.example',
      role: 'admin',
      invitedBy: { name: 'Ada Obi', email: 'ada@kestrel.example' },
      createdAt: at,
      expiresAt: '2026-10-08T09:00:00.000Z',
      expired: false,
    },
  ],
};

export const STORY_COLLECTIONS: Schemas['Collection'][] = [
  {
    id: 'col_board',
    name: 'Board and finance',
    restricted: true,
    access: 'manage',
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'col_customers',
    name: 'Customers',
    restricted: false,
    access: 'manage',
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'col_handbook',
    name: 'Handbook',
    restricted: false,
    access: 'manage',
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'col_product',
    name: 'Product',
    restricted: false,
    access: 'manage',
    createdAt: at,
    updatedAt: at,
  },
];

export const STORY_BOARD_PERMISSIONS: Schemas['CollectionPermissions'] = {
  restricted: true,
  grants: [
    {
      userId: 'u_ada',
      role: null,
      access: 'manage',
      user: { name: 'Ada Obi', email: 'ada@kestrel.example' },
    },
    {
      userId: 'u_tunde',
      role: null,
      access: 'edit',
      user: { name: 'Tunde Bakare', email: 'tunde@kestrel.example' },
    },
    { userId: null, role: 'viewer', access: 'view', user: null },
  ],
};

/** Every sample collection visible, under the ids above. */
export const STORY_SAMPLE_SCOPE: SampleScope = {
  loaded: true,
  visible: {
    c_product: 'col_product',
    c_customers: 'col_customers',
    c_board: 'col_board',
    c_handbook: 'col_handbook',
  },
};

export function seedStoryAccount(client: QueryClient) {
  client.setQueryData(apiKeys.me, STORY_ME);
  client.setQueryData(apiKeys.workspaces, STORY_WORKSPACES);
  client.setQueryData(apiKeys.members(WORKSPACE), STORY_MEMBERS);
  client.setQueryData(apiKeys.collections(WORKSPACE), STORY_COLLECTIONS);
  client.setQueryData(apiKeys.permissions(WORKSPACE, 'col_board'), STORY_BOARD_PERMISSIONS);
}
