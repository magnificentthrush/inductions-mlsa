import { execSync } from 'node:child_process';

export interface LocalEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

/** Reads the local stack's URL and keys from `supabase status -o env`. */
export function localEnv(): LocalEnv {
  let out: string;
  try {
    out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('Local Supabase is not running. Start it with: npm run db:start');
  }
  const vars: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) vars[match[1]] = match[2];
  }
  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
  const serviceKey = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Could not read API_URL / ANON_KEY / SERVICE_ROLE_KEY from `supabase status -o env`');
  }
  return { url, anonKey, serviceKey };
}

/** Production scripts pass SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; otherwise use the local stack. */
export function serviceEnv(): { url: string; serviceKey: string; anonKey?: string } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) return { url, serviceKey };
  return localEnv();
}
