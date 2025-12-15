import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js'
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://localhost:2424')
  }
});
