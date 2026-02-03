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
   * **Feature: unified-billing-cycles, Property 9: Action Buttons Based on Actual Balance**
   * 
   * For any billing cycle displayed in the UI:
   * - If actual_statement_balance > 0, edit and delete buttons SHALL be displayed
   * - If actual_statement_balance = 0, "Enter Statement" button SHALL be displayed instead
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 9: should display edit/delete buttons when actual_statement_balance > 0', async () => {
    // Generator for cycles with positive actual balance
    const positiveBalanceCycleArb = billingCycleArb.map(cycle => ({
      ...cycle,
      actual_statement_balance: Math.max(0.01, cycle.actual_statement_balance || 0.01)
    }));

    await fc.assert(
      fc.asyncProperty(
        positiveBalanceCycleArb,
        async (cycle) => {
          const { container, unmount } = render(
            <UnifiedBillingCycleList cycles={[cycle]} />
          );

          // Should have edit button
          const editButton = container.querySelector('.unified-cycle-action-btn.edit');
          expect(editButton).toBeTruthy();

          // Should have delete button
          const deleteButton = container.querySelector('.unified-cycle-action-btn.delete');
          expect(deleteButton).toBeTruthy();

          // Should NOT have "Enter Statement" button
          const enterStatementButton = container.querySelector('.unified-cycle-action-btn.enter-statement');
          expect(enterStatementButton).toBeFalsy();

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
   * **Feature: unified-billing-cycles, Property 9: Action Buttons Based on Actual Balance**
   * 
   * For any billing cycle displayed in the UI:
   * - If actual_statement_balance = 0, "Enter Statement" button SHALL be displayed
   * - Auto-generated cycles also show a refresh/delete button (🔄)
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 9: should display "Enter Statement" button when actual_statement_balance = 0', async () => {
    // Generator for cycles with zero actual balance
    const zeroBalanceCycleArb = billingCycleArb.map(cycle => ({
      ...cycle,
      actual_statement_balance: 0,
      balance_type: 'calculated'
    }));

    await fc.assert(
      fc.asyncProperty(
        zeroBalanceCycleArb,
        async (cycle) => {
          const { container, unmount } = render(
            <UnifiedBillingCycleList cycles={[cycle]} />
          );

          // Should NOT have edit button
          const editButton = container.querySelector('.unified-cycle-action-btn.edit');
          expect(editButton).toBeFalsy();

          // Should NOT have regular delete button (only auto-generated delete)
          const regularDeleteButton = container.querySelector('.unified-cycle-action-btn.delete:not(.auto-generated)');
          expect(regularDeleteButton).toBeFalsy();

          // Should have auto-generated delete button (refresh icon)
          const autoGeneratedDeleteButton = container.querySelector('.unified-cycle-action-btn.delete.auto-generated');
          expect(autoGeneratedDeleteButton).toBeTruthy();

          // Should have "Enter Statement" button
          const enterStatementButton = container.querySelector('.unified-cycle-action-btn.enter-statement');
          expect(enterStatementButton).toBeTruthy();
          expect(enterStatementButton.textContent).toContain('Enter Statement');

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
   * **Feature: unified-billing-cycles, Property 9: Mixed cycles with different actual balances**
   * 
   * For any list of billing cycles, each cycle should independently show the correct
   * action buttons based on its own actual_statement_balance value.
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  it('Property 9: should correctly show action buttons for mixed cycles', async () => {
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

          // Check each cycle's action buttons
          cycles.forEach((cycle, index) => {
            const item = items[index];
            const editButton = item.querySelector('.unified-cycle-action-btn.edit');
            const regularDeleteButton = item.querySelector('.unified-cycle-action-btn.delete:not(.auto-generated)');
            const autoGeneratedDeleteButton = item.querySelector('.unified-cycle-action-btn.delete.auto-generated');
            const enterStatementButton = item.querySelector('.unified-cycle-action-btn.enter-statement');

            if (cycle.actual_statement_balance > 0) {
              // Should have edit and regular delete, no enter statement or auto-generated delete
              expect(editButton).toBeTruthy();
              expect(regularDeleteButton).toBeTruthy();
              expect(autoGeneratedDeleteButton).toBeFalsy();
              expect(enterStatementButton).toBeFalsy();
            } else {
              // Should have enter statement and auto-generated delete, no edit or regular delete
              expect(editButton).toBeFalsy();
              expect(regularDeleteButton).toBeFalsy();
              expect(autoGeneratedDeleteButton).toBeTruthy();
              expect(enterStatementButton).toBeTruthy();
            }
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
