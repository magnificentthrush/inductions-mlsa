// Screens that arrive in Plan 3 (/panel and the full /admin). The admin page already offers the
// projector link, which the queue manager needs on induction day.
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { buttonClasses } from '../components/ActionButton.tsx';
import { FullPageMessage } from '../components/FullPageMessage.tsx';
import { useToast } from '../components/Toasts.tsx';
import { errorMessage } from '../lib/api.ts';
import { useApi } from '../lib/ApiProvider.tsx';
import { homePath } from './homePath.ts';

export function HomeRedirect() {
  const { state } = useAuth();
  return state.status === 'signed_in' ? <Navigate to={homePath(state.profile.role)} replace /> : null;
}

export function ComingSoon({ title }: { title: string }) {
  return <FullPageMessage title={title}>This screen arrives in the next update.</FullPageMessage>;
}

const ADMIN_LISTS: Array<[string, string]> = [
  ['registered', 'Registered'],
  ['waiting', 'Waiting'],
  ['interviewing', 'Interviewing'],
  ['interviewed', 'Interviewed'],
  ['all', 'Everyone'],
];

export function AdminHome() {
  const api = useApi();
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getDisplayKey().then(
      (key) => active && setLink(`${window.location.origin}/display?key=${encodeURIComponent(key)}`),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [api]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Projector link copied', 'success');
    } catch {
      toast.show('Copy failed. Select the link and copy it by hand.', 'error');
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Admin</h1>
      <p className="text-slate-600">
        Accounts, settings and results arrive in the next update. Meanwhile, run the day from the{' '}
        <Link className="font-medium text-brand-600 underline" to="/queue">
          queue board
        </Link>
        .
      </p>
      <section aria-labelledby="admin-candidates-title" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="admin-candidates-title" className="font-semibold">Candidates</h2>
        <p className="text-sm text-slate-600">See everyone who registered, and where each person is on the day.</p>
        <div className="flex flex-wrap gap-2">
          {ADMIN_LISTS.map(([filter, label]) => (
            <Link key={filter} className={buttonClasses('secondary')} to={`/queue?list=${filter}`}>
              {label}
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="projector-title" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="projector-title" className="font-semibold">Projector link</h2>
        {link ? (
          <>
            <p className="rounded-md bg-slate-100 px-3 py-2 font-mono text-sm break-all">{link}</p>
            <div className="flex gap-2">
              <button type="button" className={buttonClasses('primary')} onClick={() => void copy(link)}>
                Copy link
              </button>
              <a className={buttonClasses('secondary')} href={link} target="_blank" rel="noreferrer">
                Open projector
              </a>
            </div>
          </>
        ) : error ? (
          <p role="alert" className="text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
        <p className="text-sm text-slate-600">Anyone with this link sees the projector screen. Share it only with whoever runs the projector.</p>
      </section>
    </main>
  );
}

export function NotFound() {
  return (
    <FullPageMessage title="Page not found">
      <Link className="font-medium text-brand-600 underline" to="/">
        Go home
      </Link>
    </FullPageMessage>
  );
}
