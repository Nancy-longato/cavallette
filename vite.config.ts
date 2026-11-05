import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' = percorsi relativi: funziona su GitHub Pages (in sottocartella) e su qualsiasi altro hosting.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
