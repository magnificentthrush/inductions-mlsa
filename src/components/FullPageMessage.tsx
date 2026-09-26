import type { ReactNode } from 'react';

export function FullPageMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {children && <div className="text-sm text-slate-600">{children}</div>}
    </main>
  );
}
