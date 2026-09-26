import type { SupabaseClient } from '@supabase/supabase-js';
import { notAllowed } from './notAllowed.ts';
import { broadcastSubscriber, type Subscribe } from './realtime.ts';
import type { BoardSnapshot, CandidateSummary, DisplaySnapshot, ImportResult, ImportRow } from './types.ts';

export const NETWORK_ERROR = "Can't reach the server. Check the connection and try again.";
export const NOT_ALLOWED = 'Not allowed';

/** An action or read failed; `message` is safe to show (usually the database's own short message). */
export class ApiError extends Error {}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong';
}

/** Turns a PostgREST/Postgres error into the message a person should see. */
export function friendlyMessage(error: { message?: string; code?: string }, status?: number): string {
  if (error.code === '42501') return NOT_ALLOWED; // require_role() and RLS both use this code
  if (status === 0 || /failed to fetch|fetch failed|networkerror/i.test(error.message ?? '')) return NETWORK_ERROR;
  return error.message?.trim() || 'Something went wrong';
}

/** Every call the screens make. One object per client; its methods are stable for React deps. */
export interface Api {
  boardSnapshot(): Promise<BoardSnapshot>;
  /** null for a wrong or regenerated projector key. */
  displaySnapshot(key: string): Promise<DisplaySnapshot | null>;
  serverNow(): Promise<string>;
  listCandidates(inductionId: string): Promise<CandidateSummary[]>;
  getDisplayKey(): Promise<string>;
  checkIn(candidateId: string): Promise<void>;
  undoCheckIn(candidateId: string): Promise<void>;
  /** panelId null = the waiting pool; position null = end of the lane. */
  moveCandidate(candidateId: string, panelId: string | null, position: number | null): Promise<void>;
  skipCandidate(candidateId: string): Promise<void>;
  /** Returns the new interview's id. */
  sendIn(candidateId: string, panelId: string): Promise<string>;
  undoSendIn(interviewId: string): Promise<void>;
  endInterview(interviewId: string): Promise<void>;
  reopenInterview(interviewId: string): Promise<void>;
  /** Returns the new panel's id. */
  addPanel(): Promise<string>;
  deletePanel(panelId: string): Promise<void>;
  importCandidates(rows: ImportRow[]): Promise<ImportResult>;
  subscribeBoard(): Subscribe;
  subscribeDisplay(key: string): Subscribe;
}

export function createApi(client: SupabaseClient): Api {
  function fail(error: { message?: string; code?: string }, status?: number): ApiError {
    const message = friendlyMessage(error, status);
    if (message === NOT_ALLOWED) notAllowed.emit();
    return new ApiError(message);
  }

  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    let response;
    try {
      response = await client.rpc(fn, args);
    } catch {
      throw new ApiError(NETWORK_ERROR);
    }
    if (response.error) throw fail(response.error, response.status);
    return response.data as T;
  }

  return {
    boardSnapshot: () => rpc<BoardSnapshot>('board_snapshot'),
    displaySnapshot: (key) => rpc<DisplaySnapshot | null>('display_snapshot', { p_key: key }),
    serverNow: () => rpc<string>('server_now'),
    async listCandidates(inductionId) {
      let response;
      try {
        response = await client
          .from('candidates')
          .select('id, number, full_name, reg_number, status')
          .eq('induction_id', inductionId)
          .order('number');
      } catch {
        throw new ApiError(NETWORK_ERROR);
      }
      if (response.error) throw fail(response.error, response.status);
      return response.data as CandidateSummary[];
    },
    getDisplayKey: () => rpc<string>('get_display_key'),
    checkIn: (candidateId) => rpc<void>('check_in', { p_candidate_id: candidateId }),
    undoCheckIn: (candidateId) => rpc<void>('undo_check_in', { p_candidate_id: candidateId }),
    moveCandidate: (candidateId, panelId, position) =>
      rpc<void>('move_candidate', { p_candidate_id: candidateId, p_panel_id: panelId, p_position: position }),
    skipCandidate: (candidateId) => rpc<void>('skip_candidate', { p_candidate_id: candidateId }),
    sendIn: (candidateId, panelId) => rpc<string>('send_in', { p_candidate_id: candidateId, p_panel_id: panelId }),
    undoSendIn: (interviewId) => rpc<void>('undo_send_in', { p_interview_id: interviewId }),
    endInterview: (interviewId) => rpc<void>('end_interview', { p_interview_id: interviewId }),
    reopenInterview: (interviewId) => rpc<void>('reopen_interview', { p_interview_id: interviewId }),
    addPanel: () => rpc<string>('add_panel'),
    deletePanel: (panelId) => rpc<void>('delete_panel', { p_panel_id: panelId }),
    importCandidates: (rows) => rpc<ImportResult>('import_candidates', { p_rows: rows }),
    subscribeBoard: () => broadcastSubscriber(client, 'board', true),
    subscribeDisplay: (key) => broadcastSubscriber(client, `display:${key}`, false),
  };
}
