import type { ReactNode } from 'react';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import type { AuthBackend } from '../auth/authBackend.ts';
import { ToastProvider } from '../components/Toasts.tsx';
import type { Api } from '../lib/api.ts';
import { ApiProvider } from '../lib/ApiProvider.tsx';
import { ClockProvider } from '../lib/ClockProvider.tsx';

/** Everything a screen can rely on. main.tsx passes the real Supabase-backed pieces; tests pass fakes. */
export function AppProviders({ api, auth, children }: { api: Api; auth: AuthBackend; children: ReactNode }) {
  return (
    <ApiProvider api={api}>
      <AuthProvider backend={auth}>
        <ToastProvider>
          <ClockProvider serverNow={api.serverNow}>{children}</ClockProvider>
        </ToastProvider>
      </AuthProvider>
    </ApiProvider>
  );
}
