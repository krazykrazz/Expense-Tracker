import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import UnifiedBillingCycleList from './UnifiedBillingCycleList';

describe('UnifiedBillingCycleList Property-Based Tests', () => {
  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    cleanup();
  });

  // Helper to generate valid date strings
  const dateStringArb = fc.tuple(
    fc.integer({ min: 2020, max: 2025 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => 
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

  // Arbitrary for generating valid billing cycle data
  const billingCycleArb = fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    payment_method_id: fc.integer({ min: 1, max: 100 }),
    cycle_start_date: dateStringArb,
    cycle_end_date: dateStringArb,
    actual_statement_balance: fc.float({ min: 0, max: 50000, noNaN: true })
      .filter(n => isFinite(n))
      .map(n => Math.round(n * 100) / 100),
    calculated_statement_balance: fc.float({ min: 0, max: 50000, noNaN: true })
      .filter(n => isFinite(n))
      .map(n => Math.round(n * 100) / 100),
    effective_balance: fc.float({ min: 0, max: 50000, noNaN: true })
      .filter(n => isFinite(n))
      .map(n => Math.round(n * 100) / 100),
    balance_type: fc.constantFrom('actual', 'calculated'),
    transaction_count: fc.integer({ min: 0, max: 500 }),
    trend_indicator: fc.option(
      fc.record({
        type: fc.constantFrom('higher', 'lower', 'same'),
        icon: fc.constantFrom('↑', '↓', '✓'),
        amount: fc.float({ min: 0, max: 5000, noNaN: true })
          .filter(n => isFinite(n))
          .map(n => Math.round(n * 100) / 100),
        cssClass: fc.constantFrom('trend-higher', 'trend-lower', 'trend-same')
      }),
      { nil: null }
    ),
    minimum_payment: fc.option(
      fc.float({ min: 0, max: 1000, noNaN: true })
        .filter(n => isFinite(n))
        .map(n => Math.round(n * 100) / 100),
      { nil: null }
    ),
    due_date: fc.option(dateStringArb, { nil: null }),
    notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
    statement_pdf_path: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: null })
  });

  /**
   * **Feature: unified-billing-cycles, Property 9: Action Buttons Consistent for All Cycles**
   * 
   * For any billing cycle displayed in the UI:
   * - All cycles SHALL display edit (pencil) and delete (trash) buttons
   * - Edit button calls onEdit for actual cycles, onEnterStatement for calculated cycles
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 9: should display edit/delete buttons for all cycles regardless of balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        billingCycleArb,
        async (cycle) => {
          const { container, unmount } = render(
            <UnifiedBillingCycleList cycles={[cycle]} />
          );

          // Should have edit button for all cycles
          const editButton = container.querySelector('.unified-cycle-action-btn.edit');
          expect(editButton).toBeTruthy();

          // Should have delete button for all cycles
          const deleteButton = container.querySelector('.unified-cycle-action-btn.delete');
          expect(deleteButton).toBeTruthy();

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: unified-billing-cycles, Property 9: Edit Button Behavior Based on Balance Type**
   * 
   * For any billing cycle:
   * - If balance_type is 'actual', edit button calls onEdit
   * - If balance_type is 'calculated', edit button calls onEnterStatement
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 9: should call correct handler based on balance_type when edit clicked', async () => {
    await fc.assert(
      fc.asyncProperty(
        billingCycleArb,
        async (cycle) => {
          const onEditMock = vi.fn();
          const onEnterStatementMock = vi.fn();
          
          const { container, unmount } = render(
            <UnifiedBillingCycleList 
              cycles={[cycle]} 
              onEdit={onEditMock}
              onEnterStatement={onEnterStatementMock}
            />
          );

          const editButton = container.querySelector('.unified-cycle-action-btn.edit');
          expect(editButton).toBeTruthy();

          await act(async () => {
            editButton.click();
          });

          if (cycle.balance_type === 'actual') {
            expect(onEditMock).toHaveBeenCalledWith(cycle);
            expect(onEnterStatementMock).not.toHaveBeenCalled();
          } else {
            expect(onEnterStatementMock).toHaveBeenCalledWith(cycle);
            expect(onEditMock).not.toHaveBeenCalled();
          }

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: unified-billing-cycles, Property 9: Mixed cycles with consistent action buttons**
   * 
   * For any list of billing cycles, each cycle should have consistent
   * edit and delete buttons regardless of balance type.
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 9: should show consistent action buttons for all cycles in a list', async () => {
    // Generator for a list of cycles with mixed actual balances
    const mixedCyclesArb = fc.array(billingCycleArb, { minLength: 1, maxLength: 10 })
      .map(cycles => cycles.map((cycle, index) => ({
        ...cycle,
        id: index + 1 // Ensure unique IDs
      })));

    await fc.assert(
      fc.asyncProperty(
        mixedCyclesArb,
        async (cycles) => {
          const { container, unmount } = render(
            <UnifiedBillingCycleList cycles={cycles} />
          );

          const items = container.querySelectorAll('.unified-billing-cycle-item');
          expect(items.length).toBe(cycles.length);

          // Check each cycle has consistent action buttons
          items.forEach((item) => {
            const editButton = item.querySelector('.unified-cycle-action-btn.edit');
            const deleteButton = item.querySelector('.unified-cycle-action-btn.delete');

            // All cycles should have edit and delete buttons
            expect(editButton).toBeTruthy();
            expect(deleteButton).toBeTruthy();
          });

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  });
});
