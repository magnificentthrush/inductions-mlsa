export interface WebEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Reads the Supabase settings Vite injects from .env.local (development) or the host (production). */
export function readEnv(source: Record<string, unknown>): WebEnv {
  const read = (name: string) => (typeof source[name] === 'string' ? source[name].trim() : '');
  const supabaseUrl = read('VITE_SUPABASE_URL');
  const supabaseAnonKey = read('VITE_SUPABASE_ANON_KEY');
  const missing = [
    supabaseUrl ? null : 'VITE_SUPABASE_URL',
    supabaseAnonKey ? null : 'VITE_SUPABASE_ANON_KEY',
  ].filter((name) => name !== null);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(' and ')}. For local development run: npm run web:env`);
  }
  return { supabaseUrl, supabaseAnonKey };
}
