// Test data shaped like the database functions' output (see src/lib/types.ts).
import type { BoardPanel, BoardSnapshot, CurrentInterview, DisplaySnapshot, LaneEntry, Profile, Role } from '../../../src/lib/types.ts';

const reg = (number: number) => `2025${String(number).padStart(3, '0')}`;

export function lane(...people: Array<[number, string]>): LaneEntry[] {
  return people.map(([number, name], i) => ({
    candidate_id: `c${number}`,
    number,
    name,
    reg_number: reg(number),
    position: i + 1,
    skip_count: 0,
    checked_in_at: '2026-09-26T09:00:00Z',
  }));
}

export function interview(number: number, name: string, startedAt = '2026-09-26T09:50:00Z'): CurrentInterview {
  return { interview_id: `i${number}`, candidate_id: `c${number}`, number, name, reg_number: reg(number), started_at: startedAt };
}

export function boardPanel(id: string, name: string, overrides: Partial<BoardPanel> = {}): BoardPanel {
  return { id, name, is_default: false, current: null, last_ended: null, lane: [], panelists: [], ...overrides };
}

/** Panel 1 busy with #7, Panel 2 free with #12 lined up, three people in the pool. */
export function board(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    induction: { id: 'ind-1', name: 'Fall 2026', target_interview_minutes: 15, results_published: false },
    server_time: '2026-09-26T10:00:00Z',
    counts: { registered: 40, waiting: 4, interviewing: 1, interviewed: 16 },
    panels: [
      boardPanel('p1', 'Panel 1', { is_default: true, current: interview(7, 'Sara Ahmed'), panelists: [{ id: 'u1', display_name: 'Hamza' }, { id: 'u2', display_name: 'Mariam' }] }),
      boardPanel('p2', 'Panel 2', { is_default: true, lane: lane([12, 'Ali Raza']) }),
    ],
    pool: lane([20, 'Bilal Khan'], [21, 'عائشہ خان'], [22, "Zara O'Brien-Khan"]),
    ...overrides,
  };
}

/** The projector's view of the same moment. */
export function display(overrides: Partial<DisplaySnapshot> = {}): DisplaySnapshot {
  return {
    induction_name: 'Fall 2026',
    target_interview_minutes: 15,
    server_time: '2026-09-26T10:00:00Z',
    panels: [
      { id: 'p1', name: 'Panel 1', current: { number: 7, name: 'Sara Ahmed', started_at: '2026-09-26T09:50:00Z' }, lined_up: [] },
      { id: 'p2', name: 'Panel 2', current: null, lined_up: [{ number: 12, name: 'Ali Raza' }] },
    ],
    waiting: [
      { number: 20, name: 'Bilal Khan' },
      { number: 21, name: 'عائشہ خان' },
      { number: 22, name: "Zara O'Brien-Khan" },
    ],
    ...overrides,
  };
}

export function profile(role: Role, overrides: Partial<Profile> = {}): Profile {
  const username = role === 'queue_manager' ? 'queue' : role;
  return { id: `u-${username}`, username, display_name: `Test ${username}`, role, is_active: true, current_panel_id: null, ...overrides };
}
