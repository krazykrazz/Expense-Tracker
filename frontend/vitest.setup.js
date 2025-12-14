import '@testing-library/jest-dom';

// Mock import.meta.env for all tests
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_BASE_URL: 'http://localhost:2424'
  },
  writable: true
});
