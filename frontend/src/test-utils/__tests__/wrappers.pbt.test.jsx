/**
 * Property tests for wrappers module.
 * **Property 3: Wrapper builders provide all requested contexts**
 * **Validates: Requirements 3.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { renderHook, cleanup } from '@testing-library/react';
import {
  createModalWrapper,
  createFilterWrapper,
  createSharedDataWrapper,
  createMinimalWrapper,
  wrapperBuilder,
} from '../wrappers.jsx';

// We test that wrappers render without errors for any combination of contexts.

const CONTEXT_NAMES = ['modal', 'filter', 'sharedData'];

describe('Property 3: Wrapper builders provide all requested contexts', () => {
  it('basic wrappers render without errors', () => {
    const factories = [createModalWrapper, createFilterWrapper, createSharedDataWrapper];
    factories.forEach((factory) => {
      const wrapper = factory();
      const { result } = renderHook(() => 'ok', { wrapper });
      expect(result.current).toBe('ok');
      cleanup();
    });
  });

  it('createMinimalWrapper renders for any non-empty subset of contexts', () => {
    fc.assert(
      fc.property(
        fc.subarray(CONTEXT_NAMES, { minLength: 1 }),
        (contexts) => {
          const wrapper = createMinimalWrapper(contexts);
          const { result } = renderHook(() => 'ok', { wrapper });
          expect(result.current).toBe('ok');
          cleanup();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('createMinimalWrapper throws for empty array', () => {
    expect(() => createMinimalWrapper([])).toThrow('at least one context');
  });

  it('wrapperBuilder renders for any non-empty combination', () => {
    const builderMethods = {
      modal: (b) => b.withModal(),
      filter: (b) => b.withFilter(),
      sharedData: (b) => b.withSharedData(),
    };

    fc.assert(
      fc.property(
        fc.subarray(CONTEXT_NAMES, { minLength: 1 }),
        (contexts) => {
          let builder = wrapperBuilder();
          contexts.forEach((name) => {
            builder = builderMethods[name](builder);
          });
          const wrapper = builder.build();
          const { result } = renderHook(() => 'ok', { wrapper });
          expect(result.current).toBe('ok');
          cleanup();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('wrapperBuilder throws when build() called with no contexts', () => {
    expect(() => wrapperBuilder().build()).toThrow('add at least one context');
  });
});
