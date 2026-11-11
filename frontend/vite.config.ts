import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The backend (backend/, `npm run dev`) listens on 3001. In production
    // nginx forwards /api to the backend container instead.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
