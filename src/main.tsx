import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Replaced in Task 5 by the router and providers.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p className="p-6 text-lg">MLSA Induction</p>
  </StrictMode>,
);
