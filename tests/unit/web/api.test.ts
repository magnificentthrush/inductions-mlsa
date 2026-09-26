import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, friendlyMessage, NETWORK_ERROR, NOT_ALLOWED } from '../../../src/lib/api.ts';
import { notAllowed } from '../../../src/lib/notAllowed.ts';

function clientReturning(response: { data?: unknown; error?: { message: string; code?: string } | null; status?: number }) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null, status: 200, ...response });
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}

describe('friendlyMessage', () => {
  it('passes the database message through', () => {
    expect(friendlyMessage({ message: 'Panel 2 is busy', code: 'P0001' }, 400)).toBe('Panel 2 is busy');
  });
  it('maps permission errors and network failures', () => {
    expect(friendlyMessage({ message: 'Not allowed', code: '42501' }, 403)).toBe(NOT_ALLOWED);
    expect(friendlyMessage({ message: 'permission denied for table candidates', code: '42501' }, 401)).toBe(NOT_ALLOWED);
    expect(friendlyMessage({ message: 'TypeError: Failed to fetch', code: '' }, 0)).toBe(NETWORK_ERROR);
    expect(friendlyMessage({ message: '' }, 500)).toBe('Something went wrong');
  });
});

describe('createApi', () => {
  it('calls each database function with its argument names', async () => {
    const { rpc, client } = clientReturning({ data: 'interview-1' });
    const api = createApi(client);
    await expect(api.sendIn('c1', 'p1')).resolves.toBe('interview-1');
    await api.moveCandidate('c1', null, null);
    await api.importCandidates([]);
    expect(rpc.mock.calls).toEqual([
      ['send_in', { p_candidate_id: 'c1', p_panel_id: 'p1' }],
      ['move_candidate', { p_candidate_id: 'c1', p_panel_id: null, p_position: null }],
      ['import_candidates', { p_rows: [] }],
    ]);
  });

  it('rejects with the server message', async () => {
    const api = createApi(clientReturning({ error: { message: 'Candidate #4 is not waiting', code: 'P0001' }, status: 400 }).client);
    await expect(api.checkIn('c4')).rejects.toEqual(new ApiError('Candidate #4 is not waiting'));
  });

  it('announces "Not allowed" so a disabled account gets signed out', async () => {
    const listener = vi.fn();
    const stop = notAllowed.subscribe(listener);
    const api = createApi(clientReturning({ error: { message: 'Not allowed', code: '42501' }, status: 403 }).client);
    await expect(api.boardSnapshot()).rejects.toThrow(NOT_ALLOWED);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('turns a thrown fetch into the network message', async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const api = createApi({ rpc } as unknown as SupabaseClient);
    await expect(api.serverNow()).rejects.toThrow(NETWORK_ERROR);
  });
});
