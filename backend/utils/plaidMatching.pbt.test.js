/**
 * @invariant Match candidate rule: a bank transaction and an expense are match candidates exactly when they
 * share a payment method, the transaction equals what the expense *charged* (original cost when reimbursed or
 * insurance-tracked, else amount) to the cent, and they are at most 3 calendar days apart (using the authorized
 * date when present). A charge confirms a fixed expense exactly when it uses the same payment method and posted
 * between 3 days before and 10 days after the due date (due day clamped to the month length), whatever the
 * amount. A deposit (money in, not on a credit card) confirms expected income in its own month, the next month
 * when it lands in the month's last 3 days, or the previous month when it lands in the first 3 days.
 * Randomizing amounts (float noise around cent boundaries), out-of-pocket shares, due days 1-31,
 * dates (month/year/leap-year boundaries) and offsets checks both predicates against independent
 * integer-cents / day-number oracles.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { isMatchCandidate, findMatchCandidates, shiftDate, dayDiff, MATCH_WINDOW_DAYS, fixedExpectedDate, isFixedCandidate, findFixedCandidates, FIXED_EARLY_DAYS, FIXED_LATE_DAYS, INCOME_BOUNDARY_DAYS, isIncomeCandidate, findIncomeCandidates, incomeNameScore } = require('./plaidMatching');

const arbDate = fc.date({ min: new Date('2019-12-25T00:00:00Z'), max: new Date('2031-01-05T00:00:00Z'), noInvalidDate: true })
  .map(d => d.toISOString().slice(0, 10));
const arbCents = fc.integer({ min: 1, max: 5_000_000 });

const oracleDays = (a, b) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000));

describe('plaidMatching', () => {
  test('isMatchCandidate agrees with an integer-cents / day-count oracle', () => {
    fc.assert(
      fc.property(
        arbDate, fc.option(arbDate, { nil: undefined }), arbCents,
        fc.integer({ min: -2, max: 2 }), fc.integer({ min: -6, max: 6 }),
        fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 3 }),
        (postedDate, authorizedDate, cents, centDelta, dayOffset, txnPm, expensePm) => {
          const txn = { paymentMethodId: txnPm, amount: cents / 100, date: postedDate, authorizedDate };
          const purchaseDate = authorizedDate || postedDate;
          // Float arithmetic on the expense side mirrors how amounts arrive from forms/SQLite
          const expense = { id: 1, paymentMethodId: expensePm, amount: (cents + centDelta) / 100 + 0.0000001, date: shiftDate(purchaseDate, dayOffset) };

          const expected = txnPm === expensePm && centDelta === 0 && Math.abs(dayOffset) <= MATCH_WINDOW_DAYS;
          expect(isMatchCandidate(txn, expense)).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  test('reimbursed / insured expenses match on the charged amount, never the out-of-pocket amount', () => {
    fc.assert(
      fc.property(
        arbDate, arbCents, fc.integer({ min: 1, max: 99 }), fc.integer({ min: -1, max: 1 }),
        (date, chargedCents, outOfPocketPercent, centDelta) => {
          const outOfPocketCents = Math.max(0, Math.floor(chargedCents * outOfPocketPercent / 100));
          const expense = {
            id: 1, paymentMethodId: 1, date,
            amount: outOfPocketCents / 100,
            chargedAmount: (chargedCents + centDelta) / 100
          };

          expect(isMatchCandidate({ paymentMethodId: 1, amount: chargedCents / 100, date }, expense)).toBe(centDelta === 0);
          // The out-of-pocket share alone never matches (unless it happens to equal the charge)
          if (outOfPocketCents !== chargedCents + centDelta) {
            expect(isMatchCandidate({ paymentMethodId: 1, amount: outOfPocketCents / 100, date }, expense)).toBe(false);
          }
        }
      ),
      pbtOptions()
    );
  });

  test('shiftDate and dayDiff agree with calendar arithmetic across month and year boundaries', () => {
    fc.assert(
      fc.property(arbDate, fc.integer({ min: -400, max: 400 }), (date, days) => {
        const shifted = shiftDate(date, days);
        expect(shifted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(dayDiff(date, shifted)).toBe(Math.abs(days));
        expect(oracleDays(date, shifted)).toBe(Math.abs(days));
      }),
      pbtOptions()
    );
  });

  test('findMatchCandidates returns only candidates, closest date first', () => {
    fc.assert(
      fc.property(
        arbDate, arbCents,
        fc.array(fc.record({ offset: fc.integer({ min: -6, max: 6 }), centDelta: fc.integer({ min: -1, max: 1 }), pm: fc.integer({ min: 1, max: 2 }) }), { maxLength: 15 }),
        (date, cents, specs) => {
          const txn = { paymentMethodId: 1, amount: cents / 100, date };
          const expenses = specs.map((s, i) => ({ id: i + 1, paymentMethodId: s.pm, amount: (cents + s.centDelta) / 100, date: shiftDate(date, s.offset) }));

          const result = findMatchCandidates(txn, expenses);

          expect(result.map(e => e.id).sort((a, b) => a - b))
            .toEqual(expenses.filter(e => isMatchCandidate(txn, e)).map(e => e.id));
          const distances = result.map(e => dayDiff(date, e.date));
          expect(distances).toEqual([...distances].sort((a, b) => a - b));
        }
      ),
      pbtOptions()
    );
  });
  test('fixed expenses: due day is clamped to the month length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }), (year, month, dueDay) => {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const expected = fixedExpectedDate({ year, month, dueDay });
        expect(expected).toBe(`${year}-${String(month).padStart(2, '0')}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`);
        expect(Number.isNaN(Date.parse(`${expected}T00:00:00Z`))).toBe(false);
      }),
      pbtOptions()
    );
  });

  test('fixed expenses: a charge confirms exactly within [due - 3, due + 10] days, on the same payment method, any amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: -20, max: 25 }), arbCents, arbCents, fc.integer({ min: 1, max: 2 }),
        (year, month, dueDay, offset, plannedCents, chargedCents, txnPm) => {
          const fixed = { id: 1, year, month, dueDay, amount: plannedCents / 100, paymentMethodId: 1 };
          const due = fixedExpectedDate(fixed);
          const txn = { paymentMethodId: txnPm, amount: chargedCents / 100, date: shiftDate(due, offset) };

          const expected = txnPm === 1 && offset >= -FIXED_EARLY_DAYS && offset <= FIXED_LATE_DAYS;
          expect(isFixedCandidate(txn, fixed)).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  test('fixed expenses without a due day match any charge in their month only', () => {
    fc.assert(
      fc.property(arbDate, fc.integer({ min: -2, max: 2 }), (date, monthShift) => {
        const [y, m] = date.split('-').map(Number);
        const idx = y * 12 + (m - 1) + monthShift;
        const fixed = { id: 1, year: Math.floor(idx / 12), month: (idx % 12) + 1, dueDay: null, amount: 10, paymentMethodId: 1 };
        expect(isFixedCandidate({ paymentMethodId: 1, amount: 5, date }, fixed)).toBe(monthShift === 0);
      }),
      pbtOptions()
    );
  });

  test('fixed candidates: refunds never match; exact amounts rank first, then smaller differences', () => {
    const due = { year: 2026, month: 10, dueDay: 1, paymentMethodId: 1 };
    const fixed = [
      { id: 1, ...due, amount: 30 },
      { id: 2, ...due, amount: 25.5 },
      { id: 3, ...due, amount: 26 }
    ];
    expect(findFixedCandidates({ paymentMethodId: 1, amount: 25.5, date: '2026-10-03' }, fixed).map(f => f.id)).toEqual([2, 3, 1]);
    expect(findFixedCandidates({ paymentMethodId: 1, amount: -25.5, date: '2026-10-03' }, fixed)).toEqual([]);
  });

  test('income: a deposit confirms its own month, the next month in its last 3 days, the previous month in its first 3 days', () => {
    fc.assert(
      fc.property(arbDate, fc.integer({ min: -2, max: 2 }), arbCents, fc.boolean(), (date, monthShift, cents, onCard) => {
        const [y, m, d] = date.split('-').map(Number);
        const idx = y * 12 + (m - 1) + monthShift;
        const source = { id: 1, year: Math.floor(idx / 12), month: (idx % 12) + 1, name: 'Pay', amount: 1 };
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const deposit = { amount: -cents / 100, date, paymentMethodType: onCard ? 'credit_card' : 'debit' };

        const inWindow = monthShift === 0
          || (monthShift === 1 && d > lastDay - INCOME_BOUNDARY_DAYS)
          || (monthShift === -1 && d <= INCOME_BOUNDARY_DAYS);
        expect(isIncomeCandidate(deposit, source)).toBe(!onCard && inWindow);
        // Money out never confirms income
        expect(isIncomeCandidate({ ...deposit, amount: cents / 100 }, source)).toBe(false);
      }),
      pbtOptions()
    );
  });

  test('income candidates: learned names first, then name words, then own month, then closest amount', () => {
    const deposit = { amount: -10848.23, date: '2026-10-29', name: 'JAT - Direct deposit', merchantName: null, paymentMethodType: 'debit' };
    const sources = [
      { id: 1, year: 2026, month: 10, name: 'Bonus', amount: 10848.23 },
      { id: 2, year: 2026, month: 11, name: 'JAT', amount: 10000 },
      { id: 3, year: 2026, month: 10, name: 'JAT', amount: 9000 },
      { id: 4, year: 2026, month: 10, name: 'Employer', amount: 500 },
      { id: 5, year: 2026, month: 9, name: 'JAT', amount: 10848.23 }
    ];

    expect(findIncomeCandidates(deposit, sources).map(s => [s.id, s.nameScore])).toEqual([[3, 1], [2, 1], [1, 0], [4, 0]]);
    expect(findIncomeCandidates(deposit, sources, new Set(['employer'])).map(s => s.id)).toEqual([4, 3, 2, 1]);
    expect(incomeNameScore({ name: 'PAYROLL DEP' }, { name: 'JAT Payroll' })).toBe(0);
    expect(incomeNameScore({ name: 'JAT PAYROLL DEP' }, { name: 'jat payroll' })).toBe(1);
  });
});
