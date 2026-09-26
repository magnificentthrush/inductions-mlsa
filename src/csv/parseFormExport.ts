import Papa from 'papaparse';
import type { ImportRow } from '../lib/types.ts';
import { FORM_LAYOUT, type FormLayout } from './formLayout.ts';

export interface HeaderMismatch {
  /** 1-based, as a spreadsheet user counts columns. */
  column: number;
  expected: string;
  found: string;
}

export type ParseResult =
  | { ok: true; rows: ImportRow[]; warnings: string[] }
  | { ok: false; error: string; mismatches: HeaderMismatch[] };

export function normalizeHeader(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Google Sheets' "M/D/YYYY H:MM:SS" in the form's time zone → ISO 8601, or null if unreadable. */
export function parseSheetsTimestamp(text: string, utcOffset: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const [month, day, year, hour, minute, second] = [1, 2, 3, 4, 5, 6].map((i) => Number(match[i] ?? '0'));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${utcOffset}`;
}

/**
 * Reads a Google Forms CSV export in the browser. Stops (imports nothing) when the header row doesn't
 * match the layout or a row has the wrong number of columns. Every row is returned, including
 * duplicates and rows without a reg number: import_candidates de-duplicates and flags those.
 */
export function parseFormExport(text: string, layout: FormLayout = FORM_LAYOUT): ParseResult {
  const fail = (error: string, mismatches: HeaderMismatch[] = []): ParseResult => ({ ok: false, error, mismatches });
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const [header, ...records] = parsed.data;
  if (!header) return fail('The file is empty.');

  const expected = layout.columns.map((column) => normalizeHeader(column.header));
  const found = header.map(normalizeHeader);
  const mismatches: HeaderMismatch[] = [];
  for (let i = 0; i < Math.max(expected.length, found.length); i++) {
    if (expected[i] !== found[i]) {
      mismatches.push({ column: i + 1, expected: expected[i] ?? '(no column)', found: found[i] ?? '(missing)' });
    }
  }
  if (mismatches.length > 0) {
    return fail(`The columns don't match the ${layout.name}. Nothing was imported.`, mismatches);
  }
  if (records.length === 0) return fail('The file has no responses.');

  const rows: ImportRow[] = [];
  const warnings: string[] = [];
  for (const [index, cells] of records.entries()) {
    const rowNumber = index + 2; // the header is row 1
    if (cells.length !== layout.columns.length) {
      return fail(`Row ${rowNumber} has ${cells.length} columns; expected ${layout.columns.length}. Nothing was imported.`);
    }
    const { row, rawTimestamp } = mapRow(cells, layout);
    if (row.submitted_at === null) {
      warnings.push(
        `Row ${rowNumber} (${row.full_name || 'no name'}): the timestamp "${rawTimestamp}" can't be read, ` +
          'so this person is numbered as if they submitted just now.',
      );
    }
    rows.push(row);
  }
  return { ok: true, rows, warnings };
}

function mapRow(cells: string[], layout: FormLayout): { row: ImportRow; rawTimestamp: string } {
  const row: ImportRow = {
    submitted_at: null,
    reg_number: '',
    full_name: '',
    email: '',
    account_email: '',
    phone: '',
    department: '',
    batch: '',
    preferences: ['', '', '', ''],
    answers: { general: [], dev: [], logikal: [], lnd: [], marketing: [] },
  };
  let rawTimestamp = '';
  layout.columns.forEach((column, i) => {
    const value = (cells[i] ?? '').trim();
    const target = column.target;
    if (target.kind === 'answer') {
      row.answers[target.section].push({ q: normalizeHeader(column.header), a: value });
    } else if (target.kind === 'preference') {
      row.preferences[target.rank - 1] = value;
    } else if (target.field === 'submitted_at') {
      rawTimestamp = value;
      row.submitted_at = parseSheetsTimestamp(value, layout.utcOffset);
    } else {
      row[target.field] = value;
    }
  });
  return { row, rawTimestamp };
}
