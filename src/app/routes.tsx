import type { RouteObject } from 'react-router';
import { LoginPage } from './LoginPage.tsx';
import { AdminHome, ComingSoon, HomeRedirect, NotFound } from './placeholders.tsx';
import { RequireRole } from './RequireRole.tsx';
import { StaffLayout } from './StaffLayout.tsx';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/display', element: <ComingSoon title="Projector" /> },
  {
    path: '/',
    element: <StaffLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'queue', element: <RequireRole roles={['queue_manager', 'admin']}><ComingSoon title="Queue board" /></RequireRole> },
      { path: 'panel', element: <RequireRole roles={['panelist', 'admin']}><ComingSoon title="Panelist screen" /></RequireRole> },
      { path: 'admin', element: <RequireRole roles={['admin']}><AdminHome /></RequireRole> },
    ],
  },
  { path: '*', element: <NotFound /> },
];
