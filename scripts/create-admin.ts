// Creates the first admin account. Local: `npm run create-admin -- --username yawar --name "Yawar" --password ...`
// Production: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createAccount } from '../supabase/functions/_shared/accounts.ts';
import { validateCommand } from '../supabase/functions/admin-users/validate.ts';
import { serviceEnv } from './lib/local-env.ts';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
  },
});

const parsed = validateCommand({
  action: 'create',
  username: values.username,
  displayName: values.name,
  role: 'admin',
  password: values.password,
});
if (!parsed.ok || parsed.command.action !== 'create') {
  console.error(parsed.ok ? 'Unexpected command' : parsed.error);
  console.error('Usage: npm run create-admin -- --username <username> --name "<Display Name>" --password <password>');
  process.exit(1);
}

const env = serviceEnv();
const service = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const result = await createAccount(service, parsed.command);
if (!result.ok) {
  console.error(`Could not create admin: ${result.error}`);
  process.exit(1);
}
console.log(`Admin "${parsed.command.username}" created on ${env.url}`);
