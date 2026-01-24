import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    // Longer timeouts in CI due to slower runners
    testTimeout: isCI ? 45000 : 30000,
    hookTimeout: isCI ? 30000 : 20000,
    // Retry flaky tests in CI
    retry: isCI ? 2 : 0,
    // Reduce parallelism in CI to avoid resource contention
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: isCI
      }
    },
    // Better error reporting
    reporters: isCI ? ['verbose'] : ['default'],
    // Fail fast in CI
    bail: isCI ? 1 : 0
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://localhost:2424'),
    'import.meta.env.CI': JSON.stringify(isCI ? 'true' : 'false'),
    'import.meta.env.GITHUB_ACTIONS': JSON.stringify(process.env.GITHUB_ACTIONS || 'false')
  }
});
