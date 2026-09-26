import type { SupabaseClient } from '@supabase/supabase-js';
import { usernameToEmail } from '../../supabase/functions/_shared/accounts.ts';
import { NETWORK_ERROR } from '../lib/api.ts';
import type { Profile } from '../lib/types.ts';

/** What the auth layer needs from Supabase Auth; tests pass a fake. */
export interface AuthBackend {
  currentUserId(): Promise<string | null>;
  /** Called with the new user id (or null) after sign-in, sign-out and token refreshes. */
  onUserChange(listener: (userId: string | null) => void): () => void;
  /** Resolves to a message to show, or null on success. */
  signIn(username: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  /** null when the profile is missing or not readable (a disabled account can't read profiles). */
  loadProfile(userId: string): Promise<Profile | null>;
}

export function loginErrorMessage(error: { message?: string; code?: string; status?: number }): string {
  const message = error.message ?? '';
  if (error.code === 'user_banned' || /banned/i.test(message)) return 'This account is disabled. Ask an admin.';
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'Wrong username or password.';
  if (error.status === 0 || /failed to fetch|fetch failed|networkerror/i.test(message)) return NETWORK_ERROR;
  return message || 'Could not sign in.';
}

export function supabaseAuthBackend(client: SupabaseClient): AuthBackend {
  return {
    async currentUserId() {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },
    onUserChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase calls made inside this callback can deadlock the auth client, so defer.
        setTimeout(() => listener(session?.user.id ?? null), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(username, password) {
      try {
        const { error } = await client.auth.signInWithPassword({ email: usernameToEmail(username), password });
        return error ? loginErrorMessage(error) : null;
      } catch {
        return NETWORK_ERROR;
      }
    },
    async signOut() {
      // 'local' clears this browser's session without a network call, so it works offline and for banned users.
      await client.auth.signOut({ scope: 'local' });
    },
    async loadProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('id, username, display_name, role, is_active, current_panel_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Profile | null) ?? null;
    },
  };
}
