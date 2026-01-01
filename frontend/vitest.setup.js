import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

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
