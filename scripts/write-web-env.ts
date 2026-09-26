// Writes .env.local for the Vite dev server from the running local Supabase stack.
import { writeFileSync } from 'node:fs';
import { localEnv } from './lib/local-env.ts';

const env = localEnv();
writeFileSync('.env.local', `VITE_SUPABASE_URL=${env.url}\nVITE_SUPABASE_ANON_KEY=${env.anonKey}\n`);
console.log(`Wrote .env.local for ${env.url}`);
