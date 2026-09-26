import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { errorMessage } from '../lib/api.ts';
import { useToast } from './Toasts.tsx';

/** Runs an action; resolves to its result, or undefined if it failed (the failure is already shown). */
export type RunAction = <T>(action: () => Promise<T>) => Promise<T | undefined>;

const RunContext = createContext<RunAction>(async (action) => {
  try {
    return await action();
  } catch {
    return undefined;
  }
});

/**
 * Every button on a screen runs its action through here: a failure shows the server's message as a
 * toast, and either way `onSettled` runs (screens pass their snapshot reload).
 */
export function ActionProvider({ onSettled, children }: { onSettled?: () => void; children: ReactNode }) {
  const toast = useToast();
  const run = useCallback<RunAction>(
    async (action) => {
      try {
        return await action();
      } catch (e) {
        toast.show(errorMessage(e), 'error');
        return undefined;
      } finally {
        onSettled?.();
      }
    },
    [toast, onSettled],
  );
  return <RunContext.Provider value={run}>{children}</RunContext.Provider>;
}

export function useRunAction(): RunAction {
  return useContext(RunContext);
}
