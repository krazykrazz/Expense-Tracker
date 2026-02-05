/**
 * Loan Payment API Integration Tests
 * 
 * Tests all CRUD operations and error responses for loan payment tracking.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../database/db');
const loanPaymentRoutes = require('../routes/loanPaymentRoutes');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/loans', loanPaymentRoutes);

describe('Loan Payment API Integration Tests', () => {
  let db;
  let testLoanId;
  let testMortgageId;
  let testLineOfCreditId;
  let testPaymentId;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM mortgage_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create a test loan
    testLoanId = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loans (name, initial_balance, start_date, loan_type, notes)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(sql, ['Test Car Loan', 25000, '2024-01-01', 'loan', 'Test loan'], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    // Create a test mortgage
    testMortgageId = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loans (name, initial_balance, start_date, loan_type, notes, amortization_period, payment_frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, ['Test Mortgage', 400000, '2024-01-01', 'mortgage', 'Test mortgage', 25, 'monthly'], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    // Create a test line of credit
    testLineOfCreditId = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loans (name, initial_balance, start_date, loan_type, notes)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(sql, ['Test LOC', 10000, '2024-01-01', 'line_of_credit', 'Test LOC'], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  });


  describe('POST /api/loans/:loanId/loan-payments', () => {
    it('should create a payment successfully', async () => {
      const paymentData = {
        amount: 500,
        payment_date: '2024-06-15',
        notes: 'Monthly payment'
      };

      const response = await request(app)
        .post(`/api/loans/${testLoanId}/loan-payments`)
        .send(paymentData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.loan_id).toBe(testLoanId);
      expect(response.body.amount).toBe(500);
      expect(response.body.payment_date).toBe('2024-06-15');
      expect(response.body.notes).toBe('Monthly payment');

      testPaymentId = response.body.id;
    });

    it('should create a payment without notes', async () => {
      const paymentData = {
        amount: 500,
        payment_date: '2024-06-15'
      };

      const response = await request(app)
        .post(`/api/loans/${testLoanId}/loan-payments`)
        .send(paymentData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.notes).toBeNull();
    });

    it('should return 400 for invalid loan ID', async () => {
      const response = await request(app)
        .post('/api/loans/invalid/loan-payments')
        .send({ amount: 500, payment_date: '2024-06-15' })
        .expect(400);

      expect(response.body.error).toBe('Invalid loan ID');
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .post('/api/loans/99999/loan-payments')
        .send({ amount: 500, payment_date: '2024-06-15' })
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });

    it('should return 400 for line of credit', async () => {
      const response = await request(app)
        .post(`/api/loans/${testLineOfCreditId}/loan-payments`)
        .send({ amount: 500, payment_date: '2024-06-15' })
        .expect(400);

      expect(response.body.error).toBe('Payment tracking is only available for loans and mortgages');
    });

    it('should return 400 for negative amount', async () => {
      const response = await request(app)
        .post(`/api/loans/${testLoanId}/loan-payments`)
        .send({ amount: -100, payment_date: '2024-06-15' })
        .expect(400);

      expect(response.body.error).toContain('positive number');
    });

    it('should return 400 for zero amount', async () => {
      const response = await request(app)
        .post(`/api/loans/${testLoanId}/loan-payments`)
        .send({ amount: 0, payment_date: '2024-06-15' })
        .expect(400);

      expect(response.body.error).toContain('positive number');
    });

    it('should return 400 for invalid date format', async () => {
      const response = await request(app)
        .post(`/api/loans/${testLoanId}/loan-payments`)
        .send({ amount: 500, payment_date: '06-15-2024' })
        .expect(400);

      expect(response.body.error).toContain('YYYY-MM-DD');
    });

    it('should return 400 for future date', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const response = await request(app)
        .post(`/api/loans/${testLoanId}/loan-payments`)
        .send({ amount: 500, payment_date: futureDateStr })
        .expect(400);

      expect(response.body.error).toContain('future');
    });

    it('should work for mortgages', async () => {
      const response = await request(app)
        .post(`/api/loans/${testMortgageId}/loan-payments`)
        .send({ amount: 2000, payment_date: '2024-06-15' })
        .expect(201);

      expect(response.body.loan_id).toBe(testMortgageId);
      expect(response.body.amount).toBe(2000);
    });
  });


  describe('GET /api/loans/:loanId/loan-payments', () => {
    beforeEach(async () => {
      // Create some test payments
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 500, '2024-06-15', 'Payment 1'],
          function(err) {
            if (err) reject(err);
            else {
              testPaymentId = this.lastID;
              resolve();
            }
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 500, '2024-07-15', 'Payment 2'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    it('should get all payments for a loan in reverse chronological order', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/loan-payments`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      // Should be in reverse chronological order (newest first)
      expect(response.body[0].payment_date).toBe('2024-07-15');
      expect(response.body[1].payment_date).toBe('2024-06-15');
    });

    it('should return empty array for loan with no payments', async () => {
      const response = await request(app)
        .get(`/api/loans/${testMortgageId}/loan-payments`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should return 400 for invalid loan ID', async () => {
      const response = await request(app)
        .get('/api/loans/invalid/loan-payments')
        .expect(400);

      expect(response.body.error).toBe('Invalid loan ID');
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .get('/api/loans/99999/loan-payments')
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });

    it('should return 400 for line of credit', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLineOfCreditId}/loan-payments`)
        .expect(400);

      expect(response.body.error).toBe('Payment tracking is only available for loans and mortgages');
    });
  });

  describe('GET /api/loans/:loanId/loan-payments/:paymentId', () => {
    beforeEach(async () => {
      testPaymentId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 500, '2024-06-15', 'Test payment'],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });

    it('should get a specific payment', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/loan-payments/${testPaymentId}`)
        .expect(200);

      expect(response.body.id).toBe(testPaymentId);
      expect(response.body.loan_id).toBe(testLoanId);
      expect(response.body.amount).toBe(500);
    });

    it('should return 404 for non-existent payment', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/loan-payments/99999`)
        .expect(404);

      expect(response.body.error).toBe('Payment not found');
    });

    it('should return 400 if payment belongs to different loan', async () => {
      const response = await request(app)
        .get(`/api/loans/${testMortgageId}/loan-payments/${testPaymentId}`)
        .expect(400);

      expect(response.body.error).toBe('Payment does not belong to this loan');
    });

    it('should return 400 for invalid payment ID', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/loan-payments/invalid`)
        .expect(400);

      expect(response.body.error).toBe('Invalid payment ID');
    });
  });


  describe('PUT /api/loans/:loanId/loan-payments/:paymentId', () => {
    beforeEach(async () => {
      testPaymentId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 500, '2024-06-15', 'Original payment'],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });

    it('should update a payment successfully', async () => {
      const updateData = {
        amount: 600,
        payment_date: '2024-06-20',
        notes: 'Updated payment'
      };

      const response = await request(app)
        .put(`/api/loans/${testLoanId}/loan-payments/${testPaymentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.id).toBe(testPaymentId);
      expect(response.body.amount).toBe(600);
      expect(response.body.payment_date).toBe('2024-06-20');
      expect(response.body.notes).toBe('Updated payment');
    });

    it('should return 404 for non-existent payment', async () => {
      const response = await request(app)
        .put(`/api/loans/${testLoanId}/loan-payments/99999`)
        .send({ amount: 600, payment_date: '2024-06-20' })
        .expect(404);

      expect(response.body.error).toBe('Payment not found');
    });

    it('should return 400 if payment belongs to different loan', async () => {
      const response = await request(app)
        .put(`/api/loans/${testMortgageId}/loan-payments/${testPaymentId}`)
        .send({ amount: 600, payment_date: '2024-06-20' })
        .expect(400);

      expect(response.body.error).toBe('Payment does not belong to this loan');
    });

    it('should return 400 for invalid amount', async () => {
      const response = await request(app)
        .put(`/api/loans/${testLoanId}/loan-payments/${testPaymentId}`)
        .send({ amount: -100, payment_date: '2024-06-20' })
        .expect(400);

      expect(response.body.error).toContain('positive number');
    });

    it('should return 400 for invalid date', async () => {
      const response = await request(app)
        .put(`/api/loans/${testLoanId}/loan-payments/${testPaymentId}`)
        .send({ amount: 600, payment_date: 'invalid-date' })
        .expect(400);

      expect(response.body.error).toContain('YYYY-MM-DD');
    });
  });

  describe('DELETE /api/loans/:loanId/loan-payments/:paymentId', () => {
    beforeEach(async () => {
      testPaymentId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 500, '2024-06-15', 'Payment to delete'],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });

    it('should delete a payment successfully', async () => {
      const response = await request(app)
        .delete(`/api/loans/${testLoanId}/loan-payments/${testPaymentId}`)
        .expect(200);

      expect(response.body.message).toBe('Payment deleted successfully');

      // Verify payment is deleted
      const getResponse = await request(app)
        .get(`/api/loans/${testLoanId}/loan-payments/${testPaymentId}`)
        .expect(404);

      expect(getResponse.body.error).toBe('Payment not found');
    });

    it('should return 404 for non-existent payment', async () => {
      const response = await request(app)
        .delete(`/api/loans/${testLoanId}/loan-payments/99999`)
        .expect(404);

      expect(response.body.error).toBe('Payment not found');
    });

    it('should return 400 if payment belongs to different loan', async () => {
      const response = await request(app)
        .delete(`/api/loans/${testMortgageId}/loan-payments/${testPaymentId}`)
        .expect(400);

      expect(response.body.error).toBe('Payment does not belong to this loan');
    });
  });


  describe('GET /api/loans/:loanId/calculated-balance', () => {
    beforeEach(async () => {
      // Create some test payments
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date) VALUES (?, ?, ?)',
          [testLoanId, 1000, '2024-06-15'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date) VALUES (?, ?, ?)',
          [testLoanId, 500, '2024-07-15'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    it('should calculate balance correctly', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/calculated-balance`)
        .expect(200);

      expect(response.body.loanId).toBe(testLoanId);
      expect(response.body.initialBalance).toBe(25000);
      expect(response.body.totalPayments).toBe(1500);
      expect(response.body.currentBalance).toBe(23500); // 25000 - 1500
      expect(response.body.paymentCount).toBe(2);
      expect(response.body.lastPaymentDate).toBe('2024-07-15');
    });

    it('should return initial balance when no payments', async () => {
      const response = await request(app)
        .get(`/api/loans/${testMortgageId}/calculated-balance`)
        .expect(200);

      expect(response.body.initialBalance).toBe(400000);
      expect(response.body.totalPayments).toBe(0);
      expect(response.body.currentBalance).toBe(400000);
      expect(response.body.paymentCount).toBe(0);
      expect(response.body.lastPaymentDate).toBeNull();
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .get('/api/loans/99999/calculated-balance')
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });
  });

  describe('GET /api/loans/:loanId/payment-balance-history', () => {
    beforeEach(async () => {
      // Create payments in chronological order
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 1000, '2024-06-15', 'First payment'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [testLoanId, 500, '2024-07-15', 'Second payment'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    it('should return balance history with running totals', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/payment-balance-history`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      
      // Should be in reverse chronological order (newest first)
      expect(response.body[0].date).toBe('2024-07-15');
      expect(response.body[0].payment).toBe(500);
      expect(response.body[0].runningBalance).toBe(23500); // 25000 - 1000 - 500
      
      expect(response.body[1].date).toBe('2024-06-15');
      expect(response.body[1].payment).toBe(1000);
      expect(response.body[1].runningBalance).toBe(24000); // 25000 - 1000
    });

    it('should return empty array for loan with no payments', async () => {
      const response = await request(app)
        .get(`/api/loans/${testMortgageId}/payment-balance-history`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .get('/api/loans/99999/payment-balance-history')
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });
  });


  describe('GET /api/loans/:loanId/payment-suggestion', () => {
    it('should return average for loan with payment history', async () => {
      // Create some payments
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date) VALUES (?, ?, ?)',
          [testLoanId, 400, '2024-06-15'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_payments (loan_id, amount, payment_date) VALUES (?, ?, ?)',
          [testLoanId, 600, '2024-07-15'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const response = await request(app)
        .get(`/api/loans/${testLoanId}/payment-suggestion`)
        .expect(200);

      expect(response.body.suggestedAmount).toBe(500); // (400 + 600) / 2
      expect(response.body.source).toBe('average_history');
    });

    it('should return null for loan without payment history', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/payment-suggestion`)
        .expect(200);

      expect(response.body.suggestedAmount).toBeNull();
      expect(response.body.source).toBe('none');
    });

    it('should return 400 for line of credit', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLineOfCreditId}/payment-suggestion`)
        .expect(400);

      expect(response.body.error).toBe('Payment suggestions are not available for lines of credit');
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .get('/api/loans/99999/payment-suggestion')
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });
  });

  describe('GET /api/loans/:loanId/migrate-balances/preview', () => {
    beforeEach(async () => {
      // Create balance entries for migration testing
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
          [testLoanId, 2024, 1, 25000, 5.0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
          [testLoanId, 2024, 2, 24500, 5.0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
          [testLoanId, 2024, 3, 24000, 5.0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    it('should preview migration correctly', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLoanId}/migrate-balances/preview`)
        .expect(200);

      expect(response.body.loanId).toBe(testLoanId);
      expect(response.body.canMigrate).toBe(true);
      expect(response.body.converted.length).toBe(2); // 2 balance differences
      expect(response.body.summary.totalConverted).toBe(2);
      expect(response.body.summary.totalPaymentAmount).toBe(1000); // 500 + 500
    });

    it('should return canMigrate false for loan without balance entries', async () => {
      const response = await request(app)
        .get(`/api/loans/${testMortgageId}/migrate-balances/preview`)
        .expect(200);

      expect(response.body.canMigrate).toBe(false);
      expect(response.body.message).toContain('No balance entries');
    });

    it('should return 400 for line of credit', async () => {
      const response = await request(app)
        .get(`/api/loans/${testLineOfCreditId}/migrate-balances/preview`)
        .expect(400);

      expect(response.body.error).toBe('Migration is only available for loans and mortgages');
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .get('/api/loans/99999/migrate-balances/preview')
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });
  });

  describe('POST /api/loans/:loanId/migrate-balances', () => {
    beforeEach(async () => {
      // Create balance entries for migration
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
          [testLoanId, 2024, 1, 25000, 5.0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)',
          [testLoanId, 2024, 2, 24500, 5.0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    it('should migrate balance entries to payments', async () => {
      const response = await request(app)
        .post(`/api/loans/${testLoanId}/migrate-balances`)
        .expect(200);

      expect(response.body.loanId).toBe(testLoanId);
      expect(response.body.converted.length).toBe(1);
      expect(response.body.converted[0].paymentAmount).toBe(500);
      expect(response.body.summary.totalConverted).toBe(1);

      // Verify payments were created
      const paymentsResponse = await request(app)
        .get(`/api/loans/${testLoanId}/loan-payments`)
        .expect(200);

      expect(paymentsResponse.body.length).toBe(1);
      expect(paymentsResponse.body[0].amount).toBe(500);
    });

    it('should return 400 for line of credit', async () => {
      const response = await request(app)
        .post(`/api/loans/${testLineOfCreditId}/migrate-balances`)
        .expect(400);

      expect(response.body.error).toBe('Migration is only available for loans and mortgages');
    });

    it('should return 404 for non-existent loan', async () => {
      const response = await request(app)
        .post('/api/loans/99999/migrate-balances')
        .expect(404);

      expect(response.body.error).toBe('Loan not found');
    });
  });
});
