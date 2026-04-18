/**
 * Property-Based Tests for MortgageKpiStrip
 *
 * @invariant KPI metrics resolve to correct values or "—" for any combination of data availability
 * @invariant Monthly payment sub-label renders iff paymentSource is present and non-empty
 * @feature mortgage-detail-view-redesign
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import MortgageKpiStrip from './MortgageKpiStrip';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const balanceArb = fc.option(
  fc.double({ min: 1000, max: 1000000, noNaN: true, noDefaultInfinity: true }),
  { nil: null }
);

const rateArb = fc.option(
  fc.double({ min: 0.01, max: 25, noNaN: true, noDefaultInfinity: true }),
  { nil: null }
);

const paymentAmountArb = fc.option(
  fc.double({ min: 100, max: 5000, noNaN: true, noDefaultInfinity: true }),
  { nil: null }
);

const paymentSourceArb = fc.option(
  fc.string({ minLength: 1, maxLength: 20 }),
  { nil: null }
);

const propertyValueArb = fc.option(
  fc.double({ min: 1000, max: 2000000, noNaN: true, noDefaultInfinity: true }),
  { nil: null }
);

const dailyInterestArb = fc.option(
  fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
  { nil: null }
);

const payoffDateArb = fc.option(
  // Generate a valid YYYY-MM-DD date string
  fc.record({
    year: fc.integer({ min: 2025, max: 2060 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  ),
  { nil: null }
);

// Build a loanData object from individual arbitraries
const loanDataArb = (opts = {}) =>
  fc.record({
    initial_balance: opts.initialBalance ?? balanceArb,
    currentRate: opts.currentRate ?? rateArb,
    rate_type: fc.constantFrom('fixed', 'variable', null),
    estimated_property_value: opts.propertyValue ?? propertyValueArb
  });

// Build a calculatedBalanceData object (or null)
const calcBalanceDataArb = (opts = {}) =>
  fc.option(
    fc.record({
      currentBalance: opts.currentBalance ?? balanceArb
    }).filter(d => d.currentBalance !== null)
      .map(d => ({ currentBalance: d.currentBalance })),
    { nil: null }
  );

// Build an insights object (or null)
const insightsArb = (opts = {}) =>
  fc.option(
    fc.record({
      currentStatus: fc.record({
        currentPayment: opts.currentPayment ?? paymentAmountArb,
        paymentSource: opts.paymentSource ?? paymentSourceArb,
        interestBreakdown: fc.record({
          daily: opts.daily ?? dailyInterestArb
        })
      }),
      projections: fc.record({
        currentScenario: fc.record({
          payoffDate: opts.payoffDate ?? payoffDateArb
        })
      })
    }),
    { nil: null }
  );

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Get the <dd> text for a given metric label.
 */
function getMetricValue(label) {
  const dt = screen.getByText(label);
  // The <dd> is the next sibling of <dt> inside the same <div>
  return dt.nextElementSibling?.textContent ?? '';
}

// ── Property 1: KPI Metric Resolution ────────────────────────────────────────

/**
 * **Feature: mortgage-detail-view-redesign, Property 1: KPI Metric Resolution**
 *
 * For any combination of null/present loanData, calculatedBalanceData, insights:
 * - Current Balance shows calculatedBalanceData.currentBalance when present,
 *   else loanData.initial_balance, else "—"
 * - Insight-dependent metrics (Daily Interest, Monthly Payment, Payoff Date)
 *   show "—" when insights is null or insightsLoading is true
 * - Equity shows a percentage string ending in "%" when estimated_property_value > 0
 *   and a balance is available; otherwise "—"
 *
 * **Validates: Requirements 1.3, 1.8, 1.10, 1.11**
 */
