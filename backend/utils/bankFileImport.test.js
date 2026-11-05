const { parseCsv, parseBankFile, planFileImport, isFileRow, FILE_ID_PREFIX } = require('./bankFileImport');

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
  test('reads a Wealthsimple credit card export in Plaid\'s sign convention, with pending charges', () => {
    const file = parseBankFile(card(
      '2026-11-04,Purchase,Pending,Corner Cafe,-10.40,CAD,,Restaurants',
      '2026-10-30,Payment,Completed,,500.00,CAD,,Uncategorized',
      '2026-10-28,Refund,Completed,Book Store,12.00,CAD,,Shopping'
    ), 7);

    expect(file).toMatchObject({ format: 'wealthsimple_credit_card', accountType: 'credit', accountNumber: null });
    expect(file.rows.map(({ key, ...row }) => row)).toEqual([
      { date: '2026-11-04', amount: 10.4, currency: 'CAD', name: 'Corner Cafe', merchantName: 'Corner Cafe', pending: true },
      { date: '2026-10-30', amount: -500, currency: 'CAD', name: 'Payment', merchantName: null, pending: false },
      { date: '2026-10-28', amount: -12, currency: 'CAD', name: 'Book Store', merchantName: 'Book Store', pending: false }
    ]);
    expect(file.rows.every(row => isFileRow(row.key))).toBe(true);
  });

  test('reads a Wealthsimple chequing export, with its account number and quoted payees', () => {
    const file = parseBankFile([
      CHEQUING_HEADER,
      '2026-11-03,09:07:14,12345678,Chequing,Withdrawal,Bill Pay,Completed,"CARD, BANK",,-165.02,CAD,',
      '2026-11-01,00:00:01,12345678,Chequing,Interest,,Completed,,,4.50,CAD,'
    ].join('\n'), 3);

    expect(file).toMatchObject({ format: 'wealthsimple_chequing', accountType: 'depository', accountNumber: '12345678' });
    expect(file.rows.map(row => [row.name, row.merchantName, row.amount])).toEqual([
      ['CARD, BANK - Bill Pay', 'CARD, BANK', 165.02],
      ['Interest', null, -4.5]
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
    expect(() => parseBankFile(text, 7)).toThrow(expect.objectContaining({ statusCode: 400, message: expect.anything() }));
    expect(() => parseBankFile(text, 7)).toThrow(message);
  });
});

describe('planFileImport', () => {
  const fileRow = (key, date, amount, extra = {}) => ({ key: `${FILE_ID_PREFIX}${key}`, date, amount, pending: false, name: 'X', merchantName: 'X', ...extra });
  const staged = (id, transactionId, date, amount, extra = {}) => ({ id, transactionId, date, amount, pending: 0, name: 'X', merchantName: 'X', expenseId: null, ...extra });

  test('leaves transactions Plaid already sent alone, closest date first, each used once', () => {
    const plan = planFileImport(
      [fileRow('a', '2026-11-02', 10), fileRow('b', '2026-11-03', 10), fileRow('c', '2026-11-04', 25)],
      [staged(1, 'plaid-1', '2026-11-03', 10), staged(2, 'plaid-2', '2026-11-08', 25)]
    );

    // b pairs with the same-day Plaid row; a has no unused row left; c is 4 days from plaid-2
    expect(plan.alreadyFromBank).toBe(1);
    expect(plan.inserts.map(row => row.key)).toEqual([`${FILE_ID_PREFIX}a`, `${FILE_ID_PREFIX}c`]);
  });

  test('re-importing the same rows changes nothing; a completed charge or a new key updates the earlier file row', () => {
    const plan = planFileImport(
      [fileRow('same', '2026-11-01', 5), fileRow('done', '2026-11-02', 7), fileRow('newkey', '2026-11-05', 9)],
      [
        staged(1, `${FILE_ID_PREFIX}same`, '2026-11-01', 5),
        staged(2, `${FILE_ID_PREFIX}done`, '2026-11-02', 7, { pending: 1 }),
        staged(3, `${FILE_ID_PREFIX}oldkey`, '2026-11-04', 9, { pending: 1 })
      ]
    );

    expect(plan.unchanged).toBe(1);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates.map(u => [u.existing.id, u.row.key])).toEqual([[2, `${FILE_ID_PREFIX}done`], [3, `${FILE_ID_PREFIX}newkey`]]);
  });
});
