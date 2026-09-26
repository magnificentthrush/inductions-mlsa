import { useState } from 'react';
import { buttonClasses } from '../components/ActionButton.tsx';
import { useRunAction } from '../components/ActionProvider.tsx';
import { parseFormExport, type HeaderMismatch } from '../csv/parseFormExport.ts';
import { useApi } from '../lib/ApiProvider.tsx';
import type { ImportResult, ImportRow } from '../lib/types.ts';

type Step =
  | { kind: 'choose'; error: string | null }
  | { kind: 'mismatch'; fileName: string; error: string; mismatches: HeaderMismatch[] }
  | { kind: 'ready'; fileName: string; rows: ImportRow[]; warnings: string[]; importing: boolean }
  | { kind: 'done'; result: ImportResult };

/** Reads the Google Forms CSV in the browser, checks it, imports it in one call, and shows the summary. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const run = useRunAction();
  const [step, setStep] = useState<Step>({ kind: 'choose', error: null });
  const busy = step.kind === 'ready' && step.importing;

  async function onFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setStep({ kind: 'choose', error: "Couldn't read that file." });
      return;
    }
    const parsed = parseFormExport(text);
    if (parsed.ok) {
      setStep({ kind: 'ready', fileName: file.name, rows: parsed.rows, warnings: parsed.warnings, importing: false });
    } else if (parsed.mismatches.length > 0) {
      setStep({ kind: 'mismatch', fileName: file.name, error: parsed.error, mismatches: parsed.mismatches });
    } else {
      setStep({ kind: 'choose', error: parsed.error });
    }
  }

  async function onImport() {
    if (step.kind !== 'ready' || step.importing) return;
    setStep({ ...step, importing: true });
    const result = await run(() => api.importCandidates(step.rows));
    setStep(result ? { kind: 'done', result } : { ...step, importing: false });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="w-full max-w-2xl space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="import-title" className="text-lg font-semibold">Import candidates from CSV</h2>
          <button type="button" className={buttonClasses('ghost')} onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {step.kind === 'choose' && (
          <>
            <p className="text-sm text-slate-600">
              In the Google Form's responses sheet choose File → Download → CSV, then pick that file. Importing again later is safe:
              existing candidates keep their number and their place in the queue.
            </p>
            {step.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{step.error}</p>}
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              autoFocus
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-700"
            />
          </>
        )}

        {step.kind === 'mismatch' && (
          <>
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {step.fileName}: {step.error}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Column</th>
                    <th className="px-3 py-2">Expected</th>
                    <th className="px-3 py-2">Found</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {step.mismatches.map((m) => (
                    <tr key={m.column}>
                      <td className="px-3 py-2 tabular-nums">{m.column}</td>
                      <td className="px-3 py-2">{m.expected}</td>
                      <td className="px-3 py-2">{m.found}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className={buttonClasses('secondary', 'md')} onClick={() => setStep({ kind: 'choose', error: null })}>
              Choose another file
            </button>
          </>
        )}

        {step.kind === 'ready' && (
          <>
            <p className="text-sm">
              <span className="font-medium">{step.fileName}</span>: {step.rows.length} {step.rows.length === 1 ? 'response' : 'responses'} ready to import.
            </p>
            {step.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {step.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button type="button" className={buttonClasses('primary', 'md')} onClick={() => void onImport()} disabled={step.importing}>
                {step.importing ? 'Importing…' : `Import ${step.rows.length} ${step.rows.length === 1 ? 'response' : 'responses'}`}
              </button>
              <button type="button" className={buttonClasses('secondary', 'md')} onClick={() => setStep({ kind: 'choose', error: null })} disabled={step.importing}>
                Choose another file
              </button>
            </div>
          </>
        )}

        {step.kind === 'done' && (
          <>
            <p className="text-sm font-medium">
              Added {step.result.added} · Updated {step.result.updated}
            </p>
            {step.result.flagged.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing needs a closer look.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-amber-200">
                <table className="w-full text-left text-sm">
                  <caption className="bg-amber-50 px-3 py-2 text-left font-medium text-amber-900">Needs a closer look</caption>
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Reg number</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {step.result.flagged.map((flag, i) => (
                      <tr key={`${flag.reg_number}-${i}`}>
                        <td className="px-3 py-2 tabular-nums">{flag.reg_number || '—'}</td>
                        <td className="px-3 py-2"><bdi>{flag.name}</bdi></td>
                        <td className="px-3 py-2">{flag.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button type="button" className={buttonClasses('primary', 'md')} onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
