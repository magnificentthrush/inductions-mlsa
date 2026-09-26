import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clockOffsetMs } from './clock.ts';

interface ClockValue {
  /** This device's clock, updated once a second. */
  nowMs: number;
  /** Add to nowMs to get server time. */
  offsetMs: number;
}

const ClockContext = createContext<ClockValue>({ nowMs: Date.now(), offsetMs: 0 });

interface ClockProviderProps {
  /** Must be stable (e.g. api.serverNow). */
  serverNow: () => Promise<string>;
  children: ReactNode;
  tickMs?: number;
  resyncMs?: number;
}

/** One ticking clock for every timer, synced with server_now() on mount and every 5 minutes. */
export function ClockProvider({ serverNow, children, tickMs = 1000, resyncMs = 5 * 60_000 }: ClockProviderProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const sentAt = Date.now();
      try {
        const server = await serverNow();
        if (active) {
          const receivedAt = Date.now();
          setOffsetMs(clockOffsetMs(sentAt, server, receivedAt));
          setNowMs(receivedAt);
        }
      } catch {
        // Keep the previous offset; timers keep running on this device's clock.
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), resyncMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [serverNow, resyncMs]);

  return <ClockContext.Provider value={{ nowMs, offsetMs }}>{children}</ClockContext.Provider>;
}

export function useClock(): ClockValue {
  return useContext(ClockContext);
}
