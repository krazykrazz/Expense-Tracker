import '@testing-library/jest-dom';
import { vi, afterEach, beforeAll, afterAll } from 'vitest';
import React from 'react';

// Detect CI environment
const isCI = import.meta.env?.CI === 'true' || 
             import.meta.env?.GITHUB_ACTIONS === 'true' ||
             process.env?.CI === 'true' || 
             process.env?.GITHUB_ACTIONS === 'true';

// Export for use in tests
globalThis.isCI = isCI;

// import.meta.env is automatically provided by Vite/Vitest
// The VITE_API_BASE_URL is set in vitest.config.js test.env

// Mock react-pdf for testing environment
vi.mock('react-pdf', () => ({
  Document: ({ children, onLoadSuccess, onLoadError, loading, error }) => {
    // Simulate successful PDF load for tests
    setTimeout(() => {
      if (onLoadSuccess) {
        onLoadSuccess({ numPages: 2 });
      }
    }, 0);
    
    return children || loading || null;
  },
  Page: ({ pageNumber, scale, className }) => 
    React.createElement('div', {
      className: className,
      'data-testid': 'pdf-page',
      'data-page': pageNumber,
      'data-scale': scale
    }, `PDF Page ${pageNumber}`),
  pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    version: '3.0.0'
  }
}));

// Mock EventSource — jsdom does not provide it
// Tests that need fine-grained control can override this with vi.stubGlobal('EventSource', ...)
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instances.push(this);
  }
  close() {
    this.readyState = 2; // CLOSED
  }
  // Helper used by tests to simulate events
  _triggerOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  _triggerMessage(data) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
  _triggerError() {
    this.onerror?.();
  }
}
MockEventSource.instances = [];
MockEventSource.CONNECTING = 0;
MockEventSource.OPEN = 1;
MockEventSource.CLOSED = 2;

globalThis.EventSource = MockEventSource;

// Clean up after each test to prevent memory leaks and state pollution
afterEach(() => {
  MockEventSource.instances = [];
  // Clear all timers to prevent "window is not defined" errors
  vi.clearAllTimers();
  
  // Clear all mocks
  vi.clearAllMocks();
  
  // Reset modules if needed (uncomment if tests have module state issues)
  // vi.resetModules();
});

// Use fake timers by default to prevent timing-related flakiness
// Individual tests can opt out with vi.useRealTimers()
beforeAll(() => {
  // Don't use fake timers globally as it can break some tests
  // Tests that need fake timers should enable them explicitly
});

afterAll(() => {
  // Ensure all timers are cleared
  vi.useRealTimers();
});

// Suppress console noise in CI
if (isCI) {
  const originalConsole = { ...console };
  
  beforeAll(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    // Keep console.error for debugging
  });
  
  afterAll(() => {
    Object.assign(console, originalConsole);
  });
}
