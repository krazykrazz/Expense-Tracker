/**
 * @invariant Card payment pairing: (1) a card credit and a funding debit are paired exactly when both are settled,
 * have the same amount to the cent and posted at most 5 days apart, and the pairing is symmetric (A lists B iff B
 * lists A); (2) a payment is a candidate for a bank row exactly when it has the same cents within 5 days, belongs
 * to the row's own card for a card row, and has no link yet on the row's side; (3) candidates are ordered by date
 * distance. Randomizing small amounts (so equal cents collide often), dates around month and year boundaries,
 * pending flags and link flags checks both rules against independent integer-cents / day-number oracles.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { pairCardPayments, findPaymentCandidates, PAYMENT_WINDOW_DAYS } = require('./plaidMatching');

const arbDate = fc.date({ min: new Date('2026-12-20T00:00:00Z'), max: new Date('2027-01-12T00:00:00Z'), noInvalidDate: true })
  .map(d => d.toISOString().slice(0, 10));
const arbCents = fc.integer({ min: 1, max: 4 });
const oracleDays = (a, b) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000));

const arbRow = fc.record({
  isCard: fc.boolean(),
  credit: fc.boolean(),
  cents: arbCents,
  date: arbDate,
  pending: fc.boolean(),
  paymentMethodId: fc.integer({ min: 1, max: 3 })
});
const toRow = (r, id) => ({
  id,
  paymentMethodType: r.isCard ? 'credit_card' : 'debit',
  paymentMethodId: r.paymentMethodId,
  amount: (r.credit ? -1 : 1) * r.cents / 100 + 0.0000001,
  date: r.date,
  pending: r.pending
});

describe('plaidMatching card payments', () => {
  test('pairs settled card credits with funding debits of the same cents within the window, symmetrically', () => {
    fc.assert(
      fc.property(fc.array(arbRow, { maxLength: 12 }), (specs) => {
        const rows = specs.map((spec, i) => toRow(spec, i + 1));
        const pairs = pairCardPayments(rows);

        const isCreditOnCard = (row) => row.paymentMethodType === 'credit_card' && row.amount < 0;
        const isDebitElsewhere = (row) => row.paymentMethodType !== 'credit_card' && row.amount > 0;
        const settledSide = (row) => !row.pending && (isCreditOnCard(row) || isDebitElsewhere(row));

        for (const row of rows) {
          if (!settledSide(row)) {
            expect(pairs.has(row.id)).toBe(false);
            continue;
          }
          const expected = rows.filter(other => settledSide(other)
            && isCreditOnCard(other) !== isCreditOnCard(row)
            && Math.round(Math.abs(other.amount) * 100) === Math.round(Math.abs(row.amount) * 100)
            && oracleDays(other.date, row.date) <= PAYMENT_WINDOW_DAYS);

          expect(pairs.get(row.id).map(other => other.id).sort((a, b) => a - b)).toEqual(expected.map(other => other.id));
          for (const other of pairs.get(row.id)) {
            expect(pairs.get(other.id).map(back => back.id)).toContain(row.id);
          }
        }
      }),
      pbtOptions()
    );
  });

  test('payment candidates follow the side rules and are closest first', () => {
    const arbPayment = fc.record({
      paymentMethodId: fc.integer({ min: 1, max: 3 }),
      cents: arbCents,
      date: arbDate,
      cardLinked: fc.boolean(),
      fundingLinked: fc.boolean()
    });
    fc.assert(
      fc.property(arbRow, fc.array(arbPayment, { maxLength: 10 }), (spec, paymentSpecs) => {
        const row = toRow(spec, 1);
        const payments = paymentSpecs.map((p, i) => ({ id: i + 1, paymentMethodId: p.paymentMethodId, amount: p.cents / 100, date: p.date, cardLinked: p.cardLinked, fundingLinked: p.fundingLinked }));
        const found = findPaymentCandidates(row, payments);

        const cardCredit = row.paymentMethodType === 'credit_card' && row.amount < 0;
        const fundingDebit = row.paymentMethodType !== 'credit_card' && row.amount > 0;
        const expected = row.pending || !(cardCredit || fundingDebit) ? [] : payments.filter(payment =>
          (cardCredit ? payment.paymentMethodId === row.paymentMethodId && !payment.cardLinked : !payment.fundingLinked)
          && Math.round(payment.amount * 100) === Math.round(Math.abs(row.amount) * 100)
          && oracleDays(payment.date, row.date) <= PAYMENT_WINDOW_DAYS);

        expect(found.map(p => p.id).sort((a, b) => a - b)).toEqual(expected.map(p => p.id));
        const distances = found.map(p => oracleDays(p.date, row.date));
        expect(distances).toEqual([...distances].sort((a, b) => a - b));
      }),
      pbtOptions()
    );
  });
});
