import { describe, it, expect } from 'vitest';
import { statementCloseDate, laterStatement, mayPostOnLaterStatement } from './statementCycle';

describe('mayPostOnLaterStatement', () => {
  it.each([
    ['2026-10-15', '2026-10-15'],
    ['2026-10-14', '2026-10-15'],
    ['2026-10-13', '2026-10-15']
  ])('a pending charge made %s may miss the statement closing %s', (date, statement) => {
    expect(mayPostOnLaterStatement(date, true, 15)).toEqual({ statement });
  });

  it('is nothing early in the cycle or the day after the close', () => {
    expect(mayPostOnLaterStatement('2026-10-12', true, 15)).toBeNull();
    expect(mayPostOnLaterStatement('2026-10-16', true, 15)).toBeNull();
  });

  it('is nothing once the bank has posted it, or without a close day', () => {
    expect(mayPostOnLaterStatement('2026-10-15', false, 15)).toBeNull();
    expect(mayPostOnLaterStatement('2026-10-15', true, null)).toBeNull();
  });

  it('works across month and year ends and short months', () => {
    expect(mayPostOnLaterStatement('2026-12-30', true, 1)).toEqual({ statement: '2027-01-01' });
    expect(mayPostOnLaterStatement('2026-02-27', true, 31)).toEqual({ statement: '2026-02-28' });
  });
});

describe('statementCloseDate', () => {
  it.each([
    // statement closes on the 15th: up to and including the 15th is this month's statement
    ['2026-10-01', 15, '2026-10-15'],
    ['2026-10-15', 15, '2026-10-15'],
    ['2026-10-16', 15, '2026-11-15'],
    ['2026-12-20', 15, '2027-01-15'],
    // close day 31 clamps to the month length
    ['2026-02-10', 31, '2026-02-28'],
    ['2028-02-29', 31, '2028-02-29'],
    ['2026-03-01', 31, '2026-03-31'],
    ['2026-04-30', 31, '2026-04-30'],
    ['2026-05-31', 31, '2026-05-31'],
    // close day 30 in February
    ['2026-02-28', 30, '2026-02-28'],
    ['2026-03-01', 30, '2026-03-30'],
    // closes on the 1st
    ['2026-10-01', 1, '2026-10-01'],
    ['2026-10-02', 1, '2026-11-01']
  ])('%s with the statement closing on day %i falls in the statement closing %s', (date, closeDay, expected) => {
    expect(statementCloseDate(date, closeDay)).toBe(expected);
  });

  it.each([[null], [undefined], [0], [32], [1.5], ['x']])('has no answer for a close day of %s', (closeDay) => {
    expect(statementCloseDate('2026-10-15', closeDay)).toBeNull();
  });

  it('has no answer without a date', () => {
    expect(statementCloseDate('', 15)).toBeNull();
    expect(statementCloseDate(null, 15)).toBeNull();
  });
});

describe('laterStatement', () => {
  const expense = (date, posted_date) => ({ date, posted_date });

  it('finds an expense made on the last day of the cycle and posted after it (the billing turnover case)', () => {
    expect(laterStatement(expense('2026-10-15', '2026-10-17'), 15)).toEqual({ madeStatement: '2026-10-15', postedStatement: '2026-11-15' });
  });

  it('is nothing when both dates fall in the same statement', () => {
    expect(laterStatement(expense('2026-10-10', '2026-10-12'), 15)).toBeNull();
    expect(laterStatement(expense('2026-10-16', '2026-10-18'), 15)).toBeNull();
  });

  it('is nothing without a posted date, or one that is not after the purchase', () => {
    expect(laterStatement(expense('2026-10-15', null), 15)).toBeNull();
    expect(laterStatement(expense('2026-10-15', '2026-10-15'), 15)).toBeNull();
    expect(laterStatement(expense('2026-10-15', '2026-10-14'), 15)).toBeNull();
  });

  it('is nothing for a card without a close day', () => {
    expect(laterStatement(expense('2026-10-15', '2026-10-17'), null)).toBeNull();
  });

  it('handles a year end', () => {
    expect(laterStatement(expense('2026-12-31', '2027-01-02'), 31)).toEqual({ madeStatement: '2026-12-31', postedStatement: '2027-01-31' });
  });
});
