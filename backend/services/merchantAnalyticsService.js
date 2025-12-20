const expenseRepository = require('../repositories/expenseRepository');
const logger = require('../config/logger');

class MerchantAnalyticsService {
  /**
   * Calculate date range based on period filter
   * @param {string} period - 'all', 'year', 'month', '3months'
   * @param {number} year - Current year (optional)
   * @param {number} month - Current month (optional)
   * @returns {Object} Date filter object
   */
  calculateDateFilter(period, year = null, month = null) {
    const now = new Date();
    const currentYear = year || now.getFullYear();
    const currentMonth = month || (now.getMonth() + 1);

    switch (period) {
      case 'all':
        return {};
      
      case 'year':
        return {
          startDate: `${currentYear}-01-01`,
          endDate: `${currentYear}-12-31`
        };
      
      case 'month':
        const lastDay = new Date(currentYear, currentMonth, 0).getDate();
        return {
          startDate: `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`,
          endDate: `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`
        };
      
      case '3months':
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return {
          startDate: threeMonthsAgo.toISOString().split('T')[0],
          endDate: now.toISOString().split('T')[0]
        };
      
      default:
        logger.warn('Unknown period filter:', period);
        return {};
    }
  }

  /**
   * Get top merchants by total spending with sorting options
   * @param {Object} filters - { period: 'all'|'year'|'month'|'3months', year?, month? }
   * @param {string} sortBy - 'total'|'visits'|'average'
   * @returns {Promise<Array<MerchantSummary>>}
   */
  async getTopMerchants(filters = {}, sortBy = 'total') {
    try {
      // Reduced logging verbosity for cleaner test output
      
      const dateFilter = this.calculateDateFilter(filters.period || 'year', filters.year, filters.month);
      const includeFixedExpenses = filters.includeFixedExpenses || false;
      const merchants = await expenseRepository.getMerchantAnalytics(dateFilter, includeFixedExpenses);
      
      // Calculate total spending across all merchants for percentage calculation
      const totalSpending = merchants.reduce((sum, merchant) => sum + merchant.totalSpend, 0);
      
      // Add percentage and sort based on sortBy parameter
      const enrichedMerchants = merchants.map(merchant => ({
        ...merchant,
        percentOfTotal: totalSpending > 0 ? parseFloat(((merchant.totalSpend / totalSpending) * 100).toFixed(2)) : 0
      }));

      // Sort based on sortBy parameter
      switch (sortBy) {
        case 'visits':
          enrichedMerchants.sort((a, b) => b.visitCount - a.visitCount);
          break;
        case 'average':
          enrichedMerchants.sort((a, b) => b.averageSpend - a.averageSpend);
          break;
        case 'total':
        default:
          enrichedMerchants.sort((a, b) => b.totalSpend - a.totalSpend);
          break;
      }

      // Debug logging removed for cleaner test output
      return enrichedMerchants;
    } catch (error) {
      logger.error('Error getting top merchants:', error);
      throw error;
    }
  }

  /**
   * Get detailed statistics for a specific merchant
   * @param {string} merchantName - The merchant/place name
   * @param {Object} filters - Time period filters
   * @returns {Promise<MerchantDetail>}
   */
  async getMerchantDetails(merchantName, filters = {}) {
    try {
      // Reduced logging verbosity for cleaner test output
      
      const dateFilter = this.calculateDateFilter(filters.period || 'year', filters.year, filters.month);
      const includeFixedExpenses = filters.includeFixedExpenses || false;
      
      // Get basic merchant analytics
      const allMerchants = await expenseRepository.getMerchantAnalytics(dateFilter, includeFixedExpenses);
      const merchant = allMerchants.find(m => m.name.toLowerCase() === merchantName.toLowerCase());
      
      if (!merchant) {
        logger.warn('Merchant not found:', merchantName);
        return null;
      }

      // Get all expenses for this merchant to calculate detailed breakdowns
      const expenses = await expenseRepository.getMerchantExpenses(merchantName, dateFilter, includeFixedExpenses);
      
      // Calculate total spending for percentage
      const totalSpending = allMerchants.reduce((sum, m) => sum + m.totalSpend, 0);
      
      // Calculate category breakdown
      const categoryMap = {};
      expenses.forEach(expense => {
        if (!categoryMap[expense.type]) {
          categoryMap[expense.type] = { amount: 0, count: 0 };
        }
        categoryMap[expense.type].amount += expense.amount;
        categoryMap[expense.type].count += 1;
      });

      const categoryBreakdown = Object.entries(categoryMap).map(([category, data]) => ({
        category,
        amount: parseFloat(data.amount.toFixed(2)),
        count: data.count,
        percentage: parseFloat(((data.amount / merchant.totalSpend) * 100).toFixed(2))
      })).sort((a, b) => b.amount - a.amount);

      // Calculate payment method breakdown
      const methodMap = {};
      expenses.forEach(expense => {
        if (!methodMap[expense.method]) {
          methodMap[expense.method] = { amount: 0, count: 0 };
        }
        methodMap[expense.method].amount += expense.amount;
        methodMap[expense.method].count += 1;
      });

      const paymentMethodBreakdown = Object.entries(methodMap).map(([method, data]) => ({
        method,
        amount: parseFloat(data.amount.toFixed(2)),
        count: data.count
      })).sort((a, b) => b.amount - a.amount);

      // Calculate average days between visits
      let avgDaysBetweenVisits = null;
      if (merchant.visitCount > 1) {
        const firstDate = new Date(merchant.firstVisit);
        const lastDate = new Date(merchant.lastVisit);
        const daysDiff = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));
        avgDaysBetweenVisits = parseFloat((daysDiff / (merchant.visitCount - 1)).toFixed(1));
      }

