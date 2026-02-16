/**
 * Consolidated Property-Based Tests for Loan Repository
 * Merged from: loanRepository.fixedRate.pbt.test.js, loanRepository.mortgage.pbt.test.js
 * 
 * Features: fixed-interest-rate-loans, mortgage-tracking
  *
 * @invariant Loan Data Integrity: For any valid loan record including fixed-rate and mortgage types, storing and retrieving it returns equivalent data; fixed_interest_rate and mortgage-specific fields are preserved correctly. Randomization covers diverse loan types, rates, and term configurations.
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

// ============================================================================
// Shared Helpers
// ============================================================================

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) { reject(err); return; }
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) { reject(err); return; }
        db.run(`
          CREATE TABLE loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
            start_date TEXT NOT NULL,
            notes TEXT,
            loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
            is_paid_off INTEGER DEFAULT 0,
            estimated_months_left INTEGER,
            amortization_period INTEGER,
            term_length INTEGER,
            renewal_date TEXT,
            rate_type TEXT CHECK(rate_type IS NULL OR rate_type IN ('fixed', 'variable')),
            payment_frequency TEXT CHECK(payment_frequency IS NULL OR payment_frequency IN ('monthly', 'bi-weekly', 'accelerated_bi-weekly')),
            estimated_property_value REAL,
            fixed_interest_rate REAL DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) { reject(err); return; }
          resolve(db);
        });
      });
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve) => { db.close(() => resolve()); });
}

function getLoanById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM loans WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

const safePastDateString = () => fc.record({
  year: fc.integer({ min: 2020, max: 2025 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 })
}).map(({ year, month, day }) =>
  `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
);

const safeFutureDateString = () => fc.record({
  year: fc.integer({ min: 2026, max: 2035 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 })
}).map(({ year, month, day }) =>
  `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
);

// ============================================================================
// Fixed Interest Rate Tests (from loanRepository.fixedRate.pbt.test.js)
// ============================================================================

// Insert loan with fixed_interest_rate logic (only for loan_type='loan')
function insertLoanWithFixedRate(db, loan) {
  return new Promise((resolve, reject) => {
    const loanType = loan.loan_type || 'loan';
    const fixedRate = loanType === 'loan' ? (loan.fixed_interest_rate ?? null) : null;
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left,
                        amortization_period, term_length, renewal_date, rate_type, payment_frequency, 
                        estimated_property_value, fixed_interest_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      loan.name, loan.initial_balance, loan.start_date, loan.notes || null,
      loanType, loan.is_paid_off || 0, loan.estimated_months_left || null,
      loan.amortization_period || null, loan.term_length || null,
      loan.renewal_date || null, loan.rate_type || null,
      loan.payment_frequency || null, loan.estimated_property_value || null, fixedRate
    ];
    db.run(sql, params, function(err) {
      if (err) { reject(err); return; }
      resolve({ id: this.lastID, ...loan, fixed_interest_rate: fixedRate });
    });
  });
}

function updateLoanWithFixedRate(db, id, loan) {
  return new Promise((resolve, reject) => {
    const loanType = loan.loan_type || 'loan';
    const fixedRate = loanType === 'loan' ? (loan.fixed_interest_rate ?? null) : null;
    const sql = `
      UPDATE loans 
      SET name = ?, initial_balance = ?, start_date = ?, notes = ?, loan_type = ?, estimated_months_left = ?,
          amortization_period = ?, term_length = ?, renewal_date = ?, rate_type = ?, payment_frequency = ?, 
          estimated_property_value = ?, fixed_interest_rate = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const params = [
      loan.name, loan.initial_balance, loan.start_date, loan.notes || null,
      loanType, loan.estimated_months_left || null,
      loan.amortization_period || null, loan.term_length || null,
      loan.renewal_date || null, loan.rate_type || null,
      loan.payment_frequency || null, loan.estimated_property_value || null, fixedRate, id
    ];
    db.run(sql, params, function(err) {
      if (err) { reject(err); return; }
      resolve({ id, ...loan, fixed_interest_rate: fixedRate });
    });
  });
}

const nonLoanTypeArb = fc.constantFrom('line_of_credit', 'mortgage');
const fixedInterestRateArb = fc.oneof(
  fc.constant(null),
  fc.float({ min: 0, max: 30, noNaN: true }).filter(n => !isNaN(n) && isFinite(n) && n >= 0)
);
const nonNullFixedRateArb = fc.float({ min: 0, max: 30, noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

const loanWithFixedRateArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('loan'),
  is_paid_off: fc.constantFrom(0, 1),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null }),
  fixed_interest_rate: fixedInterestRateArb
});

const nonLoanWithAttemptedFixedRateArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: nonLoanTypeArb,
  is_paid_off: fc.constantFrom(0, 1),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null }),
  fixed_interest_rate: nonNullFixedRateArb
});

/**
 * Property 1: Loan Type Restriction
 * Validates: Requirements 1.2, 1.3, 4.5
 */
