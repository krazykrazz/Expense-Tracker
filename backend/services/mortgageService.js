/**
 * MortgageService - Handles mortgage-specific validation and calculations
 * 
 * This service provides validation for mortgage-specific fields and
 * calculations for equity, amortization schedules, and renewal status.
 */

const { periodicRate } = require('../utils/interestCalculation');

class MortgageService {
  /**
   * Valid rate types for mortgages
   */
  static RATE_TYPES = ['fixed', 'variable'];

  /**
   * Valid payment frequencies for mortgages
   */
  static PAYMENT_FREQUENCIES = ['monthly', 'bi-weekly', 'accelerated_bi-weekly'];

  /**
   * Validation bounds for mortgage fields
   */
  static VALIDATION_BOUNDS = {
    amortization_period: { min: 1, max: 40 },
    term_length: { min: 1, max: 10 }
  };

  /**
   * Validate mortgage-specific fields
   * @param {Object} mortgageData - Mortgage data to validate
   * @throws {Error} If validation fails with specific error message
   */
  validateMortgageFields(mortgageData) {
    // Validate amortization_period (required, 1-40 years)
    if (mortgageData.amortization_period === undefined || mortgageData.amortization_period === null) {
      throw new Error('Amortization period is required for mortgages');
    }
    if (typeof mortgageData.amortization_period !== 'number' || 
        !Number.isInteger(mortgageData.amortization_period) ||
        mortgageData.amortization_period < MortgageService.VALIDATION_BOUNDS.amortization_period.min ||
        mortgageData.amortization_period > MortgageService.VALIDATION_BOUNDS.amortization_period.max) {
      throw new Error('Amortization period must be between 1 and 40 years');
    }

    // Validate term_length (required, 1-10 years)
    if (mortgageData.term_length === undefined || mortgageData.term_length === null) {
      throw new Error('Term length is required for mortgages');
    }
    if (typeof mortgageData.term_length !== 'number' || 
        !Number.isInteger(mortgageData.term_length) ||
        mortgageData.term_length < MortgageService.VALIDATION_BOUNDS.term_length.min ||
        mortgageData.term_length > MortgageService.VALIDATION_BOUNDS.term_length.max) {
      throw new Error('Term length must be between 1 and 10 years');
    }

    // Validate term_length <= amortization_period
    if (mortgageData.term_length > mortgageData.amortization_period) {
      throw new Error('Term length cannot exceed amortization period');
    }

    // Validate renewal_date (required, future date, YYYY-MM-DD format)
    if (mortgageData.renewal_date === undefined || mortgageData.renewal_date === null || mortgageData.renewal_date === '') {
      throw new Error('Renewal date is required for mortgages');
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(mortgageData.renewal_date)) {
      throw new Error('Renewal date must be in YYYY-MM-DD format');
    }
    
    const renewalDate = new Date(mortgageData.renewal_date);
    if (isNaN(renewalDate.getTime())) {
      throw new Error('Renewal date must be in YYYY-MM-DD format');
    }
    
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (renewalDate <= todayUTC) {
      throw new Error('Renewal date must be in the future');
    }

    // Validate rate_type
    if (mortgageData.rate_type === undefined || mortgageData.rate_type === null || mortgageData.rate_type === '') {
      throw new Error('Rate type is required for mortgages');
    }
    if (!MortgageService.RATE_TYPES.includes(mortgageData.rate_type)) {
      throw new Error("Rate type must be 'fixed' or 'variable'");
    }

    // Validate payment_frequency (required, must be valid option)
    if (mortgageData.payment_frequency === undefined || mortgageData.payment_frequency === null || mortgageData.payment_frequency === '') {
      throw new Error('Payment frequency is required for mortgages');
    }
    if (!MortgageService.PAYMENT_FREQUENCIES.includes(mortgageData.payment_frequency)) {
      throw new Error("Payment frequency must be 'monthly', 'bi-weekly', or 'accelerated_bi-weekly'");
    }

    // Validate estimated_property_value (optional, but if provided must be > 0)
    if (mortgageData.estimated_property_value !== undefined && 
        mortgageData.estimated_property_value !== null) {
      if (typeof mortgageData.estimated_property_value !== 'number' ||
          mortgageData.estimated_property_value <= 0) {
        throw new Error('Estimated property value must be greater than zero');
      }
    }

    return true;
  }

