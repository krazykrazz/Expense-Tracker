import styles from './MortgageKpiStrip.module.css';
import { formatCurrency } from '../../utils/formatters';

/**
 * Calculate next payment date from day-of-month.
 * @param {number} dueDay - Day of month (1-31)
 * @returns {Date}
 */
function calculateNextPaymentDate(dueDay) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const candidate = new Date(year, month, dueDay);
  if (candidate < now) {
    return new Date(year, month + 1, dueDay);
  }
  return candidate;
}

/**
 * Classify urgency of a payment date.
 * @param {Date} date
 * @returns {'urgent'|'warning'|null}
 */
function classifyPaymentUrgency(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'urgent';
  if (diffDays <= 3) return 'warning';
  return null;
}

/**
 * MortgageKpiStrip — compact always-visible strip of 7 key mortgage metrics.
 *
 * Props:
 * @param {Object} loanData - Full loan object
 * @param {Object|null} calculatedBalanceData - From getCalculatedBalance
 * @param {Object|null} insights - Mortgage_Insights_Data from getMortgageInsights
 * @param {boolean} insightsLoading - Whether insights are still loading
 * @param {number|null} paymentDueDay - Day of month from linked fixed expenses
 */
function MortgageKpiStrip({ loanData, calculatedBalanceData, insights, insightsLoading, paymentDueDay }) {
  // 1. Current Balance
  const rawBalance = calculatedBalanceData?.currentBalance ?? loanData?.initial_balance ?? null;
  const currentBalanceDisplay = rawBalance != null ? '$' + formatCurrency(rawBalance) : '\u2014';

  // 2. Interest Rate
  const rateDisplay = loanData?.currentRate != null ? loanData.currentRate + '%' : '\u2014';
  const rateType = loanData?.rate_type;
  const rateBadgeLabel = rateType === 'variable' ? 'Variable' : rateType === 'fixed' ? 'Fixed' : null;

  // 3. Daily Interest (insight-dependent)
  const dailyInterestRaw = (!insightsLoading && insights)
    ? insights?.currentStatus?.interestBreakdown?.daily
    : null;
  const dailyInterestDisplay = dailyInterestRaw != null
    ? '$' + formatCurrency(dailyInterestRaw)
    : '\u2014';

  // 4. Monthly Payment (insight-dependent)
  const monthlyPaymentRaw = (!insightsLoading && insights)
    ? insights?.currentStatus?.currentPayment
    : null;
  const monthlyPaymentDisplay = monthlyPaymentRaw != null
    ? '$' + formatCurrency(monthlyPaymentRaw)
    : '\u2014';
  const paymentSource = (!insightsLoading && insights)
    ? (insights?.currentStatus?.paymentSource || null)
    : null;

  // 5. Next Payment Date
  let nextPaymentDisplay = '\u2014';
  let urgencyClass = null;
  if (paymentDueDay != null) {
    const nextDate = calculateNextPaymentDate(paymentDueDay);
    urgencyClass = classifyPaymentUrgency(nextDate);
    nextPaymentDisplay = nextDate.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // 6. Equity %
  const propertyValue = loanData?.estimated_property_value;
  const balanceForEquity = calculatedBalanceData?.currentBalance ?? loanData?.initial_balance;
  let equityDisplay = '\u2014';
  if (propertyValue && propertyValue > 0 && balanceForEquity != null) {
    const equityPct = ((propertyValue - balanceForEquity) / propertyValue) * 100;
    equityDisplay = equityPct.toFixed(1) + '%';
  }

  // 7. Payoff Date (insight-dependent)
  let payoffDisplay = '\u2014';
  if (!insightsLoading && insights) {
    const payoffDate = insights?.projections?.currentScenario?.payoffDate;
    if (payoffDate) {
      payoffDisplay = new Date(payoffDate + 'T00:00:00').toLocaleDateString('en-CA', {
        month: 'short',
        year: 'numeric'
      });
    }
  }

  return (
    <dl className={styles.strip}>
      <div className={styles.metric}>
        <dt className={styles.label}>Current Balance</dt>
        <dd className={styles.value}>{currentBalanceDisplay}</dd>
      </div>

      <div className={styles.metric}>
        <dt className={styles.label}>Interest Rate</dt>
        <dd className={styles.value}>
          {rateDisplay}
          {rateBadgeLabel && (
            <span className={styles.badge}>{rateBadgeLabel}</span>
          )}
        </dd>
      </div>

      <div className={styles.metric}>
        <dt className={styles.label}>Daily Interest</dt>
        <dd className={styles.value}>{dailyInterestDisplay}</dd>
      </div>

      <div className={styles.metric}>
        <dt className={styles.label}>Monthly Payment</dt>
        <dd className={styles.value}>
          {monthlyPaymentDisplay}
          {paymentSource && (
            <small className={styles.subLabel}>{paymentSource}</small>
          )}
        </dd>
      </div>

      <div className={styles.metric}>
        <dt className={styles.label}>Next Payment</dt>
        <dd className={styles.value + (urgencyClass ? ' ' + styles[urgencyClass] : '')}>
          {nextPaymentDisplay}
        </dd>
      </div>

      <div className={styles.metric}>
        <dt className={styles.label}>Equity</dt>
        <dd className={styles.value}>{equityDisplay}</dd>
      </div>

      <div className={styles.metric}>
        <dt className={styles.label}>Payoff Date</dt>
        <dd className={styles.value}>{payoffDisplay}</dd>
      </div>
    </dl>
  );
}

export default MortgageKpiStrip;
