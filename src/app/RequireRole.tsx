import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { FullPageMessage } from '../components/FullPageMessage.tsx';
import type { Role } from '../lib/types.ts';
import { homePath } from './homePath.ts';

/** Inside StaffLayout (which handles loading and signed-out): shows the page only to these roles. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== 'signed_in') return null;
  if (!roles.includes(state.profile.role)) {
    return (
      <FullPageMessage title="You don't have access to this page">
        <Link className="font-medium text-brand-600 underline" to={homePath(state.profile.role)}>
          Go to your screen
        </Link>
      </FullPageMessage>
    );
  }
  return <>{children}</>;
}
