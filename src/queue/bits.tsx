import { ActionButton } from '../components/ActionButton.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { LaneEntry } from '../lib/types.ts';

/** "#12 Ali Raza". <bdi> keeps an Urdu name from reordering the number around it. */
export function CandidateName({ number, name, className = '' }: { number: number; name: string; className?: string }) {
  return (
    <span className={`min-w-0 truncate ${className}`}>
      <span className="tabular-nums">#{number}</span> <bdi>{name}</bdi>
    </span>
  );
}

export function SkipBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800" title="Times skipped">
      skipped {count}×
    </span>
  );
}

/** ↑ ↓ ⤒ for one person in a lane (laneId null = the waiting pool). */
export function MoveButtons({ entry, laneId, laneLength }: { entry: LaneEntry; laneId: string | null; laneLength: number }) {
  const api = useApi();
  const who = `#${entry.number}`;
  const moveTo = (position: number) => () => api.moveCandidate(entry.candidate_id, laneId, position);
  return (
    <>
      <ActionButton className="w-8" label={`Move ${who} up`} disabled={entry.position === 1} action={moveTo(entry.position - 1)}>
        <span className="text-base leading-none">↑</span>
      </ActionButton>
      <ActionButton className="w-8" label={`Move ${who} down`} disabled={entry.position === laneLength} action={moveTo(entry.position + 1)}>
        <span className="text-base leading-none">↓</span>
      </ActionButton>
      <ActionButton className="w-8" label={`Move ${who} to the top`} disabled={entry.position === 1} action={moveTo(1)}>
        <span className="text-base leading-none">⤒</span>
      </ActionButton>
    </>
  );
}