describe('LoanRepository Fixed Interest Rate Property Tests', () => {
  describe('Property 1: Loan Type Restriction', () => {
    test('Loans with loan_type="loan" can have fixed_interest_rate set', async () => {
      await fc.assert(
        fc.asyncProperty(loanWithFixedRateArb, async (loan) => {
          const db = await createTestDatabase();
          try {
            const created = await insertLoanWithFixedRate(db, loan);
            const retrieved = await getLoanById(db, created.id);
            expect(retrieved.loan_type).toBe('loan');
            if (loan.fixed_interest_rate === null) {
              expect(retrieved.fixed_interest_rate).toBeNull();
            } else {
              expect(retrieved.fixed_interest_rate).toBeCloseTo(loan.fixed_interest_rate, 2);
            }
            return true;
          } finally { await closeDatabase(db); }
        }),
        dbPbtOptions()
      );
    });

    test('Loans with loan_type="line_of_credit" or "mortgage" must have NULL fixed_interest_rate', async () => {
      await fc.assert(
        fc.asyncProperty(nonLoanWithAttemptedFixedRateArb, async (loan) => {
          const db = await createTestDatabase();
          try {
            const created = await insertLoanWithFixedRate(db, loan);
            const retrieved = await getLoanById(db, created.id);
            expect(['line_of_credit', 'mortgage']).toContain(retrieved.loan_type);
            expect(retrieved.fixed_interest_rate).toBeNull();
            return true;
          } finally { await closeDatabase(db); }
        }),
        dbPbtOptions()
      );
    });

    test('Updating a loan to non-loan type should clear fixed_interest_rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanWithFixedRateArb.filter(l => l.fixed_interest_rate !== null),
          nonLoanTypeArb,
          async (loan, newLoanType) => {
            const db = await createTestDatabase();
            try {
              const created = await insertLoanWithFixedRate(db, loan);
              const initial = await getLoanById(db, created.id);
              expect(initial.fixed_interest_rate).not.toBeNull();

              await updateLoanWithFixedRate(db, created.id, {
                ...loan, loan_type: newLoanType, fixed_interest_rate: loan.fixed_interest_rate
              });
              const retrieved = await getLoanById(db, created.id);
              expect(retrieved.loan_type).toBe(newLoanType);
              expect(retrieved.fixed_interest_rate).toBeNull();
              return true;
            } finally { await closeDatabase(db); }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a non-loan type to loan type allows setting fixed_interest_rate', async () => {
      await fc.assert(
        fc.asyncProperty(nonLoanWithAttemptedFixedRateArb, nonNullFixedRateArb, async (loan, newFixedRate) => {
          const db = await createTestDatabase();
          try {
            const created = await insertLoanWithFixedRate(db, loan);
            const initial = await getLoanById(db, created.id);
            expect(initial.fixed_interest_rate).toBeNull();

            await updateLoanWithFixedRate(db, created.id, {
              ...loan, loan_type: 'loan', fixed_interest_rate: newFixedRate
            });
            const retrieved = await getLoanById(db, created.id);
            expect(retrieved.loan_type).toBe('loan');
            expect(retrieved.fixed_interest_rate).toBeCloseTo(newFixedRate, 2);
            return true;
          } finally { await closeDatabase(db); }
        }),
        dbPbtOptions()
      );
    });
  });
});

