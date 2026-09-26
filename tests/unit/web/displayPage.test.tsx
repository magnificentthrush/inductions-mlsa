// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/lib/api.ts';
import { display } from './fixtures.ts';
import { fakeApi, renderApp } from './helpers.tsx';

describe('DisplayPage', () => {
  it('shows each panel, who is up next, and the waiting strip, without a login', async () => {
    const api = fakeApi();
    renderApp('/display?key=k1', { api });
    const panel1 = await screen.findByRole('region', { name: 'Panel 1' });
    expect(within(panel1).getByText('Now interviewing')).toBeInTheDocument();
    expect(within(panel1).getByText('Sara Ahmed')).toBeInTheDocument();
    const panel2 = screen.getByRole('region', { name: 'Panel 2' });
    expect(within(panel2).getByText('Free')).toBeInTheDocument();
    expect(within(panel2).getByText('Ali Raza')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo', { name: 'Waiting' })).getByText('عائشہ خان')).toBeInTheDocument();
    expect(api.displaySnapshot).toHaveBeenCalledWith('k1');
    expect(api.subscribeDisplay).toHaveBeenCalledWith('k1');
    expect(document.title).toBe('Projector · MLSA Induction');
  });

  it('says the link is invalid for a wrong or missing key', async () => {
    renderApp('/display?key=wrong', { api: fakeApi({ displaySnapshot: vi.fn(async () => null) }) });
    expect(await screen.findByText('Invalid display link')).toBeInTheDocument();
  });

  it('says the link is invalid without a key', () => {
    renderApp('/display');
    expect(screen.getByText('Invalid display link')).toBeInTheDocument();
  });

  it('shows one panel full screen with &panel=', async () => {
    renderApp('/display?key=k1&panel=p2');
    expect(await screen.findByRole('region', { name: 'Panel 2' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Panel 1' })).toBeNull();
    expect(screen.queryByRole('contentinfo', { name: 'Waiting' })).toBeNull();
  });

  it('re-reads the snapshot on each broadcast and flashes a panel when someone is sent in', async () => {
    const api = fakeApi();
    renderApp('/display?key=k1', { api });
    await screen.findByRole('region', { name: 'Panel 2' });
    expect(screen.getByRole('region', { name: 'Panel 2' })).not.toHaveAttribute('data-flash');

    vi.mocked(api.displaySnapshot).mockResolvedValue(
      display({
        panels: [
          { id: 'p1', name: 'Panel 1', current: { number: 7, name: 'Sara Ahmed', started_at: '2026-09-26T09:50:00Z' }, lined_up: [] },
          { id: 'p2', name: 'Panel 2', current: { number: 12, name: 'Ali Raza', started_at: '2026-09-26T10:01:00Z' }, lined_up: [] },
        ],
      }),
    );
    act(() => api.topics.display.event());
    const panel2 = screen.getByRole('region', { name: 'Panel 2' });
    expect(await within(panel2).findByText('Now interviewing')).toBeInTheDocument();
    expect(panel2).toHaveAttribute('data-flash', 'true');
    expect(screen.getByRole('region', { name: 'Panel 1' })).not.toHaveAttribute('data-flash');
  });

  it('keeps showing the last state when a reload fails, with an amber status dot while reconnecting', async () => {
    const api = fakeApi();
    renderApp('/display?key=k1', { api });
    await screen.findByRole('region', { name: 'Panel 1' });
    act(() => api.topics.display.status('subscribed'));
    expect(screen.getByRole('status', { name: 'Live' })).toBeInTheDocument();

    vi.mocked(api.displaySnapshot).mockRejectedValue(new ApiError("Can't reach the server. Check the connection and try again."));
    act(() => api.topics.display.status('error'));
    act(() => api.topics.display.event());
    expect(await screen.findByRole('status', { name: 'Reconnecting' })).toBeInTheDocument();
    expect(screen.getByText('Sara Ahmed')).toBeInTheDocument();
    expect(screen.queryByText(/reach the server/)).toBeNull();
  });

  it('shows "Connecting…" rather than an error when the first load fails', async () => {
    renderApp('/display?key=k1', { api: fakeApi({ displaySnapshot: vi.fn(() => Promise.reject(new ApiError('offline'))) }) });
    expect(await screen.findByText('Connecting…')).toBeInTheDocument();
  });
});
