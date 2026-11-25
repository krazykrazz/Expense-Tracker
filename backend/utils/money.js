/**
 * Money helpers for amounts stored as floating-point dollars: compare in whole cents, store rounded to the cent.
 */

/** Whole cents, for exact comparisons (`toCents(0.1 + 0.2) === toCents(0.3)`). */
const toCents = (amount) => Math.round(Number(amount) * 100);

/** Rounded to the cent, for amounts that are stored or shown. */
const round2 = (amount) => Math.round(Number(amount) * 100) / 100;

/** Whether an amount entered in dollars has at most two decimals (12.5 and 12.50 yes, 12.505 no). */
const hasAtMostTwoDecimals = (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;

module.exports = { toCents, round2, hasAtMostTwoDecimals };
