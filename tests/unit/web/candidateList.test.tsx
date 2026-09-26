// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateSummary } from '../../../src/lib/types.ts';
import { profile } from './fixtures.ts';
import { fakeApi, fakeAuth, renderApp } from './helpers.tsx';

// The board fixture has #7 interviewing in Panel 1, #12 lined up for Panel 2 and #20-#22 in the pool.
const people: CandidateSummary[] = [
  { id: 'c20', number: 20, full_name: 'Bilal Khan', reg_number: '2025020', status: 'waiting' },
  { id: 'c5', number: 5, full_name: 'Hina Tariq', reg_number: '2025005', status: 'registered' },
  { id: 'c7', number: 7, full_name: 'Sara Ahmed', reg_number: '2025007', status: 'interviewing' },
  { id: 'c3', number: 3, full_name: 'عائشہ خان', reg_number: '2025003', status: 'registered' },
  { id: 'c1', number: 1, full_name: 'Omar Farooq', reg_number: '2025001', status: 'interviewed' },
  { id: 'c12', number: 12, full_name: 'Ali Raza', reg_number: '2025012', status: 'waiting' },
];

async function openQueue(path = '/queue') {
  const api = fakeApi({ listCandidates: vi.fn(async () => people) });
  const view = renderApp(path, { api, auth: fakeAuth({ signedInAs: profile('queue_manager') }).backend });
  await screen.findByRole('region', { name: 'Panel 1' });
  return { ...view, api };
}

async function listedNumbers(): Promise<string[]> {
  const list = await screen.findByRole('list', { name: 'Candidates' });
  return within(list).getAllByRole('listitem').map((item) => item.querySelector('.tabular-nums')?.textContent ?? '');
}

describe('candidate list', () => {
  it('opens from the Registered count and lists every registered candidate, with check-in', async () => {
    const { api, router } = await openQueue();
    await userEvent.click(screen.getByRole('button', { name: 'Registered 40' }));

    const dialog = await screen.findByRole('dialog', { name: 'Candidates' });
    expect(router.state.location.search).toBe('?list=registered');
    expect(within(dialog).getByRole('button', { name: 'Registered 40' })).toHaveAttribute('aria-pressed', 'true');
    expect(await listedNumbers()).toEqual(['#3', '#5']);
    expect(within(dialog).getByText('عائشہ خان')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Check in #5' }));
    expect(api.checkIn).toHaveBeenCalledWith('c5');
  });

  it('switches between statuses and says where each person is', async () => {
    await openQueue('/queue?list=registered');
    const dialog = await screen.findByRole('dialog', { name: 'Candidates' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Waiting 4' }));
    expect(await listedNumbers()).toEqual(['#12', '#20']);
    expect(within(dialog).getByText('2025012 · Waiting · lined up for Panel 2 (#1)')).toBeInTheDocument();
    expect(within(dialog).getByText('2025020 · Waiting · pool #1')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Check in/ })).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: 'All 61' }));
    expect(await listedNumbers()).toEqual(['#1', '#3', '#5', '#7', '#12', '#20']);
    expect(within(dialog).getByText('2025007 · Interviewing in Panel 1')).toBeInTheDocument();
  });

  it('narrows the list with the filter box', async () => {
    await openQueue('/queue?list=all');
    const dialog = await screen.findByRole('dialog', { name: 'Candidates' });
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Filter candidates' }), 'khan');
    expect(await listedNumbers()).toEqual(['#20']);
    await userEvent.clear(within(dialog).getByRole('searchbox', { name: 'Filter candidates' }));
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Filter candidates' }), 'zzz');
    expect(await within(dialog).findByText('No candidate matches “zzz”.')).toBeInTheDocument();
  });

  it('opens straight from a link and closes with Escape', async () => {
    const { router } = await openQueue('/queue?list=interviewed');
    await screen.findByRole('dialog', { name: 'Candidates' });
    expect(await listedNumbers()).toEqual(['#1']);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Candidates' })).toBeNull());
    expect(router.state.location.search).toBe('');
  });

  it('gives admins a link to every list from their home page', async () => {
    renderApp('/admin', { auth: fakeAuth({ signedInAs: profile('admin') }).backend });
    const section = await screen.findByRole('region', { name: 'Candidates' });
    const links = within(section).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]);
    expect(links).toEqual([
      ['Registered', '/queue?list=registered'],
      ['Waiting', '/queue?list=waiting'],
      ['Interviewing', '/queue?list=interviewing'],
      ['Interviewed', '/queue?list=interviewed'],
      ['Everyone', '/queue?list=all'],
    ]);
  });
});
