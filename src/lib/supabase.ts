import { createClient } from '@supabase/supabase-js';
import { readEnv } from './env.ts';

const env = readEnv(import.meta.env);

/** The one browser client. Staff sessions persist in localStorage; the projector never signs in. */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
