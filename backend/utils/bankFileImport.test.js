const {
  parseCsv, parseBankFile, planFileImport, mergeFileIntoRow, mergePlaidIntoFileRow, sameTransaction, similarNames,
  isFileRow, FILE_ID_PREFIX
} = require('./bankFileImport');

const CARD_HEADER = 'transaction_date,transaction_type,status,merchant,amount,currency,notes,category';
const CHEQUING_HEADER = 'transaction_date,transaction_time,account_number,account_type,transaction_type,transaction_sub_type,status,payee,payee_email,amount,currency,notes';
const card = (...lines) => [CARD_HEADER, ...lines].join('\n');

describe('parseCsv', () => {
  test('handles quoted commas, doubled quotes, line breaks in quotes, CRLF and a BOM', () => {
    const text = '\ufeffa,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\nlast,,\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['last', '', '']
    ]);
  });
});

describe('parseBankFile', () => {
  test('reads a Wealthsimple credit card export in Plaid\'s sign convention; its date is the purchase date', () => {
    const file = parseBankFile(card(
      '2026-11-04,Purchase,Pending,Corner Cafe,-10.40,CAD,,Restaurants',
      '2026-10-30,Payment,Completed,,500.00,CAD,,Uncategorized',
      '2026-10-28,Refund,Completed,Book Store,12.00,CAD,,Shopping'
    ), 7);

    expect(file).toMatchObject({ format: 'wealthsimple_credit_card', accountType: 'credit', dateKind: 'purchase', accountNumbers: [] });
    expect(file.rows.map(({ key, ...row }) => row)).toEqual([
      { date: '2026-11-04', authorizedDate: '2026-11-04', amount: 10.4, currency: 'CAD', name: 'Corner Cafe', merchantName: 'Corner Cafe', pending: true },
      { date: '2026-10-30', authorizedDate: '2026-10-30', amount: -500, currency: 'CAD', name: 'Payment', merchantName: null, pending: false },
      { date: '2026-10-28', authorizedDate: '2026-10-28', amount: -12, currency: 'CAD', name: 'Book Store', merchantName: 'Book Store', pending: false }
    ]);
    expect(file.rows.every(row => isFileRow(row.key))).toBe(true);
  });

  test('reads a Wealthsimple chequing export, with its account number and quoted payees', () => {
    const file = parseBankFile([
      CHEQUING_HEADER,
      '2026-11-03,09:07:14,12345678,Chequing,Withdrawal,Bill Pay,Completed,"CARD, BANK",,-165.02,CAD,',
      '2026-11-01,00:00:01,12345678,Chequing,Interest,,Completed,,,4.50,CAD,'
    ].join('\n'), 3);

    expect(file).toMatchObject({ format: 'wealthsimple_chequing', accountType: 'depository', accountNumbers: ['12345678'] });
    expect(file.rows.map(row => [row.name, row.merchantName, row.amount])).toEqual([
      ['CARD, BANK - Bill Pay', 'CARD, BANK', 165.02],
      ['Interest', null, -4.5]
    ]);
  });

  test('reads a CIBC credit card export (no header, debit/credit columns, posted dates, every card on the account)', () => {
    const file = parseBankFile([
      '2026-11-04,"SHOPPERS DRUG MART #13 STITTSVILLE, ON",28.24,,5223********4148',
      '2026-10-30,PAYMENT THANK YOU/PAIEMEN T MERCI,,4104.59,5223********4148',
      '2026-10-29,"PETRO-CANADA 35212 STITTSVILLE, ON",74.25,,5223********2147'
    ].join('\r\n'), 18);

    expect(file).toMatchObject({ format: 'cibc_credit_card', accountType: 'credit', dateKind: 'posted', accountNumbers: ['5223********4148', '5223********2147'] });
    expect(file.rows.map(({ key, ...row }) => row)).toEqual([
      { date: '2026-11-04', authorizedDate: null, amount: 28.24, currency: 'CAD', name: 'SHOPPERS DRUG MART #13 STITTSVILLE, ON', merchantName: null, pending: false },
      { date: '2026-10-30', authorizedDate: null, amount: -4104.59, currency: 'CAD', name: 'PAYMENT THANK YOU/PAIEMEN T MERCI', merchantName: null, pending: false },
      { date: '2026-10-29', authorizedDate: null, amount: 74.25, currency: 'CAD', name: 'PETRO-CANADA 35212 STITTSVILLE, ON', merchantName: null, pending: false }
    ]);
  });

  test('keys are stable across exports and when a pending charge completes, and tell identical rows apart', () => {
    const first = parseBankFile(card(
      '2026-11-04,Purchase,Pending,Corner Cafe,-4.50,CAD,,',
      '2026-11-04,Purchase,Pending,Corner Cafe,-4.50,CAD,,'
    ), 7).rows.map(row => row.key);
    const later = parseBankFile(card(
      '2026-11-05,Purchase,Completed,Grocer,-20.00,CAD,,',
      '2026-11-04,Purchase,Completed,Corner Cafe,-4.50,CAD,,',
      '2026-11-04,Purchase,Completed,Corner Cafe,-4.50,CAD,,'
    ), 7).rows.map(row => row.key);

    expect(first[0]).not.toBe(first[1]);
    expect(later.slice(1)).toEqual(first);
    // The account is part of the key
    expect(parseBankFile(card('2026-11-04,Purchase,Pending,Corner Cafe,-4.50,CAD,,'), 8).rows[0].key).not.toBe(first[0]);
  });

  test.each([
    ['an empty file', '', 'The file is empty.'],
    ['an unknown export', 'Date,Description,Debit,Credit\n2026-11-01,X,1.00,', /Unrecognised file/],
    ['a header only', CARD_HEADER, 'The file has no transactions.'],
    ['a bad line', card('Nov 4,Purchase,Completed,X,-1.00,CAD,,'), /Line 2 isn't a transaction/]
  ])('refuses %s', (_, text, message) => {
    expect(() => parseBankFile(text, 7)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => parseBankFile(text, 7)).toThrow(message);
  });
});

describe('recognising the same transaction in two sources', () => {
  const row = (amount, date, extra = {}) => ({ amount, date, pending: false, name: 'X', merchantName: null, ...extra });

  test('same amount within 3 days', () => {
    expect(sameTransaction(row(10, '2026-11-04'), row(10, '2026-11-01'))).toEqual({ gap: 3, exact: true });
    expect(sameTransaction(row(10, '2026-11-05'), row(10, '2026-11-01'))).toBeNull();
  });

  test('a pending charge that settled for a different amount (a tip): within 25% and the same merchant', () => {
    const pendingCafe = row(40, '2026-11-01', { pending: true, name: 'RIDGE ROCK BREWING CARP, ON' });
    expect(sameTransaction(row(46, '2026-11-02', { name: 'Ridge Rock Brewing - Purchase' }), pendingCafe)).toEqual({ gap: 1, exact: false });
    // Not when neither is pending, the merchant differs, or the amount is too far off
    expect(sameTransaction(row(46, '2026-11-02', { name: 'Ridge Rock' }), { ...pendingCafe, pending: false })).toBeNull();
    expect(sameTransaction(row(46, '2026-11-02', { name: 'Petro-Canada' }), pendingCafe)).toBeNull();
    expect(sameTransaction(row(55, '2026-11-02', { name: 'Ridge Rock' }), pendingCafe)).toBeNull();
  });

  test('similar names compare the first meaningful word of the description or merchant name', () => {
    expect(similarNames({ name: 'SQ *DELIGHTS BY MAMA I CARP, ON' }, { name: 'x', merchantName: 'Delights by Mama' })).toBe(true);
    expect(similarNames({ name: 'Purchase - Amazon' }, { name: 'AMZN Mktp' })).toBe(false);
  });
});

describe('merging the two sources (best information kept)', () => {
  const staged = (extra = {}) => ({
    id: 1, transactionId: 'plaid-1', date: '2026-11-03', authorizedDate: null, amount: 28.24, pending: 0,
    name: 'SHOPPERS DRUG MART', merchantName: null, status: 'added', expenseId: 9, removedAt: null, ...extra
  });
  const fileRow = (extra = {}) => ({
    key: `${FILE_ID_PREFIX}k`, date: '2026-11-04', authorizedDate: null, amount: 28.24, pending: false,
    name: 'SHOPPERS DRUG MART #13', merchantName: null, currency: 'CAD', ...extra
  });

  describe('a file after Plaid', () => {
    test('settles a charge Plaid still has pending: the file\'s posting date, Plaid\'s purchase date and id', () => {
      const { changes, settlement } = mergeFileIntoRow(staged({ pending: 1, authorizedDate: '2026-11-03' }), fileRow(), 'posted');

      expect(changes).toEqual({ pending: 0, date: '2026-11-04' });
      expect(settlement).toEqual({ plaidTransactionId: 1, expenseId: 9, settled: true, previousAmount: 28.24, amount: 28.24, postedDate: '2026-11-04' });
    });

    test('takes the settled amount, and restores a charge the bank had dropped from Plaid', () => {
      const { changes } = mergeFileIntoRow(staged({ pending: 1, amount: 40, removedAt: '2026-11-04 10:00:00' }), fileRow({ amount: 46 }), 'posted');
      expect(changes).toEqual({ pending: 0, amount: 46, date: '2026-11-04', removedAt: null });
    });

    test('fills in a purchase date and merchant name Plaid didn\'t send, and never makes a settled row pending', () => {
      const { changes, settlement } = mergeFileIntoRow(
        staged({ date: '2026-11-04' }),
        fileRow({ date: '2026-11-03', authorizedDate: '2026-11-03', merchantName: 'Shoppers', pending: true }),
        'purchase'
      );
      expect(changes).toEqual({ authorizedDate: '2026-11-03', merchantName: 'Shoppers' });
      expect(settlement).toBeNull();
    });

    test('leaves a Plaid row it adds nothing to (review state is never part of a merge)', () => {
      expect(mergeFileIntoRow(staged({ status: 'ignored' }), fileRow({ date: '2026-11-03' }), 'posted')).toEqual({ changes: null, settlement: null });
    });
  });

  describe('Plaid after a file', () => {
    const fileStaged = (extra = {}) => staged({ transactionId: `${FILE_ID_PREFIX}k`, date: '2026-11-03', authorizedDate: '2026-11-03', merchantName: 'Corner Cafe', ...extra });
    const txn = (extra = {}) => ({
      transaction_id: 'plaid-9', amount: 28.24, date: '2026-11-04', authorized_date: null, name: 'Corner Cafe - Purchase',
      merchant_name: null, pending: false, pending_transaction_id: null, iso_currency_code: 'CAD', ...extra
    });

    test('takes Plaid\'s id and description, keeps the file\'s purchase date and merchant name', () => {
      const { fields, settlement } = mergePlaidIntoFileRow(fileStaged(), txn(), true);
      expect(fields).toMatchObject({
        transactionId: 'plaid-9', pending: 0, amount: 28.24, date: '2026-11-04', authorizedDate: '2026-11-03',
        name: 'Corner Cafe - Purchase', merchantName: 'Corner Cafe'
      });
      expect(settlement).toBeNull();
    });

    test('a pending file row settles when this bank sends pending through Plaid', () => {
      const { fields, settlement } = mergePlaidIntoFileRow(fileStaged({ pending: 1, amount: 40 }), txn({ amount: 46 }), true);
      expect(fields).toMatchObject({ pending: 0, amount: 46 });
      expect(settlement).toMatchObject({ settled: true, previousAmount: 40, amount: 46, postedDate: '2026-11-04' });
    });

    test('a pending file row stays pending when the bank never sends pending through Plaid (Wealthsimple)', () => {
      const { fields, settlement } = mergePlaidIntoFileRow(fileStaged({ pending: 1 }), txn(), false);
      expect(fields).toMatchObject({ transactionId: 'plaid-9', pending: 1 });
      expect(settlement).toBeNull();
    });

    test('a settled file row stays settled, with its amount and date, when Plaid still has it pending', () => {
      const { fields } = mergePlaidIntoFileRow(fileStaged({ date: '2026-11-04', amount: 46 }), txn({ pending: true, amount: 40, date: '2026-11-02', authorized_date: '2026-11-01' }), true);
      expect(fields).toMatchObject({ transactionId: 'plaid-9', pending: 0, amount: 46, date: '2026-11-04', authorizedDate: '2026-11-01' });
    });
  });
});

describe('planFileImport', () => {
  const fileRow = (key, date, amount, extra = {}) => ({ key: `${FILE_ID_PREFIX}${key}`, date, authorizedDate: date, amount, pending: false, name: 'X', merchantName: 'X', ...extra });
  const staged = (id, transactionId, date, amount, extra = {}) => ({
    id, transactionId, date, authorizedDate: null, amount, pending: 0, name: 'X', merchantName: 'X', expenseId: null, removedAt: null, ...extra
  });

  test('leaves transactions Plaid already sent alone, closest date first, each used once', () => {
    const plan = planFileImport(
      [fileRow('a', '2026-11-02', 10), fileRow('b', '2026-11-03', 10), fileRow('c', '2026-11-04', 25)],
      [staged(1, 'plaid-1', '2026-11-03', 10, { authorizedDate: '2026-11-03' }), staged(2, 'plaid-2', '2026-11-08', 25)],
      'purchase'
    );

    // b pairs with the same-day Plaid row; a has no unused row left; c is 4 days from plaid-2
    expect(plan.alreadyFromBank).toBe(1);
    expect(plan.inserts.map(row => row.key)).toEqual([`${FILE_ID_PREFIX}a`, `${FILE_ID_PREFIX}c`]);
  });

  test('re-importing the same rows changes nothing; a completed charge or a new key updates the earlier file row', () => {
    const plan = planFileImport(
      [fileRow('same', '2026-11-01', 5), fileRow('done', '2026-11-02', 7), fileRow('newkey', '2026-11-05', 9)],
      [
        staged(1, `${FILE_ID_PREFIX}same`, '2026-11-01', 5, { authorizedDate: '2026-11-01' }),
        staged(2, `${FILE_ID_PREFIX}done`, '2026-11-02', 7, { pending: 1, authorizedDate: '2026-11-02' }),
        staged(3, `${FILE_ID_PREFIX}oldkey`, '2026-11-04', 9, { pending: 1, authorizedDate: '2026-11-04' })
      ],
      'purchase'
    );

    expect(plan.unchanged).toBe(1);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates.map(u => [u.existing.id, u.changes])).toEqual([
      [2, { pending: 0 }],
      [3, { transactionId: `${FILE_ID_PREFIX}newkey`, pending: 0, date: '2026-11-05', authorizedDate: '2026-11-05' }]
    ]);
  });

  test('a pending charge that completed for a different amount in a newer export updates, not duplicates', () => {
    const plan = planFileImport(
      [fileRow('tip', '2026-11-04', 46, { name: 'Ridge Rock Brewing', merchantName: 'Ridge Rock Brewing' })],
      [staged(1, `${FILE_ID_PREFIX}pre`, '2026-11-04', 40, { pending: 1, name: 'Ridge Rock Brewing', merchantName: 'Ridge Rock Brewing' })],
      'purchase'
    );

    expect(plan.inserts).toEqual([]);
    expect(plan.updates[0].changes).toMatchObject({ pending: 0, amount: 46 });
  });
});
