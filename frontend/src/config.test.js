import { describe, it, expect } from 'vitest';
import { API_ENDPOINTS } from './config.js';

describe('Config Endpoint Cleanup - Alias absence and canonical presence', () => {
  const removedAliases = [
    'MORTGAGE_INSIGHTS',
    'MORTGAGE_PAYMENTS',
    'MORTGAGE_PAYMENT',
    'MORTGAGE_SCENARIO',
    'MORTGAGE_RATE',
    'INVOICE_BY_EXPENSE',
    'PAYMENT_METHOD_BILLING_CYCLE_CREATE',
  ];

  const canonicalNames = [
    'LOAN_INSIGHTS',
    'LOAN_PAYMENTS',
    'LOAN_PAYMENT',
    'LOAN_SCENARIO',
    'LOAN_RATE',
    'INVOICES_FOR_EXPENSE',
    'PAYMENT_METHOD_BILLING_CYCLES',
  ];

  it.each(removedAliases)('API_ENDPOINTS should NOT have key %s', (alias) => {
    expect(API_ENDPOINTS).not.toHaveProperty(alias);
  });

  it.each(canonicalNames)('API_ENDPOINTS should have key %s', (name) => {
    expect(API_ENDPOINTS).toHaveProperty(name);
    expect(typeof API_ENDPOINTS[name]).toBe('function');
  });
});
