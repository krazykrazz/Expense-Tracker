import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCAD } from './formatters';

describe('formatCurrency', () => {
  it.each([
    [1234.5, '$1,234.50'],
    [-72941.61, '-$72,941.61'],
    ['-12', '-$12.00'],
    [-0.001, '$0.00'],
    [0, '$0.00'],
    [null, '$0.00']
  ])('formats %s as %s', (amount, expected) => {
    expect(formatCurrency(amount)).toBe(expected);
  });

  it('puts the sign before the $ without locale formatting too', () => {
    expect(formatCurrency(-5, false)).toBe('-$5.00');
  });

  it('agrees with formatCAD on the sign position', () => {
    expect(formatCurrency(-5)).toBe(formatCAD(-5));
  });
});
