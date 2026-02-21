import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { API_ENDPOINTS } from './config.js';

// Feature: config-endpoint-cleanup, Property 1: Canonical endpoint URL equivalence
describe('Config Endpoint Cleanup - Canonical endpoint URL equivalence', () => {
  const idArb = fc.integer({ min: 1, max: 999999 });

  it('LOAN_INSIGHTS produces /api/loans/{id}/insights', () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(API_ENDPOINTS.LOAN_INSIGHTS(id)).toMatch(new RegExp(`/api/loans/${id}/insights$`));
      }),
      { numRuns: 100 }
    );
  });

  it('LOAN_PAYMENTS produces /api/loans/{id}/payments', () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(API_ENDPOINTS.LOAN_PAYMENTS(id)).toMatch(new RegExp(`/api/loans/${id}/payments$`));
      }),
      { numRuns: 100 }
    );
  });

  it('LOAN_PAYMENT produces /api/loans/{id}/payments/{paymentId}', () => {
    fc.assert(
      fc.property(idArb, idArb, (id, paymentId) => {
        expect(API_ENDPOINTS.LOAN_PAYMENT(id, paymentId)).toMatch(new RegExp(`/api/loans/${id}/payments/${paymentId}$`));
      }),
      { numRuns: 100 }
    );
  });

  it('LOAN_SCENARIO produces /api/loans/{id}/insights/scenario', () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(API_ENDPOINTS.LOAN_SCENARIO(id)).toMatch(new RegExp(`/api/loans/${id}/insights/scenario$`));
      }),
      { numRuns: 100 }
    );
  });

  it('LOAN_RATE produces /api/loans/{id}/rate', () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(API_ENDPOINTS.LOAN_RATE(id)).toMatch(new RegExp(`/api/loans/${id}/rate$`));
      }),
      { numRuns: 100 }
    );
  });

  it('INVOICES_FOR_EXPENSE produces /api/invoices/{expenseId}', () => {
    fc.assert(
      fc.property(idArb, (expenseId) => {
        expect(API_ENDPOINTS.INVOICES_FOR_EXPENSE(expenseId)).toMatch(new RegExp(`/api/invoices/${expenseId}$`));
      }),
      { numRuns: 100 }
    );
  });

  it('PAYMENT_METHOD_BILLING_CYCLES produces /api/payment-methods/{id}/billing-cycles', () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLES(id)).toMatch(new RegExp(`/api/payment-methods/${id}/billing-cycles$`));
      }),
      { numRuns: 100 }
    );
  });
});
