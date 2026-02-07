const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const expensePeopleService = require('./expensePeopleService');
const logger = require('../config/logger');

class ExpenseTaxService {
  /**
   * Get tax-deductible summary for a specific year
   * @param {number} year - The year to get summary for
   * @returns {Promise<Object>} Tax-deductible summary object
   * @throws {Error} If year parameter is missing or invalid
   */
  async getTaxDeductibleSummary(year) {
    // Validate year parameter
    if (!year) {
      throw new Error('Year parameter is required');
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      throw new Error('Year must be a valid number');
    }

    // Call repository method to fetch expenses
    const expenses = await expenseRepository.getTaxDeductibleExpenses(yearNum);

    // Separate expenses into medical and donations arrays
    const medicalExpenses = expenses.filter(exp => exp.type === 'Tax - Medical');
    const donationExpenses = expenses.filter(exp => exp.type === 'Tax - Donation');

    // Calculate totals
    const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDeductible = medicalTotal + donationTotal;

    // Calculate insurance totals (Requirements 6.1, 6.2, 6.3, 6.4)
    const insuranceSummary = this.calculateInsuranceSummary(medicalExpenses);

    // Generate monthly breakdown by grouping expenses by month
    const monthlyBreakdown = [];
    for (let month = 1; month <= 12; month++) {
      const monthExpenses = expenses.filter(exp => {
        const expenseMonth = parseInt(exp.date.substring(5, 7));
        return expenseMonth === month;
      });

      const monthTotal = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      monthlyBreakdown.push({
        month: month,
        total: parseFloat(monthTotal.toFixed(2))
      });
    }

    // Return structured summary object matching the design interface
    return {
      year: yearNum,
      totalDeductible: parseFloat(totalDeductible.toFixed(2)),
      medicalTotal: parseFloat(medicalTotal.toFixed(2)),
      donationTotal: parseFloat(donationTotal.toFixed(2)),
      monthlyBreakdown: monthlyBreakdown,
      expenses: {
        medical: medicalExpenses,
        donations: donationExpenses
      },
      // Insurance summary (Requirements 6.1, 6.2, 6.3, 6.4)
      insuranceSummary: insuranceSummary
    };
  }

  /**
   * Get lightweight tax-deductible summary for YoY comparison
   * Returns only totals and counts, not full expense lists
   * @param {number} year - The year to get summary for
   * @returns {Promise<Object>} Lightweight summary object
   */
  async getTaxDeductibleYoYSummary(year) {
    // Validate year parameter
    if (!year) {
      throw new Error('Year parameter is required');
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      throw new Error('Year must be a valid number');
    }

    // Call repository method to fetch expenses
    const expenses = await expenseRepository.getTaxDeductibleExpenses(yearNum);

    // Separate expenses into medical and donations arrays
    const medicalExpenses = expenses.filter(exp => exp.type === 'Tax - Medical');
    const donationExpenses = expenses.filter(exp => exp.type === 'Tax - Donation');

    // Calculate totals
    const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDeductible = medicalTotal + donationTotal;

    // Return lightweight summary (no expense lists)
    return {
      year: yearNum,
      medicalTotal: parseFloat(medicalTotal.toFixed(2)),
      donationTotal: parseFloat(donationTotal.toFixed(2)),
      totalDeductible: parseFloat(totalDeductible.toFixed(2)),
      medicalCount: medicalExpenses.length,
      donationCount: donationExpenses.length
    };
  }

  /**
   * Calculate insurance summary from medical expenses
   * @param {Array} medicalExpenses - Array of medical expenses
   * @returns {Object} Insurance summary object
   * _Requirements: 6.1, 6.2, 6.3, 6.4_
   */
  calculateInsuranceSummary(medicalExpenses) {
    // Filter to insurance-eligible expenses
    const insuranceEligible = medicalExpenses.filter(exp => exp.insuranceEligible);

    // Calculate total original costs
    const totalOriginalCost = insuranceEligible.reduce((sum, exp) => {
      return sum + (exp.originalCost || exp.amount);
    }, 0);

    // Calculate total out-of-pocket amounts (the amount field represents out-of-pocket)
    const totalOutOfPocket = insuranceEligible.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate total reimbursements
    const totalReimbursement = insuranceEligible.reduce((sum, exp) => {
      return sum + (exp.reimbursement || 0);
    }, 0);

    // Group by claim status
    const byStatus = {
      not_claimed: { count: 0, originalCost: 0, outOfPocket: 0 },
      in_progress: { count: 0, originalCost: 0, outOfPocket: 0 },
      paid: { count: 0, originalCost: 0, outOfPocket: 0 },
      denied: { count: 0, originalCost: 0, outOfPocket: 0 }
    };

    insuranceEligible.forEach(exp => {
      const status = exp.claimStatus || 'not_claimed';
      if (byStatus[status]) {
        byStatus[status].count += 1;
        byStatus[status].originalCost += (exp.originalCost || exp.amount);
        byStatus[status].outOfPocket += exp.amount;
      }
    });

    // Round all values
    Object.keys(byStatus).forEach(status => {
      byStatus[status].originalCost = parseFloat(byStatus[status].originalCost.toFixed(2));
      byStatus[status].outOfPocket = parseFloat(byStatus[status].outOfPocket.toFixed(2));
    });

    return {
      totalOriginalCost: parseFloat(totalOriginalCost.toFixed(2)),
      totalOutOfPocket: parseFloat(totalOutOfPocket.toFixed(2)),
      totalReimbursement: parseFloat(totalReimbursement.toFixed(2)),
      eligibleCount: insuranceEligible.length,
      byStatus: byStatus
    };
  }

  /**
   * Get tax-deductible summary with people grouping for a specific year
   * @param {number} year - Year
   * @returns {Promise<Object>} Tax-deductible summary object with people grouping
   */
  async getTaxDeductibleWithPeople(year) {
    // Validate year parameter
    if (!year) {
      throw new Error('Year parameter is required');
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      throw new Error('Year must be a valid number');
    }

    // Get all tax-deductible expenses for the year
    const expenses = await expenseRepository.getTaxDeductibleExpenses(yearNum);

    // Get people associations for all expenses
    const expensesWithPeople = await Promise.all(
      expenses.map(async (expense) => {
        const people = await expensePeopleRepository.getPeopleForExpense(expense.id);
        return {
          ...expense,
          people: people
        };
      })
    );

    // Group expenses by person
    const groupedByPerson = expensePeopleService.groupExpensesByPerson(expensesWithPeople);

    // Calculate person totals
    const personTotals = expensePeopleService.calculatePersonTotals(expensesWithPeople);

    // Handle unassigned expenses
    const unassignedExpenses = expensePeopleService.handleUnassignedExpenses(expensesWithPeople);

    // Calculate overall totals
    const medicalExpenses = expensesWithPeople.filter(exp => exp.type === 'Tax - Medical');
    const donationExpenses = expensesWithPeople.filter(exp => exp.type === 'Tax - Donation');
    const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDeductible = medicalTotal + donationTotal;

    return {
      year: yearNum,
      totalDeductible: parseFloat(totalDeductible.toFixed(2)),
      medicalTotal: parseFloat(medicalTotal.toFixed(2)),
      donationTotal: parseFloat(donationTotal.toFixed(2)),
      groupedByPerson,
      personTotals,
      unassignedExpenses,
      expenses: {
        medical: medicalExpenses,
        donations: donationExpenses
      }
    };
  }
}

module.exports = new ExpenseTaxService();
