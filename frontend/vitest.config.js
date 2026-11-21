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
    // Parallel execution configuration
    pool: 'forks',
    maxWorkers: isCI ? 4 : undefined,
    // Better error reporting
    reporters: isCI ? ['verbose'] : ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/**/*.test.{js,jsx}',
        'src/**/*.pbt.test.{js,jsx}',
        'src/**/*.integration.test.{js,jsx}',
        'src/test/**',
        'src/test-utils/**',
        'src/vite-env.d.ts'
      ]
    }
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://expense-tracker.test.invalid'),
    'import.meta.env.CI': JSON.stringify(isCI ? 'true' : 'false'),
    'import.meta.env.GITHUB_ACTIONS': JSON.stringify(process.env.GITHUB_ACTIONS || 'false')
  }
});
