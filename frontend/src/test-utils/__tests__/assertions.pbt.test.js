/**
 * Property tests for assertions module.
 * **Property 5: Async assertions wait for conditions correctly**
 * **Property 8: Failed assertions include diagnostic information**
 * **Validates: Requirements 3.3, 2.5, 5.5**
  *
 * @invariant Assertion Correctness: For any test condition, the custom assertions correctly distinguish passing from failing states; failed assertions include diagnostic information. Randomization covers diverse condition inputs.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  assertSequenceResult,
  assertModalOpen,
  assertModalClosed,
  assertAllModalsClosed,
  assertIdempotence,
} from '../assertions';

describe('Property 5: Async assertions wait for conditions correctly', () => {
  it('assertIdempotence passes when operation is truly idempotent', async () => {
    let value = 0;
    const idempotentOp = async () => { value = 42; };
    const getter = () => value;
    await expect(assertIdempotence(idempotentOp, getter)).resolves.toBeUndefined();
  });

  it('assertIdempotence fails when operation is not idempotent', async () => {
    let counter = 0;
    const nonIdempotentOp = async () => { counter++; };
    const getter = () => counter;
    await expect(assertIdempotence(nonIdempotentOp, getter)).rejects.toThrow('Idempotence violated');
  });
});

describe('Property 8: Failed assertions include diagnostic information', () => {
  describe('assertSequenceResult diagnostics', () => {
    it('correctly validates final state for any open/close sequence', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('open', 'close'), { minLength: 1, maxLength: 30 }),
          (ops) => {
            const lastOp = ops[ops.length - 1];
            const expectedState = lastOp === 'open';
            // Should not throw when state matches
            expect(() => assertSequenceResult(ops, expectedState)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('throws with sequence info when state mismatches', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('open', 'close'), { minLength: 1, maxLength: 30 }),
          (ops) => {
            const lastOp = ops[ops.length - 1];
            const wrongState = lastOp !== 'open';
            try {
              assertSequenceResult(ops, wrongState);
              // Should have thrown
              expect.unreachable('Should have thrown');
            } catch (e) {
              expect(e.message).toContain('Sequence');
              expect(e.message).toContain('expected final state');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('throws for empty operations array', () => {
      expect(() => assertSequenceResult([], true)).toThrow('must not be empty');
    });
  });

  describe('Modal assertion diagnostics', () => {
    it('assertModalOpen throws with modal name when closed', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('expenseForm', 'settings', 'analytics'),
          (name) => {
            const state = { [`show${name.charAt(0).toUpperCase() + name.slice(1)}`]: false };
            try {
              assertModalOpen(state, name);
              expect.unreachable('Should have thrown');
            } catch (e) {
              expect(e.message).toContain(name);
              expect(e.message).toContain('open');
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('assertModalClosed throws with modal name when open', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('expenseForm', 'settings', 'analytics'),
          (name) => {
            const state = { [`show${name.charAt(0).toUpperCase() + name.slice(1)}`]: true };
            try {
              assertModalClosed(state, name);
              expect.unreachable('Should have thrown');
            } catch (e) {
              expect(e.message).toContain(name);
              expect(e.message).toContain('closed');
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('assertAllModalsClosed throws with offending key name', () => {
      const state = { showExpenseForm: false, showSettings: true, showAnalytics: false };
      try {
        assertAllModalsClosed(state);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e.message).toContain('showSettings');
      }
    });

    it('assertAllModalsClosed passes when all modals closed', () => {
      fc.assert(
        fc.property(
          fc.record({
            showA: fc.constant(false),
            showB: fc.constant(false),
            showC: fc.constant(false),
          }),
          (state) => {
            expect(() => assertAllModalsClosed(state)).not.toThrow();
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