      // Find primary category and payment method (by count - most frequent)
      const primaryCategory = categoryBreakdown.length > 0 ? 
        categoryBreakdown.sort((a, b) => b.count - a.count)[0].category : null;
      const primaryPaymentMethod = paymentMethodBreakdown.length > 0 ? 
        paymentMethodBreakdown.sort((a, b) => b.count - a.count)[0].method : null;

      const result = {
        name: merchant.name,
        totalSpend: merchant.totalSpend,
        visitCount: merchant.visitCount,
        averageSpend: merchant.averageSpend,
        percentOfTotal: totalSpending > 0 ? parseFloat(((merchant.totalSpend / totalSpending) * 100).toFixed(2)) : 0,
        firstVisit: merchant.firstVisit,
        lastVisit: merchant.lastVisit,
        avgDaysBetweenVisits,
        primaryCategory,
        primaryPaymentMethod,
        categoryBreakdown,
        paymentMethodBreakdown
      };

      // Debug logging removed for cleaner test output
      return result;
    } catch (error) {
      logger.error('Error getting merchant details:', error);
      throw error;
    }
  }

  /**
   * Get monthly spending trend for a merchant with gap filling
   * @param {string} merchantName - The merchant/place name
   * @param {number} months - Number of months to include (default 12)
   * @returns {Promise<Array<MonthlyTrend>>}
   */
  async getMerchantTrend(merchantName, months = 12, includeFixedExpenses = false) {
    try {
      // Reduced logging verbosity for cleaner test output
      
      const trendData = await expenseRepository.getMerchantTrend(merchantName, months, includeFixedExpenses);
      
      // Generate complete month range for gap filling
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months + 1);
      startDate.setDate(1); // Start from first day of month
      
      const completeMonths = [];
      const current = new Date(startDate);
      
      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Find existing data for this month
        const existingData = trendData.find(d => d.year === year && d.month === month);
        
        completeMonths.push({
          year,
          month,
          monthName: `${monthNames[month - 1]} ${year}`,
          amount: existingData ? existingData.amount : 0,
          visitCount: existingData ? existingData.visitCount : 0,
          changePercent: null // Will be calculated below
        });
        
        current.setMonth(current.getMonth() + 1);
      }
      
      // Calculate month-over-month change percentages
      for (let i = 1; i < completeMonths.length; i++) {
        const current = completeMonths[i];
        const previous = completeMonths[i - 1];
        
        if (previous.amount > 0) {
          current.changePercent = parseFloat((((current.amount - previous.amount) / previous.amount) * 100).toFixed(2));
        } else if (current.amount > 0) {
          current.changePercent = 100; // 100% increase from zero
        } else {
          current.changePercent = 0; // Both are zero
        }
      }

      // Debug logging removed for cleaner test output
      return completeMonths;
    } catch (error) {
      logger.error('Error getting merchant trend:', error);
      throw error;
    }
  }

  /**
   * Get all expenses for a specific merchant
   * @param {string} merchantName - The merchant/place name
   * @param {Object} filters - Time period filters
   * @returns {Promise<Array<Expense>>}
   */
  async getMerchantExpenses(merchantName, filters = {}) {
    try {
      // Reduced logging verbosity for cleaner test output
      
      const dateFilter = this.calculateDateFilter(filters.period || 'year', filters.year, filters.month);
      const includeFixedExpenses = filters.includeFixedExpenses || false;
      const expenses = await expenseRepository.getMerchantExpenses(merchantName, dateFilter, includeFixedExpenses);
      
      // Debug logging removed for cleaner test output
      return expenses;
    } catch (error) {
      logger.error('Error getting merchant expenses:', error);
      throw error;
    }
  }
}

module.exports = new MerchantAnalyticsService();