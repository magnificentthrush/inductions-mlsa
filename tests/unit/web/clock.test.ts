import { describe, expect, it } from 'vitest';
import { clockOffsetMs, elapsedMs, formatElapsed, isOverTarget, parseServerTime } from '../../../src/lib/clock.ts';

describe('clock math', () => {
  it('parses Postgres timestamps with microseconds', () => {
    expect(parseServerTime('2026-09-26T10:00:00.123456+00:00')).toBe(Date.UTC(2026, 8, 26, 10, 0, 0, 123));
    expect(parseServerTime('2026-09-26T15:00:00+05:00')).toBe(Date.UTC(2026, 8, 26, 10, 0, 0));
  });

  it('measures the offset to the server clock, allowing for half the round trip', () => {
    // Sent at client 1000 ms, answered 200 ms later; the server said 5000 ms.
    expect(clockOffsetMs(1000, '1970-01-01T00:00:05.000Z', 1200)).toBe(5000 + 100 - 1200);
  });

  it('computes elapsed time on the server clock and never goes negative', () => {
    const started = '2026-09-26T10:00:00Z';
    const clientNow = Date.UTC(2026, 8, 26, 10, 14, 0);
    expect(elapsedMs(started, clientNow, 30_000)).toBe(14 * 60_000 + 30_000);
    expect(elapsedMs(started, clientNow, -20 * 60_000)).toBe(0);
  });

  it('formats minutes and seconds, adding hours only when needed', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(59_999)).toBe('00:59');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('turns amber exactly at the target length', () => {
    expect(isOverTarget(15 * 60_000 - 1, 15)).toBe(false);
    expect(isOverTarget(15 * 60_000, 15)).toBe(true);
  });
});
