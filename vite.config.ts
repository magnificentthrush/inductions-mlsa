import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // One small app for ~25 staff screens and a projector: ~170 KB gzipped, mostly React and supabase-js.
    chunkSizeWarningLimit: 800,
  },
});
