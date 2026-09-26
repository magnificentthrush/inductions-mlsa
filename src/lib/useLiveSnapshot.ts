import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api.ts';
import type { Subscribe } from './realtime.ts';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

export interface LiveSnapshot<T> {
  /** undefined until the first successful load; then always the latest good snapshot. */
  data: T | undefined;
  /** The last load's error, cleared by the next successful load. */
  error: string | null;
  status: LiveStatus;
  reload: () => void;
}

/**
 * Loads a snapshot and reloads it when the realtime channel (re)subscribes, when it delivers an
 * event, and every `pollMs` if given. Loads never overlap: events that arrive during a load cause
 * exactly one more load afterwards. `load` and `subscribe` must be stable (useCallback/useMemo).
 */
export function useLiveSnapshot<T>(load: () => Promise<T>, subscribe: Subscribe, pollMs?: number): LiveSnapshot<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // `generation` changes whenever the subscription restarts, so late answers for an old one are dropped.
  const loop = useRef({ generation: 0, running: false, again: false });

  const reload = useCallback(() => {
    const state = loop.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    void (async () => {
      try {
        do {
          state.again = false;
          const generation = state.generation;
          try {
            const next = await load();
            if (generation === state.generation) {
              setData(next);
              setError(null);
            }
          } catch (e) {
            if (generation === state.generation) setError(errorMessage(e));
          }
        } while (state.again);
      } finally {
        state.running = false;
      }
    })();
  }, [load]);

  useEffect(() => {
    const state = loop.current;
    const generation = ++state.generation;
    setStatus('connecting');
    reload();
    const stop = subscribe({
      onEvent: reload,
      onStatus: (channelStatus) => {
        if (generation !== state.generation) return;
        if (channelStatus === 'subscribed') {
          setStatus('live');
          reload(); // anything broadcast while we were (re)connecting was missed
        } else {
          setStatus('reconnecting');
        }
      },
    });
    const timer = pollMs ? setInterval(reload, pollMs) : undefined;
    return () => {
      state.generation++;
      stop();
      if (timer) clearInterval(timer);
    };
  }, [subscribe, pollMs, reload]);

  return { data, error, status, reload };
}
