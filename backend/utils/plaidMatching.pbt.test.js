/**
 * @invariant Match candidate rule: a bank transaction and an expense are match candidates exactly when they
 * share a payment method, the transaction equals what the expense *charged* (original cost when reimbursed or
 * insurance-tracked, else amount) to the cent, and they are at most 3 calendar days apart (using the authorized
 * date when present). Randomizing amounts (float noise around cent boundaries), out-of-pocket shares, dates
 * (month/year/leap-year boundaries) and offsets checks the predicate against an independent integer-cents /
 * day-number oracle.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { isMatchCandidate, findMatchCandidates, shiftDate, dayDiff, MATCH_WINDOW_DAYS } = require('./plaidMatching');

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
});
