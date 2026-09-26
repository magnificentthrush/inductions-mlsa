import { describe, expect, it } from 'vitest';
import { readEnv } from '../../../src/lib/env.ts';

describe('readEnv', () => {
  it('returns the trimmed Supabase settings', () => {
    expect(readEnv({ VITE_SUPABASE_URL: ' http://127.0.0.1:54321 ', VITE_SUPABASE_ANON_KEY: 'anon' }))
      .toEqual({ supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'anon' });
  });

  it('names every missing setting and how to fix it', () => {
    expect(() => readEnv({})).toThrow(
      'Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. For local development run: npm run web:env',
    );
    expect(() => readEnv({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: '   ' }))
      .toThrow('Missing VITE_SUPABASE_ANON_KEY.');
  });
});
