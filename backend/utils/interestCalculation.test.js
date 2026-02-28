const { calculateMonthlyInterest } = require('./interestCalculation');

describe('calculateMonthlyInterest', () => {
  describe('zero and invalid inputs', () => {
    it('should return 0 for zero balance', () => {
      expect(calculateMonthlyInterest(0, 5.25)).toBe(0);
    });

    it('should return 0 for zero rate', () => {
      expect(calculateMonthlyInterest(500000, 0)).toBe(0);
    });

    it('should return 0 for negative balance', () => {
      expect(calculateMonthlyInterest(-100000, 5.25)).toBe(0);
    });

    it('should return 0 for negative rate', () => {
      expect(calculateMonthlyInterest(500000, -3)).toBe(0);
    });

    it('should return 0 for undefined balance', () => {
      expect(calculateMonthlyInterest(undefined, 5.25)).toBe(0);
    });

    it('should return 0 for null balance', () => {
      expect(calculateMonthlyInterest(null, 5.25)).toBe(0);
    });

    it('should return 0 for undefined rate', () => {
      expect(calculateMonthlyInterest(500000, undefined)).toBe(0);
    });

    it('should return 0 for null rate', () => {
      expect(calculateMonthlyInterest(500000, null)).toBe(0);
    });
  });

  describe('typical mortgage values', () => {
    it('should calculate correctly for $500,000 at 5.25%', () => {
      // 500000 * (5.25 / 100) / 12 = 2187.50
      expect(calculateMonthlyInterest(500000, 5.25)).toBe(2187.5);
    });

    it('should calculate correctly for $300,000 at 3.5%', () => {
      // 300000 * (3.5 / 100) / 12 = 875.00
      expect(calculateMonthlyInterest(300000, 3.5)).toBe(875);
    });
  });

  describe('small balance', () => {
    it('should calculate correctly for $100 at 3%', () => {
      // 100 * (3 / 100) / 12 = 0.25
      expect(calculateMonthlyInterest(100, 3)).toBe(0.25);
    });
  });

  describe('very large balance', () => {
    it('should calculate correctly for $10,000,000 at 5%', () => {
      // 10000000 * (5 / 100) / 12 = 41666.666... → rounded to 41666.67
      expect(calculateMonthlyInterest(10000000, 5)).toBe(41666.67);
    });
  });
});
