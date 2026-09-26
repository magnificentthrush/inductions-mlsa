import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/api.ts';
import { useApi } from '../lib/ApiProvider.tsx';
import type { BoardSnapshot, CandidateSummary } from '../lib/types.ts';

/**
 * Every candidate's number, name, reg number and status, while `active`. Re-read whenever the board
 * reloads (board.server_time changes), so statuses stay fresh after check-ins and send-ins.
 */
export function useCandidates(board: BoardSnapshot, active: boolean): { list: CandidateSummary[] | null; error: string | null } {
  const api = useApi();
  const [list, setList] = useState<CandidateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inductionId = board.induction.id;
  const boardVersion = board.server_time;

  useEffect(() => {
    if (!active) return;
    let current = true;
    api.listCandidates(inductionId).then(
      (rows) => {
        if (!current) return;
        setList(rows);
        setError(null);
      },
      (e) => current && setError(errorMessage(e)),
    );
    return () => {
      current = false;
    };
  }, [api, inductionId, active, boardVersion]);

  return { list, error };
}
