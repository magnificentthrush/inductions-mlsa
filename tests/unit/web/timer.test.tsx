// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timer } from '../../../src/components/Timer.tsx';
import { ClockProvider } from '../../../src/lib/ClockProvider.tsx';

describe('Timer', () => {
  afterEach(() => vi.useRealTimers());

  it('counts on the server clock and turns amber at the target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const serverNow = vi.fn(async () => '2026-09-26T10:00:30.000000+00:00'); // server is 30 s ahead
    render(
      <ClockProvider serverNow={serverNow}>
        <Timer startedAt="2026-09-26T09:45:10+00:00" targetMinutes={15} />
      </ClockProvider>,
    );
    expect(screen.getByText('14:50')).not.toHaveAttribute('data-over-target');

    await act(async () => {}); // the clock sync resolves
    expect(screen.getByText('15:20')).toHaveAttribute('data-over-target', 'true');
    expect(screen.getByText('15:20')).toHaveClass('text-amber-600');

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('15:21')).toBeInTheDocument();
  });

  it('keeps running on the local clock when the server cannot be reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    render(
      <ClockProvider serverNow={() => Promise.reject(new Error('offline'))}>
        <Timer startedAt="2026-09-26T09:59:00Z" targetMinutes={15} />
      </ClockProvider>,
    );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('01:02')).toBeInTheDocument();
  });
});
