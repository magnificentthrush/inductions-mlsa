import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppProviders } from './app/AppProviders.tsx';
import { routes } from './app/routes.tsx';
import { supabaseAuthBackend } from './auth/authBackend.ts';
import './index.css';
import { createApi } from './lib/api.ts';
import { supabase } from './lib/supabase.ts';

const api = createApi(supabase);
const auth = supabaseAuthBackend(supabase);
const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders api={api} auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
