import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders } from '../../../src/app/AppProviders.tsx';
import { routes } from '../../../src/app/routes.tsx';
import type { AuthBackend } from '../../../src/auth/authBackend.ts';
import type { Api } from '../../../src/lib/api.ts';
import type { ChannelStatus, Subscribe } from '../../../src/lib/realtime.ts';
import type { Profile } from '../../../src/lib/types.ts';
import { board, display } from './fixtures.ts';

/** A realtime topic the test drives by hand. */
export function fakeTopic() {
  const listeners = new Set<Parameters<Subscribe>[0]>();
  const subscribe: Subscribe = (handlers) => {
    listeners.add(handlers);
    return () => listeners.delete(handlers);
  };
  return {
    subscribe,
    event: () => listeners.forEach((l) => l.onEvent()),
    status: (status: ChannelStatus) => listeners.forEach((l) => l.onStatus(status)),
    get listening() {
      return listeners.size;
    },
  };
}

export type FakeApi = Api & { topics: { board: ReturnType<typeof fakeTopic>; display: ReturnType<typeof fakeTopic> } };

/** Every Api method as a vi.fn with a sensible default; override any of them. */
export function fakeApi(overrides: Partial<Api> = {}): FakeApi {
  const topics = { board: fakeTopic(), display: fakeTopic() };
  const api: Api = {
    boardSnapshot: vi.fn(async () => board()),
    displaySnapshot: vi.fn(async () => display()),
    serverNow: vi.fn(async () => new Date().toISOString()),
    listCandidates: vi.fn(async () => []),
    getDisplayKey: vi.fn(async () => 'test-key'),
    checkIn: vi.fn(async () => {}),
    undoCheckIn: vi.fn(async () => {}),
    moveCandidate: vi.fn(async () => {}),
    skipCandidate: vi.fn(async () => {}),
    sendIn: vi.fn(async () => 'i-new'),
    undoSendIn: vi.fn(async () => {}),
    endInterview: vi.fn(async () => {}),
    reopenInterview: vi.fn(async () => {}),
    addPanel: vi.fn(async () => 'p-new'),
    deletePanel: vi.fn(async () => {}),
    importCandidates: vi.fn(async () => ({ added: 0, updated: 0, flagged: [] })),
    subscribeBoard: vi.fn(() => topics.board.subscribe),
    subscribeDisplay: vi.fn(() => topics.display.subscribe),
    ...overrides,
  };
  return Object.assign(api, { topics });
}

/** An in-memory Supabase Auth: `accounts` can sign in; `signedInAs` starts with a session. */
export function fakeAuth(options: { signedInAs?: Profile; accounts?: Record<string, { password: string; profile: Profile }> } = {}) {
  let userId: string | null = options.signedInAs?.id ?? null;
  const profiles = new Map<string, Profile>();
  if (options.signedInAs) profiles.set(options.signedInAs.id, options.signedInAs);
  for (const account of Object.values(options.accounts ?? {})) profiles.set(account.profile.id, account.profile);
  const listeners = new Set<(id: string | null) => void>();
  const backend: AuthBackend = {
    currentUserId: async () => userId,
    onUserChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signIn: async (username, password) => {
      const account = options.accounts?.[username];
      if (!account || account.password !== password) return 'Wrong username or password.';
      userId = account.profile.id;
      listeners.forEach((l) => l(userId));
      return null;
    },
    signOut: vi.fn(async () => {
      userId = null;
      listeners.forEach((l) => l(null));
    }),
    loadProfile: async (id) => profiles.get(id) ?? null,
  };
  return { backend, profiles };
}

/** Renders the real routes at `path` with fake Supabase pieces. */
export function renderApp(path: string, { api = fakeApi(), auth = fakeAuth().backend }: { api?: Api; auth?: AuthBackend } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <AppProviders api={api} auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, api };
}
