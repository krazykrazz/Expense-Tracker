/**
 * MortgageInsightsService - Provides mortgage financial insights and projections
 * 
 * This service calculates interest breakdowns, payoff projections, and
 * what-if scenarios for mortgage analysis.
 */

const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const mortgageService = require('./mortgageService');
const balanceCalculationService = require('./balanceCalculationService');
const { calculateMonthlyInterest, periodicRate } = require('../utils/interestCalculation');
const logger = require('../config/logger');

class MortgageInsightsService {
  /**
   * Average days per month for calculations
   */
  static DAYS_PER_MONTH = 30.44;

  /**
   * Days per year for interest calculations
   */
  static DAYS_PER_YEAR = 365;

  /**
   * Calculate interest breakdown based on current balance and rate
   * @param {number} balance - Current mortgage balance
   * @param {number} annualRate - Annual interest rate (percentage, e.g., 5.5 for 5.5%)
   * @returns {Object} { daily, weekly, monthly, annual, balance, rate }
   */
  calculateInterestBreakdown(balance, annualRate) {
    // Handle edge cases: zero or invalid balance
    if (!balance || balance <= 0 || !isFinite(balance)) {
      return {
        daily: 0,
        weekly: 0,
        monthly: 0,
        annual: 0,
        balance: 0,
        rate: annualRate || 0
      };
    }

    // Handle edge case: zero or invalid rate
    if (!annualRate || annualRate <= 0 || !isFinite(annualRate)) {
      return {
        daily: 0,
        weekly: 0,
        monthly: 0,
        annual: 0,
        balance: balance,
        rate: 0
      };
    }

    // Calculate daily interest: balance × (rate/100) / 365
    const daily = balance * (annualRate / 100) / MortgageInsightsService.DAYS_PER_YEAR;
    
    // Calculate weekly interest: daily × 7
    const weekly = daily * 7;
    
    // Calculate monthly interest using shared canonical formula: balance × (rate/100) / 12
    const monthly = calculateMonthlyInterest(balance, annualRate);
    
    // Calculate annual interest: balance × (rate/100)
    const annual = balance * (annualRate / 100);

    return {
      daily: Math.round(daily * 100) / 100,
      weekly: Math.round(weekly * 100) / 100,
      monthly,
      annual: Math.round(annual * 100) / 100,
      balance: balance,
      rate: annualRate
    };
  }

  /**
   * Project payoff date based on payment amount
   * Uses iterative calculation to determine months until balance reaches zero
   * @param {Object} params - { balance, rate, paymentAmount, rateType }
   * @param {number} params.balance - Current mortgage balance
   * @param {number} params.rate - Annual interest rate (percentage)
   * @param {number} params.paymentAmount - Payment amount per period
   * @param {string} [params.rateType] - 'fixed' uses Canadian semi-annual compounding
   * @returns {Object} { payoffDate, totalMonths, totalInterest, totalPaid, isUnderpayment }
   */
  projectPayoff(params) {
    const { balance, rate, paymentAmount, rateType = null } = params;

    // Handle edge cases: invalid inputs
    if (!balance || balance <= 0 || !isFinite(balance)) {
      return {
        payoffDate: new Date().toISOString().split('T')[0],
        totalMonths: 0,
        totalInterest: 0,
        totalPaid: 0,
        isUnderpayment: false
      };
    }

    if (!paymentAmount || paymentAmount <= 0 || !isFinite(paymentAmount)) {
      return {
        payoffDate: null,
        totalMonths: null,
        totalInterest: null,
        totalPaid: null,
        isUnderpayment: true
      };
    }

    // Handle zero rate - simple division
    if (!rate || rate <= 0) {
      const totalMonths = Math.ceil(balance / paymentAmount);
      const payoffDate = new Date();
      payoffDate.setMonth(payoffDate.getMonth() + totalMonths);
      
      return {
        payoffDate: payoffDate.toISOString().split('T')[0],
        totalMonths,
        totalInterest: 0,
        totalPaid: Math.round(balance * 100) / 100,
        isUnderpayment: false
      };
    }

    // Payments are monthly amounts (the linked fixed expense), so the projection steps monthly
    const monthlyRate = periodicRate(rate, 12, rateType);
    
    // Check for underpayment: payment must cover at least the interest
    const firstMonthInterest = balance * monthlyRate;
    if (paymentAmount <= firstMonthInterest) {
      return {
        payoffDate: null,
        totalMonths: null,
        totalInterest: null,
        totalPaid: null,
        isUnderpayment: true
      };
    }

    // Iteratively calculate months until balance reaches zero
    let remainingBalance = balance;
    let totalInterest = 0;
    let totalPaid = 0;
    let months = 0;
    const maxMonths = 600; // 50 years max to prevent infinite loops

    while (remainingBalance > 0.01 && months < maxMonths) {
      // Calculate interest for this month
      const monthInterest = remainingBalance * monthlyRate;
      totalInterest += monthInterest;

      // Calculate principal portion
      let payment = paymentAmount;
      let principal = payment - monthInterest;

      // Handle final payment
      if (principal >= remainingBalance) {
        principal = remainingBalance;
        payment = principal + monthInterest;
      }

      totalPaid += payment;
      remainingBalance -= principal;
      months++;
    }

    // Calculate payoff date
    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + months);

