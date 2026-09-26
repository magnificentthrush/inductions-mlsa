import type { LiveStatus } from '../lib/useLiveSnapshot.ts';

export function ConnectionBanner({ status }: { status: LiveStatus }) {
  if (status !== 'reconnecting') return null;
  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
      Reconnecting… The board will catch up as soon as the connection is back.
    </div>
  );
}
