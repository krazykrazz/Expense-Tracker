import styles from './MortgageKpiStrip.module.css';
import { formatCurrency } from '../../utils/formatters';

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
 * Format a number as currency with dollar sign.
 * Uses formatCurrency (which returns "1,234.56") and prepends "$".
 */
function fmt(value) {
  return '$' + formatCurrency(value);
}

/**
 * MortgageKpiStrip — compact always-visible strip of 7 key mortgage metrics.
 */
function MortgageKpiStrip({ loanData, calculatedBalanceData, insights, insightsLoading, paymentDueDay }) {
  // 1. Current Balance
  const rawBalance = calculatedBalanceData?.currentBalance ?? loanData?.initial_balance ?? null;
  const currentBalanceDisplay = rawBalance != null ? fmt(rawBalance) : '—';

  // 2. Interest Rate
  const rateDisplay = loanData?.currentRate != null ? loanData.currentRate + '%' : '—';
  const rateType = loanData?.rate_type;
  const rateBadgeLabel = rateType === 'variable' ? 'Variable' : rateType === 'fixed' ? 'Fixed' : null;

  // 3. Daily Interest (insight-dependent)
  const dailyInterestRaw = (!insightsLoading && insights)
    ? insights?.currentStatus?.interestBreakdown?.daily
    : null;
  const dailyInterestDisplay = dailyInterestRaw != null ? fmt(dailyInterestRaw) : '—';

  // 4. Monthly Payment (insight-dependent)
  const monthlyPaymentRaw = (!insightsLoading && insights)
    ? insights?.currentStatus?.currentPayment
    : null;
  const monthlyPaymentDisplay = monthlyPaymentRaw != null ? fmt(monthlyPaymentRaw) : '—';
  const paymentSource = (!insightsLoading && insights)
    ? (insights?.currentStatus?.paymentSource || null)
    : null;

  // 5. Next Payment Date
  let nextPaymentDisplay = '—';
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
  let equityDisplay = '—';
  if (propertyValue && propertyValue > 0 && balanceForEquity != null) {
    const equityPct = ((propertyValue - balanceForEquity) / propertyValue) * 100;
    equityDisplay = equityPct.toFixed(1) + '%';
  }

  // 7. Payoff Date (insight-dependent)
  let payoffDisplay = '—';
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
        <dd className={`${styles.value}${urgencyClass ? ' ' + styles[urgencyClass] : ''}`}>
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