  /**
   * Check if a loan type is a mortgage
   * @param {string} loanType - The loan type to check
   * @returns {boolean} True if the loan type is 'mortgage'
   */
  isMortgage(loanType) {
    return loanType === 'mortgage';
  }

  /**
   * Calculate equity for a mortgage
   * @param {number} estimatedPropertyValue - Current property value estimate
   * @param {number} remainingBalance - Current mortgage balance
   * @returns {Object} { equityAmount, equityPercentage } or null if property value is zero/invalid
   */
  calculateEquity(estimatedPropertyValue, remainingBalance) {
    // Handle edge case: zero or invalid property value
    if (!estimatedPropertyValue || estimatedPropertyValue <= 0) {
      return null;
    }

    // Handle edge case: negative balance (treat as zero)
    const balance = remainingBalance < 0 ? 0 : remainingBalance;

    const equityAmount = estimatedPropertyValue - balance;
    const equityPercentage = (equityAmount / estimatedPropertyValue) * 100;

    return {
      equityAmount,
      equityPercentage
    };
  }

  /**
   * Get the number of payments per year based on payment frequency
   * @param {string} paymentFrequency - Payment frequency type
   * @returns {number} Number of payments per year
   */
  getPaymentsPerYear(paymentFrequency) {
    switch (paymentFrequency) {
      case 'monthly':
        return 12;
      case 'bi-weekly':
      case 'accelerated_bi-weekly':
        return 26;
      default:
        return 12;
    }
  }

  /**
   * Months of amortization left, counted from the mortgage start date.
   * @param {Object} loan - { amortization_period (years), start_date (YYYY-MM-DD) }
   * @param {Date} [asOf=new Date()] - Date to count to
   * @returns {number|null} Remaining months (at least 1), or null without an amortization period
   */
  getRemainingAmortizationMonths(loan, asOf = new Date()) {
    if (!loan || !loan.amortization_period || loan.amortization_period <= 0) {
      return null;
    }
    const totalMonths = loan.amortization_period * 12;
    if (!loan.start_date) {
      return totalMonths;
    }
    const [startYear, startMonth] = loan.start_date.split('-').map(Number);
    const elapsed = (asOf.getFullYear() - startYear) * 12 + (asOf.getMonth() + 1 - startMonth);
    return Math.max(1, totalMonths - Math.max(0, elapsed));
  }

  /**
   * Calculate payment amount based on frequency
   * @param {Object} params - { balance, rate, amortizationYears, paymentFrequency, rateType, remainingMonths }
   * @param {number} [params.remainingMonths] - Months left to amortize; overrides amortizationYears
   * @param {string} [params.rateType] - 'fixed' uses Canadian semi-annual compounding
   * @returns {number} Payment amount per period
   */
  calculatePaymentAmount(params) {
    const { balance, rate, amortizationYears, paymentFrequency, rateType = null, remainingMonths = null } = params;

    // Handle edge cases
    if (!balance || balance <= 0) return 0;
    const months = remainingMonths || (amortizationYears > 0 ? amortizationYears * 12 : 0);
    if (!months || months <= 0) return 0;

    // Accelerated bi-weekly is half the monthly payment, paid 26 times a year
    if (paymentFrequency === 'accelerated_bi-weekly') {
      return this.calculatePaymentAmount({ ...params, paymentFrequency: 'monthly', remainingMonths: months }) / 2;
    }

    const paymentsPerYear = this.getPaymentsPerYear(paymentFrequency);
    const totalPayments = Math.max(1, Math.round(months / 12 * paymentsPerYear));
    const r = periodicRate(rate, paymentsPerYear, rateType);

    if (r <= 0) {
      return balance / totalPayments;
    }

    // Standard mortgage payment formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    const compoundFactor = Math.pow(1 + r, totalPayments);
    return balance * (r * compoundFactor) / (compoundFactor - 1);
  }