    return {
      payoffDate: payoffDate.toISOString().split('T')[0],
      totalMonths: months,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      isUnderpayment: false
    };
  }

  /**
   * Compare two payment scenarios (current payment vs minimum payment)
   * @param {Object} params - { balance, rate, currentPayment, minimumPayment, rateType }
   * @param {number} params.balance - Current mortgage balance
   * @param {number} params.rate - Annual interest rate (percentage)
   * @param {number} params.currentPayment - Current payment amount
   * @param {number} params.minimumPayment - Minimum required payment amount
   * @param {string} [params.rateType] - 'fixed' uses Canadian semi-annual compounding
   * @returns {Object} { currentScenario, minimumScenario, comparison, isUnderpayment }
   */
  comparePaymentScenarios(params) {
    const { balance, rate, currentPayment, minimumPayment, rateType = null } = params;

    // Calculate current payment scenario
    const currentScenario = this.projectPayoff({
      balance,
      rate,
      paymentAmount: currentPayment,
      rateType
    });

    // Calculate minimum payment scenario
    const minimumScenario = this.projectPayoff({
      balance,
      rate,
      paymentAmount: minimumPayment,
      rateType
    });

    // Check for underpayment condition
    const isUnderpayment = currentPayment < minimumPayment;

    // Calculate comparison metrics
    let comparison = {
      monthsSaved: 0,
      interestSaved: 0,
      payoffDateDifference: 0
    };

    // Only calculate savings if both scenarios are valid (not underpayment)
    if (!currentScenario.isUnderpayment && !minimumScenario.isUnderpayment) {
      comparison.monthsSaved = minimumScenario.totalMonths - currentScenario.totalMonths;
      comparison.interestSaved = Math.round((minimumScenario.totalInterest - currentScenario.totalInterest) * 100) / 100;
      
      // Calculate days difference between payoff dates
      if (currentScenario.payoffDate && minimumScenario.payoffDate) {
        const currentDate = new Date(currentScenario.payoffDate);
        const minimumDate = new Date(minimumScenario.payoffDate);
        comparison.payoffDateDifference = Math.round((minimumDate - currentDate) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      currentScenario: {
        ...currentScenario,
        paymentAmount: currentPayment
      },
      minimumScenario: {
        ...minimumScenario,
        paymentAmount: minimumPayment
      },
      comparison,
      isUnderpayment
    };
  }

  /**
   * Calculate what-if scenario for extra payment
   * @param {Object} params - { balance, rate, currentPayment, extraPayment, rateType }
   * @param {number} params.balance - Current mortgage balance
   * @param {number} params.rate - Annual interest rate (percentage)
   * @param {number} params.currentPayment - Current payment amount
   * @param {number} params.extraPayment - Extra payment amount to add
   * @param {string} [params.rateType] - 'fixed' uses Canadian semi-annual compounding
   * @returns {Object} { newPayoffDate, monthsSaved, interestSaved, newTotalInterest, originalTotalInterest, extraPayment, newPayment }
   */
  calculateExtraPaymentScenario(params) {
    const { balance, rate, currentPayment, extraPayment, rateType = null } = params;

    // Validate extra payment
    if (!extraPayment || extraPayment <= 0 || !isFinite(extraPayment)) {
      // Return current scenario with no changes
      const currentScenario = this.projectPayoff({
        balance,
        rate,
        paymentAmount: currentPayment,
        rateType
      });

      return {
        newPayoffDate: currentScenario.payoffDate,
        monthsSaved: 0,
        interestSaved: 0,
        newTotalInterest: currentScenario.totalInterest,
        originalTotalInterest: currentScenario.totalInterest,
        extraPayment: 0,
        newPayment: currentPayment
      };
    }

    // Calculate current scenario (without extra payment)
    const currentScenario = this.projectPayoff({
      balance,
      rate,
      paymentAmount: currentPayment,
      rateType
    });

    // Calculate new scenario (with extra payment)
    const newPayment = currentPayment + extraPayment;
    const newScenario = this.projectPayoff({
      balance,
      rate,
      paymentAmount: newPayment,
      rateType
    });

    // Handle underpayment scenarios
    if (currentScenario.isUnderpayment || newScenario.isUnderpayment) {
      return {
        newPayoffDate: newScenario.payoffDate,
        monthsSaved: null,
        interestSaved: null,
        newTotalInterest: newScenario.totalInterest,
        originalTotalInterest: currentScenario.totalInterest,
        extraPayment,
        newPayment,
        isUnderpayment: currentScenario.isUnderpayment
      };
    }

    // Calculate savings
    const monthsSaved = currentScenario.totalMonths - newScenario.totalMonths;
    const interestSaved = Math.round((currentScenario.totalInterest - newScenario.totalInterest) * 100) / 100;

    return {
      newPayoffDate: newScenario.payoffDate,
      monthsSaved,
      interestSaved,
      newTotalInterest: newScenario.totalInterest,
      originalTotalInterest: currentScenario.totalInterest,
      extraPayment,
      newPayment
    };
  }

  /**
   * The linked fixed expense amount in effect now: the latest month up to the current one
   * (fixed expenses for future months are planned, not paid yet).
   * @param {number} mortgageId - Mortgage loan ID
   * @param {Date} [asOf=new Date()] - Reference date
   * @returns {Promise<Object|null>} Fixed expense row or null
   */
  async getCurrentLinkedPayment(mortgageId, asOf = new Date()) {
    const linkedExpenses = await fixedExpenseRepository.getFixedExpensesByLoanId(mortgageId);
    const nowIndex = asOf.getFullYear() * 12 + asOf.getMonth();
    const current = (linkedExpenses || []).find(e => e.year * 12 + (e.month - 1) <= nowIndex);
    return current || (linkedExpenses && linkedExpenses.length > 0 ? linkedExpenses[linkedExpenses.length - 1] : null);
  }

  /**
   * Get all insights for a mortgage
   * Aggregates all insight calculations into a single response
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<Object>} Complete insights object
   */
  async getMortgageInsights(mortgageId) {
    // Validate mortgage ID
    if (!mortgageId) {
      throw new Error('Mortgage ID is required');
    }

    // Fetch mortgage data
    const mortgage = await loanRepository.findById(mortgageId);
    if (!mortgage) {
      throw new Error('Mortgage not found');
    }

    if (mortgage.loan_type !== 'mortgage') {
      throw new Error('Insights are only available for mortgages');
    }

    // Current balance from the interest-aware engine; rate from the latest snapshot
    const balanceHistory = await loanBalanceRepository.findByLoan(mortgageId);
    const currentBalanceEntry = balanceHistory.length > 0 ? balanceHistory[0] : null;
    const calc = await balanceCalculationService.calculateBalance(mortgageId);
    const balance = calc.currentBalance;
    const rate = currentBalanceEntry ? currentBalanceEntry.rate : (mortgage.fixed_interest_rate || 0);
    const rateType = mortgage.rate_type || 'fixed';

    // Minimum payment amortizes the balance over the months left in the amortization period
    const remainingMonths = mortgageService.getRemainingAmortizationMonths(mortgage);
    const minimumPayment = mortgageService.calculatePaymentAmount({
      balance,
      rate,
      amortizationYears: mortgage.amortization_period || 25,
      remainingMonths,
      paymentFrequency: 'monthly',
      rateType
    });

    // The linked fixed expense (latest month up to the current one) is the actual payment
    const linkedExpense = await this.getCurrentLinkedPayment(mortgageId);
    let currentPayment;
    let paymentSource;
    if (linkedExpense) {
      currentPayment = linkedExpense.amount;
      paymentSource = 'linked_fixed_expense';
    } else {
      currentPayment = minimumPayment;
      paymentSource = 'calculated';
    }

    // Calculate interest breakdown
    const interestBreakdown = this.calculateInterestBreakdown(balance, rate);

    // Calculate projections (only if we have balance data)
    let projections = null;
    if (balance > 0 && rate > 0) {
      projections = this.comparePaymentScenarios({
        balance,
        rate,
        currentPayment,
        minimumPayment,
        rateType
      });
    }

    // Build data status
    const dataStatus = {
      hasBalanceData: balanceHistory.length > 0,
      hasPaymentData: linkedExpense !== null,
      paymentSource,
      lastUpdated: currentBalanceEntry 
        ? `${currentBalanceEntry.year}-${String(currentBalanceEntry.month).padStart(2, '0')}`
        : null
    };

    logger.debug('Generated mortgage insights:', { mortgageId, balance, rate, currentPayment, paymentSource });

    return {
      mortgageId,
      currentStatus: {
        balance,
        rate,
        rateType,
        currentPayment,
        minimumPayment: Math.round(minimumPayment * 100) / 100,
        remainingAmortizationMonths: remainingMonths,
        paymentSource,
        interestBreakdown
      },
      projections,
      dataStatus
    };
  }
}

module.exports = new MortgageInsightsService();
