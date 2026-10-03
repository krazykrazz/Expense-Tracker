/** Months since year 0, so year/month pairs can be compared and shifted arithmetically. */
export const toMonthIndex = (year, month) => year * 12 + (month - 1);

export const fromMonthIndex = (idx) => ({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });

export const shiftMonth = (year, month, delta) => fromMonthIndex(toMonthIndex(year, month) + delta);