  /**
   * Date of the next payment on or after today for a due day of the month
   * @param {number} dueDay - Day of month the payment is due (1-31)
   * @param {Date} [asOf=new Date()] - Reference date
   * @returns {Date} Local date of the next payment (day clamped to month length)
   */
  getNextPaymentDate(dueDay, asOf = new Date()) {
    const clamped = (year, month) => new Date(year, month, Math.min(dueDay, new Date(year, month + 1, 0).getDate()));
    const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    const candidate = clamped(today.getFullYear(), today.getMonth());
    return candidate >= today ? candidate : clamped(today.getFullYear(), today.getMonth() + 1);
  }

  /**
   * Generate amortization schedule
   * @param {Object} params - { balance, rate, amortizationYears, paymentFrequency, rateType, remainingMonths, firstPaymentDate }
   * @param {Date} [params.firstPaymentDate] - Date of the first scheduled payment (defaults to one period from today)
   * @returns {Array} Array of payment periods with principal/interest breakdown
   */
  generateAmortizationSchedule(params) {
    const { balance, rate, amortizationYears, paymentFrequency, rateType = null, remainingMonths = null, firstPaymentDate = null } = params;

    // Handle edge cases
    if (!balance || balance <= 0) return [];
    const months = remainingMonths || (amortizationYears > 0 ? amortizationYears * 12 : 0);
    if (!months || months <= 0) return [];

    const schedule = [];
    const paymentsPerYear = this.getPaymentsPerYear(paymentFrequency);
    const payment = this.calculatePaymentAmount(params);
    
    // Handle zero payment (shouldn't happen with valid inputs)
    if (payment <= 0) return [];

    let remainingBalance = balance;
    let cumulativePrincipal = 0;
    let cumulativeInterest = 0;
    
    const r = periodicRate(rate, paymentsPerYear, rateType);
    const isMonthly = paymentFrequency !== 'bi-weekly' && paymentFrequency !== 'accelerated_bi-weekly';

    let start = firstPaymentDate ? new Date(firstPaymentDate) : null;
    if (!start) {
      start = new Date();
      if (isMonthly) start.setMonth(start.getMonth() + 1);
      else start.setDate(start.getDate() + 14);
    }
    const dueDay = start.getDate();
    const dateForPeriod = (index) => {
      if (isMonthly) {
        const y = start.getFullYear();
        const m = start.getMonth() + index;
        return new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
      }
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index * 14);
    };
    const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    let period = 1;
    // Accelerated payments finish early; cap generously to avoid runaway loops
    const maxPeriods = Math.round(months / 12 * paymentsPerYear) + paymentsPerYear;

    while (remainingBalance > 0.01 && period <= maxPeriods) {
      const interest = remainingBalance * r;
      
      // For the last payment, principal is the remaining balance
      let principal = payment - interest;
      let actualPayment = payment;
      
      if (principal >= remainingBalance) {
        principal = remainingBalance;
        actualPayment = principal + interest;
      }

      cumulativePrincipal += principal;
      cumulativeInterest += interest;
      remainingBalance -= principal;

      // Ensure we don't go negative due to floating point
      if (remainingBalance < 0.01) {
        remainingBalance = 0;
      }

      schedule.push({
        period,
        date: toIso(dateForPeriod(period - 1)),
        payment: Math.round(actualPayment * 100) / 100,
        principal: Math.round(principal * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        remainingBalance: Math.round(remainingBalance * 100) / 100,
        cumulativePrincipal: Math.round(cumulativePrincipal * 100) / 100,
        cumulativeInterest: Math.round(cumulativeInterest * 100) / 100
      });

      period++;
    }

    return schedule;
  }

