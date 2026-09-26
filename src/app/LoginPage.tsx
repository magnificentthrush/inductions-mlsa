import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { buttonClasses } from '../components/ActionButton.tsx';
import { homePath, safeNext } from './homePath.ts';

export function LoginPage() {
  const { state, signIn } = useAuth();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · MLSA Induction';
  }, []);

  if (state.status === 'signed_in') {
    return <Navigate to={safeNext(params.get('next')) ?? homePath(state.profile.role)} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const message = await signIn(username, password);
    setPending(false);
    if (message) setError(message);
  }

  const message = error ?? (state.status === 'signed_out' ? state.notice : null);
  const inputClasses = 'mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={onSubmit} aria-labelledby="login-title" className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="text-sm font-semibold text-brand-600">Microsoft Club GIKI</p>
          <h1 id="login-title" className="text-xl font-semibold">Induction sign in</h1>
        </div>
        {message && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {message}
          </p>
        )}
        <label className="block text-sm font-medium">
          Username
          <input
            className={inputClasses}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input className={inputClasses} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={pending || state.status === 'loading'} className={`${buttonClasses('primary', 'md')} w-full`}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
