import { ActionButton, buttonClasses } from '../components/ActionButton.tsx';
import { useApi } from '../lib/ApiProvider.tsx';
import type { BoardSnapshot, CandidateStatus } from '../lib/types.ts';
import { SearchBox } from './SearchBox.tsx';

const COUNTS: Array<[CandidateStatus, string]> = [
  ['registered', 'Registered'],
  ['waiting', 'Waiting'],
  ['interviewing', 'Interviewing'],
  ['interviewed', 'Interviewed'],
];

export function TopBar({ board, onImport }: { board: BoardSnapshot; onImport: () => void }) {
  const api = useApi();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <dl aria-label="Candidate counts" className="flex flex-wrap gap-2 text-sm">
        {COUNTS.map(([status, label]) => (
          <div key={status} className="rounded-md bg-slate-100 px-2.5 py-1">
            <dt className="inline text-slate-600">{label} </dt>
            <dd className="inline font-semibold tabular-nums">{board.counts[status]}</dd>
          </div>
        ))}
      </dl>
      <SearchBox board={board} />
      <div className="ml-auto flex gap-2">
        <button type="button" className={buttonClasses('secondary', 'md')} onClick={onImport}>
          Import CSV
        </button>
        <ActionButton variant="primary" size="md" action={() => api.addPanel()}>
          + Add panel
        </ActionButton>
      </div>
    </div>
  );
}