// ============================================================================
// Mortgage Tests (from loanRepository.mortgage.pbt.test.js)
// ============================================================================

// Insert loan without fixed_interest_rate (mortgage schema)
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left,
                        amortization_period, term_length, renewal_date, rate_type, payment_frequency, estimated_property_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      loan.name, loan.initial_balance, loan.start_date, loan.notes || null,
      loan.loan_type || 'loan', loan.is_paid_off || 0, loan.estimated_months_left || null,
      loan.amortization_period || null, loan.term_length || null,
      loan.renewal_date || null, loan.rate_type || null,
      loan.payment_frequency || null, loan.estimated_property_value || null
    ];
    db.run(sql, params, function(err) {
      if (err) { reject(err); return; }
      resolve({ id: this.lastID, ...loan });
    });
  });
}

function updateMortgageFields(db, id, updates) {
  return new Promise((resolve, reject) => {
    const allowedFields = ['name', 'notes', 'estimated_property_value', 'renewal_date'];
    const fieldsToUpdate = [];
    const params = [];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fieldsToUpdate.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }
    if (fieldsToUpdate.length === 0) {
      getLoanById(db, id).then(resolve).catch(reject);
      return;
    }
    params.push(id);
    const sql = `UPDATE loans SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(sql, params, function(err) {
      if (err) { reject(err); return; }
      getLoanById(db, id).then(resolve).catch(reject);
    });
  });
}

const nonMortgageLoanTypeArb = fc.constantFrom('loan', 'line_of_credit');

const nonMortgageLoanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: nonMortgageLoanTypeArb,
  is_paid_off: fc.constantFrom(0, 1),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null })
});

const mortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 10000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('mortgage'),
  is_paid_off: fc.constant(0),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 480 }), { nil: null }),
  amortization_period: fc.integer({ min: 1, max: 40 }),
  term_length: fc.integer({ min: 1, max: 10 }),
  renewal_date: safeFutureDateString(),
  rate_type: fc.constantFrom('fixed', 'variable'),
  payment_frequency: fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
  estimated_property_value: fc.option(safeAmount({ min: 50000, max: 50000000 }), { nil: null })
}).filter(m => m.term_length <= m.amortization_period);

const immutableFieldUpdateArb = fc.record({
  initial_balance: fc.option(safeAmount({ min: 100, max: 1000000 }), { nil: undefined }),
  start_date: fc.option(safePastDateString(), { nil: undefined }),
  amortization_period: fc.option(fc.integer({ min: 1, max: 40 }), { nil: undefined }),
  term_length: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined })
}).filter(u =>
  u.initial_balance !== undefined || u.start_date !== undefined ||
  u.amortization_period !== undefined || u.term_length !== undefined
);

const allowedFieldUpdateArb = fc.record({
  name: fc.option(safeString({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: undefined }),
  estimated_property_value: fc.option(safeAmount({ min: 50000, max: 50000000 }), { nil: undefined }),
  renewal_date: fc.option(safeFutureDateString(), { nil: undefined })
});

/**
 * Property 3: Non-Mortgage Loans Have Null Mortgage Fields
 * Validates: Requirements 2.5
 * 
 * Property 8: Immutable Fields on Update
 * Validates: Requirements 9.3
 */
describe('LoanRepository Mortgage Property Tests', () => {
  describe('Property 3: Non-Mortgage Loans Have Null Mortgage Fields', () => {
    test('Non-mortgage loans should have null mortgage-specific fields', async () => {
      await fc.assert(
        fc.asyncProperty(nonMortgageLoanArb, async (loan) => {
          const db = await createTestDatabase();
          try {
            const created = await insertLoan(db, loan);
            const retrieved = await getLoanById(db, created.id);
            expect(retrieved.amortization_period).toBeNull();
            expect(retrieved.term_length).toBeNull();
            expect(retrieved.renewal_date).toBeNull();
            expect(retrieved.rate_type).toBeNull();
            expect(retrieved.payment_frequency).toBeNull();
            expect(retrieved.estimated_property_value).toBeNull();
            expect(['loan', 'line_of_credit']).toContain(retrieved.loan_type);
            return true;
          } finally { await closeDatabase(db); }
        }),
        dbPbtOptions()
      );
    });

    test('Mortgage loans should have mortgage-specific fields populated', async () => {
      await fc.assert(
        fc.asyncProperty(mortgageArb, async (mortgage) => {
          const db = await createTestDatabase();
          try {
            const created = await insertLoan(db, mortgage);
            const retrieved = await getLoanById(db, created.id);
            expect(retrieved.loan_type).toBe('mortgage');
            expect(retrieved.amortization_period).toBe(mortgage.amortization_period);
            expect(retrieved.term_length).toBe(mortgage.term_length);
            expect(retrieved.renewal_date).toBe(mortgage.renewal_date);
            expect(retrieved.rate_type).toBe(mortgage.rate_type);
            expect(retrieved.payment_frequency).toBe(mortgage.payment_frequency);
            if (mortgage.estimated_property_value !== null) {
              expect(retrieved.estimated_property_value).toBeCloseTo(mortgage.estimated_property_value, 2);
            }
            return true;
          } finally { await closeDatabase(db); }
        }),
        dbPbtOptions()
      );
    });
  });

  describe('Property 8: Immutable Fields on Update', () => {
    test('Immutable fields should be preserved when using updateMortgageFields', async () => {
      await fc.assert(
        fc.asyncProperty(mortgageArb, immutableFieldUpdateArb, async (mortgage, attemptedUpdates) => {
          const db = await createTestDatabase();
          try {
            const created = await insertLoan(db, mortgage);
            const origBal = mortgage.initial_balance;
            const origStart = mortgage.start_date;
            const origAmort = mortgage.amortization_period;
            const origTerm = mortgage.term_length;

            await updateMortgageFields(db, created.id, attemptedUpdates);
            const retrieved = await getLoanById(db, created.id);

            expect(retrieved.initial_balance).toBeCloseTo(origBal, 2);
            expect(retrieved.start_date).toBe(origStart);
            expect(retrieved.amortization_period).toBe(origAmort);
            expect(retrieved.term_length).toBe(origTerm);
            return true;
          } finally { await closeDatabase(db); }
        }),
        dbPbtOptions()
      );
    });

    test('Allowed fields should be updated correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          allowedFieldUpdateArb.filter(u =>
            u.name !== undefined || u.notes !== undefined ||
            u.estimated_property_value !== undefined || u.renewal_date !== undefined
          ),
          async (mortgage, updates) => {
            const db = await createTestDatabase();
            try {
              const created = await insertLoan(db, mortgage);
              const origBal = mortgage.initial_balance;
              const origStart = mortgage.start_date;
              const origAmort = mortgage.amortization_period;
              const origTerm = mortgage.term_length;

              await updateMortgageFields(db, created.id, updates);
              const retrieved = await getLoanById(db, created.id);

              if (updates.name !== undefined) expect(retrieved.name).toBe(updates.name);
              if (updates.notes !== undefined) expect(retrieved.notes).toBe(updates.notes);
              if (updates.estimated_property_value !== undefined)
                expect(retrieved.estimated_property_value).toBeCloseTo(updates.estimated_property_value, 2);
              if (updates.renewal_date !== undefined) expect(retrieved.renewal_date).toBe(updates.renewal_date);

              expect(retrieved.initial_balance).toBeCloseTo(origBal, 2);
              expect(retrieved.start_date).toBe(origStart);
              expect(retrieved.amortization_period).toBe(origAmort);
              expect(retrieved.term_length).toBe(origTerm);
              return true;
            } finally { await closeDatabase(db); }
          }
        ),
        dbPbtOptions()
      );
    });
  });
});
