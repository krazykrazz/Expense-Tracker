/**
 * Money helpers for amounts held as floating-point dollars (mirrors backend/utils/money.js).
 */

/** Whole cents, for exact comparisons (`toCents(0.1 + 0.2) === toCents(0.3)`). */
export const toCents = (amount) => Math.round(Number(amount) * 100);
