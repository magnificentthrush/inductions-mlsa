import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NETWORK_ERROR } from '../lib/api.ts';
import { notAllowed } from '../lib/notAllowed.ts';
import type { Profile } from '../lib/types.ts';
import type { AuthBackend } from './authBackend.ts';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; notice: string | null }
  | { status: 'signed_in'; profile: Profile };

interface AuthContextValue {
  state: AuthState;
  /** Resolves to a message to show, or null once signed in. */
  signIn(username: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

export const DISABLED_NOTICE = 'This account is disabled or has no role. Ask an admin.';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ backend, children }: { backend: AuthBackend; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const latest = useRef(0); // only the newest resolution may change the state

  const resolve = useCallback(
    async (userId: string | null) => {
      const mine = ++latest.current;
      if (!userId) {
        setState((current) => (current.status === 'signed_out' ? current : { status: 'signed_out', notice: null }));
        return;
      }
      let profile: Profile | null;
      try {
        profile = await backend.loadProfile(userId);
      } catch {
        if (mine === latest.current) {
          setState((current) => (current.status === 'loading' ? { status: 'signed_out', notice: NETWORK_ERROR } : current));
        }
        return;
      }
      if (mine !== latest.current) return;
      if (!profile || !profile.is_active) {
        setState({ status: 'signed_out', notice: DISABLED_NOTICE });
        void backend.signOut();
        return;
      }
      setState({ status: 'signed_in', profile });
    },
    [backend],
  );

  useEffect(() => {
    backend.currentUserId().then(resolve, () => setState({ status: 'signed_out', notice: NETWORK_ERROR }));
    const stopAuth = backend.onUserChange((userId) => void resolve(userId));
    // "Not allowed" from any action or read: the account may have just been disabled. Check again.
    const stopNotAllowed = notAllowed.subscribe(() => void backend.currentUserId().then(resolve));
    return () => {
      stopAuth();
      stopNotAllowed();
    };
  }, [backend, resolve]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const error = await backend.signIn(username, password);
      if (!error) await resolve(await backend.currentUserId());
      return error;
    },
    [backend, resolve],
  );

  const signOut = useCallback(async () => {
    latest.current++;
    setState({ status: 'signed_out', notice: null });
    await backend.signOut();
  }, [backend]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>');
  return value;
}
