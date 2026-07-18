import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4321',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // No node:* externalization. The web bundle must not import server-only modules.
  // If any value import from @mindbase/core slips into web code, the build should
  // fail loudly rather than silently produce a bundle that crashes in the browser.
});
