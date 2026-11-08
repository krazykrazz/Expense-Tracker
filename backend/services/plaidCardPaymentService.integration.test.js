/**
 * Integration tests: card payments in the Import Inbox -> plaidCardPaymentService -> creditCardPaymentService /
 * plaidCardPaymentRepository -> real SQLite. Fixtures are real rows: WS VISA and CIBC MC credits with the
 * chequing debits that paid them.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidInboxService = require('./plaidInboxService');
const plaidReviewService = require('./plaidReviewService');
const plaidCardPaymentService = require('./plaidCardPaymentService');
const creditCardPaymentService = require('./creditCardPaymentService');
const plaidCardPaymentRepository = require('../repositories/plaidCardPaymentRepository');
const plaidRepository = require('../repositories/plaidRepository');

const DEBIT = 2;
const WS_VISA = 4;

let db;
let cibcMc;
let spareCard;
let chequingAccountId;
let visaAccountId;
let cibcAccountId;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const stage = (transactionId, { accountId, amount, date, name, merchantName = null, pending = 0, pfcDetailed = null }) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, iso_currency_code, date, name, merchant_name, pending, pfc_detailed)
     VALUES (?, ?, ?, 'CAD', ?, ?, ?, ?, ?)`,
    [transactionId, accountId, amount, date, name, merchantName, pending, pfcDetailed]
  );

const stageVisaCredit = (extra = {}) => stage('visa-credit', {
  accountId: visaAccountId, amount: -3471.31, date: '2026-10-30', name: 'Credit Card Payment - From: Cash', ...extra
});
const stageVisaDebit = (extra = {}) => stage('visa-debit', {
  accountId: chequingAccountId, amount: 3471.31, date: '2026-10-30', name: 'Credit Card Payment', ...extra
});
const stageCibcCredit = (extra = {}) => stage('cibc-credit', {
  accountId: cibcAccountId, amount: -4104.59, date: '2026-10-29', name: 'PAYMENT THANK YOU/PAIEMEN T MERCI', ...extra
});
const stageCibcDebit = (extra = {}) => stage('cibc-debit', {
  accountId: chequingAccountId, amount: 4104.59, date: '2026-10-29', name: 'CIBC MASTERCARD - Bill payment', merchantName: 'CIBC', ...extra
});

const inbox = async () => Object.fromEntries((await plaidInboxService.listInbox('new')).transactions.map(t => [t.transactionId, t]));
const rowStatus = async (transactionId) => (await get('SELECT status FROM plaid_transactions WHERE transaction_id = ?', [transactionId])).status;
const idOf = async (transactionId) => (await get('SELECT id FROM plaid_transactions WHERE transaction_id = ?', [transactionId])).id;
const payments = () => all('SELECT * FROM credit_card_payments ORDER BY id');
const links = () => all(`SELECT l.side, pt.transaction_id AS tid, l.credit_card_payment_id AS paymentId
  FROM plaid_card_payment_links l JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id ORDER BY l.side, pt.transaction_id`);
const rejectsWith = async (promise, statusCode, message) => {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(message ? { message: expect.stringMatching(message) } : {}) });
};

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
  await run("UPDATE payment_methods SET display_name = 'WS VISA' WHERE id = ?", [WS_VISA]);
  cibcMc = await run("INSERT INTO payment_methods (type, display_name, full_name, is_active) VALUES ('credit_card', 'CIBC MC', 'CIBC Mastercard', 1)");
  spareCard = await run("INSERT INTO payment_methods (type, display_name, full_name, is_active) VALUES ('credit_card', 'Spare Card', 'Spare Card', 1)");
});

afterAll(() => cleanupIsolatedTestDb(db));

afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_card_payment_links');
  await run('DELETE FROM credit_card_payments');
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  const itemId = await run("INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES ('item-1', 'Test Bank', 'v1:x:y:z', 'sandbox')");
  chequingAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-chq', 'Chequing', '5070', 'depository', ?)", [itemId, DEBIT]);
  visaAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-visa', 'Visa', 'KL54', 'credit', ?)", [itemId, WS_VISA]);
  cibcAccountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, payment_method_id) VALUES (?, 'acc-cibc', 'Mastercard', '4148', 'credit', ?)", [itemId, cibcMc]);
});

describe('plaidCardPaymentService', () => {
  describe('what the inbox shows', () => {
    test('pairs each card credit with the debit that paid it, whatever the chequing text says', async () => {
      await stageVisaCredit();
      await stageVisaDebit();
      await stageCibcCredit();
      await stageCibcDebit();

      const rows = await inbox();

      expect(rows['visa-credit'].cardPayment).toMatchObject({
        side: 'card', kind: 'card_payment',
        pairCandidates: [expect.objectContaining({ id: await idOf('visa-debit'), accountMask: '5070', amount: 3471.31 })]
      });
      expect(rows['cibc-credit'].cardPayment).toMatchObject({
        side: 'card', kind: 'card_payment',
        pairCandidates: [expect.objectContaining({ id: await idOf('cibc-debit') })]
      });
      // The chequing text is generic: only the pair identifies the card
      expect(rows['visa-debit'].cardPayment).toMatchObject({
        side: 'funding', kind: null, looksLikeCardPayment: true,
        pairCandidates: [expect.objectContaining({ id: await idOf('visa-credit'), paymentMethodName: 'WS VISA' })]
      });
      expect(rows['cibc-debit'].cardPayment).toMatchObject({
        side: 'funding', kind: null,
        pairCandidates: [expect.objectContaining({ id: await idOf('cibc-credit'), paymentMethodName: 'CIBC MC' })]
      });
    });

    test('every credit on a card offers Record payment, even one nothing says is a payment', async () => {
      await stage('refund', { accountId: visaAccountId, amount: -25, date: '2026-10-20', name: 'AMAZON.CA REFUND' });

      const rows = await inbox();

      expect(rows.refund.cardPayment).toMatchObject({ side: 'card', kind: null, looksLikeCardPayment: false, pairCandidates: [] });
    });

    test('a bill payment to a utility is not a card payment', async () => {
      await stage('hydro', { accountId: chequingAccountId, amount: 120.5, date: '2026-10-20', name: 'HYDRO ONE - Bill payment' });
      await stage('coffee', { accountId: chequingAccountId, amount: 4.5, date: '2026-10-20', name: 'COFFEE SHOP' });
      await stage('purchase', { accountId: visaAccountId, amount: 40, date: '2026-10-20', name: 'GROCER' });

      const rows = await inbox();

      expect(rows.hydro.cardPayment).toBeNull();
      expect(rows.coffee.cardPayment).toBeNull();
      expect(rows.purchase.cardPayment).toBeNull();
    });

    test("Plaid's category marks a chequing debit as a card payment", async () => {
      await stage('cat', { accountId: chequingAccountId, amount: 80, date: '2026-10-20', name: 'ONLINE TRANSFER', pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' });

      expect((await inbox()).cat.cardPayment).toMatchObject({ side: 'funding', kind: 'card_payment' });
    });

    test('two credits of the same amount are both listed for the debit, none chosen', async () => {
      await stageVisaCredit();
      await stage('other-credit', { accountId: cibcAccountId, amount: -3471.31, date: '2026-10-31', name: 'PAYMENT THANK YOU' });
      await stageVisaDebit();

      const rows = await inbox();

      expect(rows['visa-debit'].cardPayment.pairCandidates.map(c => c.paymentMethodName)).toEqual(['WS VISA', 'CIBC MC']);
    });

    test('a pending credit is listed but cannot be paired or recorded until it settles', async () => {
      await stageVisaCredit({ pending: 1 });
      await stageVisaDebit();

      const rows = await inbox();

      expect(rows['visa-credit'].cardPayment).toMatchObject({ side: 'card', kind: 'card_payment', pairCandidates: [], paymentCandidates: [] });
      expect(rows['visa-debit'].cardPayment.pairCandidates).toEqual([]);
      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-credit'), {}), 400, /pending/);
    });

    test('lists cards with no bank connection for the debit side', async () => {
      await stageVisaDebit();

      const { unconnectedCards } = await plaidInboxService.listInbox('new');

      expect(unconnectedCards).toEqual([{ id: spareCard, name: 'Spare Card' }]);
    });

    test('offers a payment recorded by hand as a match for the credit, on its own card only', async () => {
      const mine = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 3471.31, '2026-10-29')", [WS_VISA]);
      await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 3471.31, '2026-10-29')", [cibcMc]);
      await stageVisaCredit();

      const rows = await inbox();

      expect(rows['visa-credit'].cardPayment.paymentCandidates).toEqual([
        expect.objectContaining({ id: mine, paymentMethodName: 'WS VISA', date: '2026-10-29' })
      ]);
    });
  });

  describe('record (card side)', () => {
    test('creates one payment and links the credit and the paying debit together', async () => {
      await stageVisaCredit();
      await stageVisaDebit();
      const debitId = await idOf('visa-debit');

      const result = await plaidCardPaymentService.act(await idOf('visa-credit'), { alsoLinkId: debitId });

      expect(result).toMatchObject({
        created: true,
        payment: { amount: 3471.31, payment_date: '2026-10-30', payment_method_id: WS_VISA, paymentMethodName: 'WS VISA' },
        linkedTransactionIds: [await idOf('visa-credit'), debitId]
      });
      const [payment, ...rest] = await payments();
      expect(rest).toEqual([]);
      expect(payment).toMatchObject({ payment_method_id: WS_VISA, amount: 3471.31, payment_date: '2026-10-30', notes: 'Bank: Credit Card Payment - From: Cash' });
      expect(await links()).toEqual([
        { side: 'card', tid: 'visa-credit', paymentId: payment.id },
        { side: 'funding', tid: 'visa-debit', paymentId: payment.id }
      ]);
      expect(await rowStatus('visa-credit')).toBe('matched');
      expect(await rowStatus('visa-debit')).toBe('matched');
      expect(Object.keys(await inbox())).toEqual([]);
    });

    test('logs the payment once and each bank row that was linked', async () => {
      await stageCibcCredit();
      await stageCibcDebit();

      await plaidCardPaymentService.act(await idOf('cibc-credit'), { alsoLinkId: await idOf('cibc-debit') });

      const events = activityLogService.logEvent.mock.calls.map(call => call[0]);
      expect(events.filter(e => e === 'credit_card_payment_added')).toHaveLength(1);
      const reviews = activityLogService.logEvent.mock.calls.filter(call => call[0] === 'plaid_transaction_updated');
      expect(reviews.map(call => call[4])).toEqual([
        expect.objectContaining({ action: 'card_payment', side: 'card' }),
        expect.objectContaining({ action: 'card_payment', side: 'funding' })
      ]);
    });

    test('records from the credit alone; the debit then links to that payment', async () => {
      await stageVisaCredit();
      await stageVisaDebit();

      const { payment } = await plaidCardPaymentService.act(await idOf('visa-credit'), {});
      expect((await inbox())['visa-debit'].cardPayment.paymentCandidates.map(c => c.id)).toEqual([payment.id]);

      const linked = await plaidCardPaymentService.act(await idOf('visa-debit'), { creditCardPaymentId: payment.id });

      expect(linked).toMatchObject({ created: false, linkedTransactionIds: [await idOf('visa-debit')] });
      expect((await payments())).toHaveLength(1);
      expect((await links()).map(l => l.side)).toEqual(['card', 'funding']);
    });

    test('refuses a debit that is not the same amount, or from a card', async () => {
      await stageVisaCredit();
      await stage('other-debit', { accountId: chequingAccountId, amount: 3471.3, date: '2026-10-30', name: 'x' });
      await stage('too-late', { accountId: chequingAccountId, amount: 3471.31, date: '2026-11-10', name: 'y' });
      const creditId = await idOf('visa-credit');

      await rejectsWith(plaidCardPaymentService.act(creditId, { alsoLinkId: await idOf('other-debit') }), 400, /doesn't match/);
      await rejectsWith(plaidCardPaymentService.act(creditId, { alsoLinkId: await idOf('too-late') }), 400, /doesn't match/);
      await rejectsWith(plaidCardPaymentService.act(creditId, { alsoLinkId: creditId }), 400);
      expect(await payments()).toEqual([]);
      expect(await rowStatus('visa-credit')).toBe('new');
    });

    test('creates nothing when the paying debit was already reviewed', async () => {
      await stageVisaCredit();
      await stageVisaDebit();
      await plaidReviewService.ignore(await idOf('visa-debit'));

      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-credit'), { alsoLinkId: await idOf('visa-debit') }), 409);

      expect(await payments()).toEqual([]);
      expect(await rowStatus('visa-credit')).toBe('new');
    });

    test('rolls the payment back when a row changes while it is being recorded', async () => {
      await stageVisaCredit();
      await stageVisaDebit();
      const realLink = plaidCardPaymentRepository.link.bind(plaidCardPaymentRepository);
      jest.spyOn(plaidCardPaymentRepository, 'link').mockImplementation(async (tx, transactionId, paymentId, side) => {
        if (side === 'funding') throw Object.assign(new Error('Bank transaction was already reviewed'), { statusCode: 409 });
        return realLink(tx, transactionId, paymentId, side);
      });

      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-credit'), { alsoLinkId: await idOf('visa-debit') }), 409);

      expect(await payments()).toEqual([]);
      expect(await links()).toEqual([]);
      expect(await rowStatus('visa-credit')).toBe('new');
      expect(activityLogService.logEvent).not.toHaveBeenCalled();
    });

    test('two clicks at once record one payment', async () => {
      await stageVisaCredit();
      const id = await idOf('visa-credit');

      const results = await Promise.allSettled([plaidCardPaymentService.act(id, {}), plaidCardPaymentService.act(id, {})]);

      expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect((await payments())).toHaveLength(1);
    });

    test('a pending credit, a refund-sized debit on a card and a deposit cannot be recorded', async () => {
      await stageVisaCredit({ pending: 1 });
      await stage('card-debit', { accountId: visaAccountId, amount: 50, date: '2026-10-30', name: 'PAYMENT REVERSAL' });
      await stage('deposit', { accountId: chequingAccountId, amount: -50, date: '2026-10-30', name: 'PAY' });

      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-credit'), {}), 400, /pending/);
      await rejectsWith(plaidCardPaymentService.act(await idOf('card-debit'), {}), 400);
      await rejectsWith(plaidCardPaymentService.act(await idOf('deposit'), { paymentMethodId: spareCard }), 400);
      expect(await payments()).toEqual([]);
    });
  });

  describe('link (existing payment)', () => {
    test('links a credit to a payment entered by hand, and the debit to the same payment', async () => {
      const paymentId = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date, notes) VALUES (?, 3471.31, '2026-10-29', 'by hand')", [WS_VISA]);
      await stageVisaCredit();
      await stageVisaDebit();

      await plaidCardPaymentService.act(await idOf('visa-credit'), { creditCardPaymentId: paymentId });
      expect((await inbox())['visa-debit'].cardPayment.paymentCandidates.map(c => c.id)).toEqual([paymentId]);
      await plaidCardPaymentService.act(await idOf('visa-debit'), { creditCardPaymentId: paymentId });

      expect(await payments()).toHaveLength(1);
      expect(await links()).toEqual([
        { side: 'card', tid: 'visa-credit', paymentId },
        { side: 'funding', tid: 'visa-debit', paymentId }
      ]);
      expect(await rowStatus('visa-credit')).toBe('matched');
    });

    test('a payment takes one bank row per side', async () => {
      const paymentId = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 3471.31, '2026-10-30')", [WS_VISA]);
      await stageVisaDebit();
      await stage('second-debit', { accountId: chequingAccountId, amount: 3471.31, date: '2026-10-31', name: 'again' });
      await plaidCardPaymentService.act(await idOf('visa-debit'), { creditCardPaymentId: paymentId });

      await rejectsWith(plaidCardPaymentService.act(await idOf('second-debit'), { creditCardPaymentId: paymentId }), 409, /already has/);
      expect(await rowStatus('second-debit')).toBe('new');
    });

    test('refuses a payment on another card, another amount, or too far away', async () => {
      const otherCard = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 3471.31, '2026-10-30')", [cibcMc]);
      const otherAmount = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 3471.30, '2026-10-30')", [WS_VISA]);
      const tooFar = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 3471.31, '2026-09-01')", [WS_VISA]);
      await stageVisaCredit();
      const creditId = await idOf('visa-credit');

      await rejectsWith(plaidCardPaymentService.act(creditId, { creditCardPaymentId: otherCard }), 400, /not the card/);
      await rejectsWith(plaidCardPaymentService.act(creditId, { creditCardPaymentId: otherAmount }), 400, /doesn't match/);
      await rejectsWith(plaidCardPaymentService.act(creditId, { creditCardPaymentId: tooFar }), 400, /doesn't match/);
      await rejectsWith(plaidCardPaymentService.act(creditId, { creditCardPaymentId: 99999 }), 404);
      expect(await links()).toEqual([]);
    });

    test('a debit can link to a payment on any card', async () => {
      const paymentId = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 4104.59, '2026-10-29')", [cibcMc]);
      await stageCibcDebit();

      await plaidCardPaymentService.act(await idOf('cibc-debit'), { creditCardPaymentId: paymentId });

      expect(await links()).toEqual([{ side: 'funding', tid: 'cibc-debit', paymentId }]);
    });
  });

  describe('record from the debit (card not connected)', () => {
    test('records a payment to a card with no bank account, linked on the paying side', async () => {
      await stageVisaDebit();

      const result = await plaidCardPaymentService.act(await idOf('visa-debit'), { paymentMethodId: spareCard });

      expect(result).toMatchObject({ created: true, payment: { payment_method_id: spareCard, amount: 3471.31, payment_date: '2026-10-30' } });
      expect(await links()).toEqual([{ side: 'funding', tid: 'visa-debit', paymentId: result.payment.id }]);
      expect(await rowStatus('visa-debit')).toBe('matched');
    });

    test('refuses a connected card: its credit records the payment', async () => {
      await stageVisaDebit();

      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-debit'), { paymentMethodId: WS_VISA }), 400, /WS VISA is connected to a bank/);
      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-debit'), { paymentMethodId: DEBIT }), 400, /credit card/);
      await rejectsWith(plaidCardPaymentService.act(await idOf('visa-debit'), {}), 400, /credit card/);
      expect(await payments()).toEqual([]);
    });
  });

  describe('request shapes', () => {
    test('a body that does not fit the row is a 400; an unknown row a 404', async () => {
      await stageVisaCredit();
      await stageVisaDebit();
      const creditId = await idOf('visa-credit');
      const debitId = await idOf('visa-debit');

      await rejectsWith(plaidCardPaymentService.act(creditId, { paymentMethodId: spareCard }), 400);
      await rejectsWith(plaidCardPaymentService.act(debitId, { alsoLinkId: creditId }), 400);
      await rejectsWith(plaidCardPaymentService.act(creditId, { creditCardPaymentId: 1, alsoLinkId: debitId }), 400);
      await rejectsWith(plaidCardPaymentService.act(99999, {}), 404);
    });
  });

  describe('undoing', () => {
    test('deleting the payment returns both bank rows to the inbox', async () => {
      await stageVisaCredit();
      await stageVisaDebit();
      const { payment } = await plaidCardPaymentService.act(await idOf('visa-credit'), { alsoLinkId: await idOf('visa-debit') });

      await creditCardPaymentService.deletePayment(payment.id);

      expect(await rowStatus('visa-credit')).toBe('new');
      expect(await rowStatus('visa-debit')).toBe('new');
      expect(await links()).toEqual([]);
      expect(Object.keys(await inbox()).sort()).toEqual(['visa-credit', 'visa-debit']);
    });

    test('deleting a card returns the debit that paid it', async () => {
      const temp = await run("INSERT INTO payment_methods (type, display_name, full_name, is_active) VALUES ('credit_card', 'Temp Card', 'Temp Card', 1)");
      await stageVisaDebit();
      await plaidCardPaymentService.act(await idOf('visa-debit'), { paymentMethodId: temp });

      await run('DELETE FROM payment_methods WHERE id = ?', [temp]);

      expect(await rowStatus('visa-debit')).toBe('new');
      expect(await links()).toEqual([]);
    });

    test('deleting the bank row leaves the payment', async () => {
      await stageVisaCredit();
      await plaidCardPaymentService.act(await idOf('visa-credit'), {});

      await run("DELETE FROM plaid_transactions WHERE transaction_id = 'visa-credit'");

      expect(await payments()).toHaveLength(1);
      expect(await links()).toEqual([]);
    });
  });

  describe('card balance check', () => {
    test('a payment with a bank credit is not left over on the tracker side; one entered by hand is', async () => {
      const byHand = await run("INSERT INTO credit_card_payments (payment_method_id, amount, payment_date) VALUES (?, 500, '2026-10-20')", [WS_VISA]);
      await stageVisaCredit();
      const { payment } = await plaidCardPaymentService.act(await idOf('visa-credit'), {});

      const { payments: leftOver } = await plaidRepository.findUnlinkedCardActivity(WS_VISA, '2026-10-01', '2026-11-30');

      expect(leftOver.map(p => p.id)).toEqual([byHand]);
      expect(leftOver.map(p => p.id)).not.toContain(payment.id);
    });

    test('a payment linked only on the paying side still pairs with its card credit', async () => {
      const { payment } = await (async () => {
        await stageVisaDebit();
        return plaidCardPaymentService.act(await idOf('visa-debit'), { paymentMethodId: spareCard });
      })();
      await run('UPDATE credit_card_payments SET payment_method_id = ? WHERE id = ?', [WS_VISA, payment.id]);

      const { payments: tracked } = await plaidRepository.findUnlinkedCardActivity(WS_VISA, '2026-10-01', '2026-11-30');

      expect(tracked.map(p => p.id)).toEqual([payment.id]);
    });
  });
});