  /**
   * Check if renewal is approaching
   * @param {string} renewalDate - ISO date string (YYYY-MM-DD)
   * @returns {Object} { isApproaching, monthsUntilRenewal, isPastDue }
   */
  checkRenewalStatus(renewalDate) {
    if (!renewalDate) {
      return {
        isApproaching: false,
        monthsUntilRenewal: null,
        isPastDue: false
      };
    }

    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    
    const renewal = new Date(renewalDate);
    renewal.setUTCHours(0, 0, 0, 0);

    // Check if past due
    const isPastDue = renewal < todayUTC;

    // Calculate months until renewal
    const diffTime = renewal.getTime() - todayUTC.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    const monthsUntilRenewal = Math.round(diffDays / 30.44); // Average days per month

    // Is approaching if within 6 months and not past due
    const isApproaching = !isPastDue && monthsUntilRenewal <= 6 && monthsUntilRenewal >= 0;

    return {
      isApproaching,
      monthsUntilRenewal,
      isPastDue
    };
  }

  /**
   * Calculate principal vs interest paid from balance history
   * @param {number} loanId - Loan ID (for reference)
   * @param {Array} balanceHistory - Historical balance entries with { year, month, balance, interest_rate }
   * @returns {Object} { totalPrincipalPaid, totalInterestPaid, breakdown, estimatedPayoffDate }
   */
  calculatePaymentBreakdown(loanId, balanceHistory) {
    if (!balanceHistory || balanceHistory.length === 0) {
      return {
        totalPrincipalPaid: 0,
        totalInterestPaid: 0,
        breakdown: [],
        estimatedPayoffDate: null
      };
    }

    // Sort by year and month
    const sortedHistory = [...balanceHistory].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const breakdown = [];
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;

    for (let i = 1; i < sortedHistory.length; i++) {
      const prev = sortedHistory[i - 1];
      const curr = sortedHistory[i];

      // Calculate principal paid (balance decrease)
      const principalPaid = prev.balance - curr.balance;
      
      // Estimate interest paid based on average balance and rate
      // Using simple interest approximation for the period
      const avgBalance = (prev.balance + curr.balance) / 2;
      const monthlyRate = (prev.interest_rate || 0) / 100 / 12;
      const interestPaid = avgBalance * monthlyRate;

      totalPrincipalPaid += Math.max(0, principalPaid);
      totalInterestPaid += interestPaid;

      breakdown.push({
        year: curr.year,
        month: curr.month,
        principalPaid: Math.round(Math.max(0, principalPaid) * 100) / 100,
        interestPaid: Math.round(interestPaid * 100) / 100,
        balance: curr.balance,
        cumulativePrincipal: Math.round(totalPrincipalPaid * 100) / 100,
        cumulativeInterest: Math.round(totalInterestPaid * 100) / 100
      });
    }

    // Estimate payoff date based on current payment rate
    let estimatedPayoffDate = null;
    if (sortedHistory.length >= 2) {
      const lastEntry = sortedHistory[sortedHistory.length - 1];
      const avgMonthlyPrincipal = totalPrincipalPaid / (sortedHistory.length - 1);
      
      if (avgMonthlyPrincipal > 0 && lastEntry.balance > 0) {
        const monthsRemaining = Math.ceil(lastEntry.balance / avgMonthlyPrincipal);
        const payoffDate = new Date(lastEntry.year, lastEntry.month - 1 + monthsRemaining, 1);
        estimatedPayoffDate = payoffDate.toISOString().split('T')[0];
      }
    }

    return {
      totalPrincipalPaid: Math.round(totalPrincipalPaid * 100) / 100,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      breakdown,
      estimatedPayoffDate
    };
  }
}

module.exports = new MortgageService();
