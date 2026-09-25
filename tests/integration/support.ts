import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAccount, usernameToEmail, type Role } from '../../supabase/functions/_shared/accounts.ts';
import { localEnv } from '../../scripts/lib/local-env.ts';

export const env = localEnv();
export const TEST_PASSWORD = 'test-password-1';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: bypasses RLS. Use only for setup and cleanup. */
export const service = createClient(env.url, env.serviceKey, noSession);

export function uniqueName(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates an account through the same code path the edge function uses. Returns the user id. */
export async function makeAccount(username: string, role: Role, password = TEST_PASSWORD): Promise<string> {
  const result = await createAccount(service, { username, displayName: username, role, password });
  if (!result.ok) throw new Error(result.error);
  return result.userId;
}

export async function signIn(username: string, password = TEST_PASSWORD): Promise<SupabaseClient> {
  const client = createClient(env.url, env.anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) throw error;
  return client;
}

export async function accessToken(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('No session');
  return data.session.access_token;
}

/** Polls until read() returns a truthy value. */
export async function waitFor<T>(read: () => T | undefined | null | false, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value as T;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