describe('Property 1: KPI Metric Resolution', () => {
  it('Current Balance resolves via fallback chain: calculatedBalance → initial_balance → "—"', () => {
    fc.assert(
      fc.property(
        balanceArb,   // calculatedBalance
        balanceArb,   // initial_balance
        fc.boolean(), // insightsLoading
        (calcBalance, initialBalance, insightsLoading) => {
          const loanData = { initial_balance: initialBalance, currentRate: null, rate_type: null, estimated_property_value: null };
          const calculatedBalanceData = calcBalance !== null ? { currentBalance: calcBalance } : null;

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={calculatedBalanceData}
              insights={null}
              insightsLoading={insightsLoading}
              paymentDueDay={null}
            />
          );

          const balanceText = getMetricValue('Current Balance');

          if (calcBalance !== null) {
            // Should contain the numeric value from calculatedBalance
            const numStr = calcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            expect(balanceText).toContain(numStr);
          } else if (initialBalance !== null) {
            // Should contain the numeric value from initial_balance
            const numStr = initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            expect(balanceText).toContain(numStr);
          } else {
            expect(balanceText).toBe('—');
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('insight-dependent metrics show "—" when insights is null or insightsLoading is true', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // insightsLoading
        fc.boolean(), // insightsPresent
        insightsArb(),
        (insightsLoading, insightsPresent, insightsData) => {
          // When insightsLoading=true, always show "—" regardless of insights presence
          // When insightsLoading=false and insights=null, show "—"
          const insights = (insightsLoading || !insightsPresent) ? null : insightsData;
          const effectivelyNoInsights = insightsLoading || insights === null;

          const loanData = { initial_balance: null, currentRate: null, rate_type: null, estimated_property_value: null };

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={null}
              insights={insights}
              insightsLoading={insightsLoading}
              paymentDueDay={null}
            />
          );

          if (effectivelyNoInsights) {
            expect(getMetricValue('Daily Interest')).toBe('—');
            expect(getMetricValue('Monthly Payment')).toBe('—');
            expect(getMetricValue('Payoff Date')).toBe('—');
          } else {
            // When insights is present and not loading, metrics may show values or "—"
            // depending on whether the nested fields are null — just verify no crash
            expect(typeof getMetricValue('Daily Interest')).toBe('string');
            expect(typeof getMetricValue('Monthly Payment')).toBe('string');
            expect(typeof getMetricValue('Payoff Date')).toBe('string');
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Equity shows percentage ending in "%" when propertyValue > 0 and balance available, else "—"', () => {
    fc.assert(
      fc.property(
        fc.option(fc.double({ min: 1, max: 2000000, noNaN: true, noDefaultInfinity: true }), { nil: null }), // propertyValue
        balanceArb, // calculatedBalance
        balanceArb, // initial_balance
        (propertyValue, calcBalance, initialBalance) => {
          const loanData = {
            initial_balance: initialBalance,
            currentRate: null,
            rate_type: null,
            estimated_property_value: propertyValue
          };
          const calculatedBalanceData = calcBalance !== null ? { currentBalance: calcBalance } : null;
          const balanceForEquity = calcBalance ?? initialBalance;

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={calculatedBalanceData}
              insights={null}
              insightsLoading={false}
              paymentDueDay={null}
            />
          );

          const equityText = getMetricValue('Equity');

          if (propertyValue != null && propertyValue > 0 && balanceForEquity != null) {
            expect(equityText).toMatch(/%$/);
          } else {
            expect(equityText).toBe('—');
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('insight-dependent metrics show values when insights present and not loading', () => {
    fc.assert(
      fc.property(
        paymentAmountArb,
        dailyInterestArb,
        payoffDateArb,
        (currentPayment, daily, payoffDate) => {
          const insights = {
            currentStatus: {
              currentPayment,
              paymentSource: null,
              interestBreakdown: { daily }
            },
            projections: {
              currentScenario: { payoffDate }
            }
          };

          const loanData = { initial_balance: null, currentRate: null, rate_type: null, estimated_property_value: null };

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={null}
              insights={insights}
              insightsLoading={false}
              paymentDueDay={null}
            />
          );

          // Daily Interest
          if (daily !== null) {
            const dailyText = getMetricValue('Daily Interest');
            const numStr = daily.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            expect(dailyText).toContain(numStr);
          } else {
            expect(getMetricValue('Daily Interest')).toBe('—');
          }

          // Monthly Payment
          if (currentPayment !== null) {
            const paymentText = getMetricValue('Monthly Payment');
            const numStr = currentPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            expect(paymentText).toContain(numStr);
          } else {
            expect(getMetricValue('Monthly Payment')).toBe('—');
          }

          // Payoff Date
          if (payoffDate !== null) {
            const payoffText = getMetricValue('Payoff Date');
            expect(payoffText).not.toBe('—');
            expect(payoffText.length).toBeGreaterThan(0);
          } else {
            expect(getMetricValue('Payoff Date')).toBe('—');
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Monthly Payment Source Label ──────────────────────────────────

/**
 * **Feature: mortgage-detail-view-redesign, Property 4: Monthly Payment Source Label**
 *
 * For any insights data:
 * - When insights.currentStatus.currentPayment is present → payment shows formatted currency
 * - When insights.currentStatus.paymentSource is present and non-empty → sub-label rendered
 * - When paymentSource is absent or null → no sub-label rendered
 * - When insights is null → monthly payment shows "—" with no sub-label
 *
 * **Validates: Requirements 10.1, 10.3, 10.4**
 */
describe('Property 4: Monthly Payment Source Label', () => {
  it('payment shows formatted currency when currentPayment is present', () => {
    fc.assert(
      fc.property(
        paymentAmountArb,
        paymentSourceArb,
        (currentPayment, paymentSource) => {
          const insights = {
            currentStatus: {
              currentPayment,
              paymentSource,
              interestBreakdown: { daily: null }
            },
            projections: { currentScenario: { payoffDate: null } }
          };

          const loanData = { initial_balance: null, currentRate: null, rate_type: null, estimated_property_value: null };

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={null}
              insights={insights}
              insightsLoading={false}
              paymentDueDay={null}
            />
          );

          const paymentDd = screen.getByText('Monthly Payment').nextElementSibling;

          if (currentPayment !== null) {
            const numStr = currentPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            expect(paymentDd.textContent).toContain(numStr);
          } else {
            // The dd may contain "—" plus possibly a sub-label; check the text starts with "—"
            expect(paymentDd.textContent).toContain('—');
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sub-label renders iff paymentSource is present and non-empty', () => {
    fc.assert(
      fc.property(
        paymentSourceArb,
        fc.boolean(), // insightsLoading
        (paymentSource, insightsLoading) => {
          const insights = insightsLoading ? null : {
            currentStatus: {
              currentPayment: 1500,
              paymentSource,
              interestBreakdown: { daily: null }
            },
            projections: { currentScenario: { payoffDate: null } }
          };

          const loanData = { initial_balance: null, currentRate: null, rate_type: null, estimated_property_value: null };

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={null}
              insights={insights}
              insightsLoading={insightsLoading}
              paymentDueDay={null}
            />
          );

          const paymentDd = screen.getByText('Monthly Payment').nextElementSibling;
          const subLabel = paymentDd.querySelector('small');

          const shouldHaveSubLabel = !insightsLoading && insights !== null && paymentSource !== null && paymentSource.length > 0;

          if (shouldHaveSubLabel) {
            expect(subLabel).not.toBeNull();
            expect(subLabel.textContent).toBe(paymentSource);
          } else {
            expect(subLabel).toBeNull();
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('monthly payment shows "—" with no sub-label when insights is null', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // insightsLoading — either way, null insights means "—"
        (insightsLoading) => {
          const loanData = { initial_balance: null, currentRate: null, rate_type: null, estimated_property_value: null };

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={null}
              insights={null}
              insightsLoading={insightsLoading}
              paymentDueDay={null}
            />
          );

          const paymentDd = screen.getByText('Monthly Payment').nextElementSibling;
          expect(paymentDd.textContent).toBe('—');
          expect(paymentDd.querySelector('small')).toBeNull();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no sub-label when paymentSource is null or empty string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, ''),
        paymentAmountArb,
        (paymentSource, currentPayment) => {
          const insights = {
            currentStatus: {
              currentPayment,
              paymentSource,
              interestBreakdown: { daily: null }
            },
            projections: { currentScenario: { payoffDate: null } }
          };

          const loanData = { initial_balance: null, currentRate: null, rate_type: null, estimated_property_value: null };

          const { unmount } = render(
            <MortgageKpiStrip
              loanData={loanData}
              calculatedBalanceData={null}
              insights={insights}
              insightsLoading={false}
              paymentDueDay={null}
            />
          );

          const paymentDd = screen.getByText('Monthly Payment').nextElementSibling;
          expect(paymentDd.querySelector('small')).toBeNull();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
