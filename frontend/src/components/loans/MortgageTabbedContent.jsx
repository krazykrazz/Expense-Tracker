import { useRef, useState } from 'react';
import useTabState from '../../hooks/useTabState';
import styles from './MortgageTabbedContent.module.css';

// Import child components — fall back to placeholders for any that don't exist yet
import MortgageDetailSection from './MortgageDetailSection';
import EquityChart from './EquityChart';
import AmortizationChart from './AmortizationChart';
import PaymentBalanceChart from './PaymentBalanceChart';
import LoanPaymentForm from './LoanPaymentForm';
import LoanPaymentHistory from './LoanPaymentHistory';
import MigrationUtility from './MigrationUtility';
import PayoffProjectionInsights from './PayoffProjectionInsights';
import ScenarioAnalysisInsights from './ScenarioAnalysisInsights';

import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Rate changes from balance snapshots, oldest first: one entry per month the rate changed.
 * @param {Array} balanceHistory - Snapshots ({ year, month, rate }) in any order
 * @returns {Array<{year: number, month: number, rate: number}>}
 */
function buildRateHistory(balanceHistory) {
  const sorted = [...(balanceHistory || [])].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const history = [];
  for (const entry of sorted) {
    if (history.length === 0 || history[history.length - 1].rate !== entry.rate) {
      history.push({ year: entry.year, month: entry.month, rate: entry.rate });
    }
  }
  return history;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'projections', label: 'Projections' },
  { id: 'payments', label: 'Payments' },
];

/**
 * MortgageTabbedContent — four-tab container for mortgage detail content.
 *
 * Requirements: 3.1–3.5, 4.1–4.5, 5.1–5.5, 6.1–6.4, 7.1–7.4, 9.1, 9.2
 */
function MortgageTabbedContent({
  loanData,
  calculatedBalanceData,
  insights,
  insightsLoading,
  payments,
  balanceHistory,
  paymentBalanceHistory,
  linkedFixedExpenses,
  totalPayments,
  currentBalance,
  currentRate,
  paymentDueDay,
  loading,
  loadingPayments,
  showPaymentForm,
  editingPayment,
  showMigrationUtility,
  onEditRate,
  onCalculateScenario,
  onShowPaymentForm,
  onCancelPaymentForm,
  onPaymentRecorded,
  onEditPaymentEntry,
  onDeletePayment,
  onEditLoanDetails,
  onMarkPaidOff,
  onShowMigrationUtility,
  onMigrationComplete,
  onCloseMigrationUtility,
}) {
  const [activeTab, setActiveTab] = useTabState(
    `mortgage-detail-tab-${loanData?.id}`,
    'overview'
  );

  // Track focused tab index separately from active tab for keyboard nav
  const focusedIndexRef = useRef(TABS.findIndex((t) => t.id === activeTab));
  const tabRefs = useRef([]);

  const handleTabClick = (tabId, index) => {
    setActiveTab(tabId);
    focusedIndexRef.current = index;
  };

  const handleKeyDown = (e) => {
    const count = TABS.length;
    let newIndex = focusedIndexRef.current;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (focusedIndexRef.current + 1) % count;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = (focusedIndexRef.current - 1 + count) % count;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = count - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        setActiveTab(TABS[focusedIndexRef.current].id);
        return;
      default:
        return;
    }

    focusedIndexRef.current = newIndex;
    tabRefs.current[newIndex]?.focus();
  };

  return (
    <div className={styles.container}>
      {/* Tab bar — Requirement 9.1 */}
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label="Mortgage detail sections"
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`${styles.tab}${activeTab === tab.id ? ` ${styles.tabActive}` : ''}`}
            onClick={() => handleTabClick(tab.id, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active panel — only the active tab's content is rendered (Requirement 3.5) */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className={styles.panel}
      >
        {activeTab === 'overview' && (
          <OverviewPanel
            loanData={loanData}
            calculatedBalanceData={calculatedBalanceData}
            linkedFixedExpenses={linkedFixedExpenses}
            currentRate={currentRate}
            balanceHistory={balanceHistory}
            loading={loading}
            onEditLoanDetails={onEditLoanDetails}
            onEditRate={onEditRate}
            onMarkPaidOff={onMarkPaidOff}
          />
        )}
        {activeTab === 'charts' && (
          <ChartsPanel
            loanData={loanData}
            payments={payments}
            balanceHistory={balanceHistory}
            paymentBalanceHistory={paymentBalanceHistory}
            currentBalance={currentBalance}
            currentRate={currentRate}
          />
        )}
        {activeTab === 'projections' && (
          <ProjectionsPanel
            insights={insights}
            insightsLoading={insightsLoading}
            onCalculateScenario={onCalculateScenario}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsPanel
            loanData={loanData}
            currentBalance={currentBalance}
            calculatedBalanceData={calculatedBalanceData}
            payments={payments}
            balanceHistory={balanceHistory}
            paymentBalanceHistory={paymentBalanceHistory}
            loadingPayments={loadingPayments}
            showPaymentForm={showPaymentForm}
            editingPayment={editingPayment}
            showMigrationUtility={showMigrationUtility}
            onShowPaymentForm={onShowPaymentForm}
            onCancelPaymentForm={onCancelPaymentForm}
            onPaymentRecorded={onPaymentRecorded}
            onEditPaymentEntry={onEditPaymentEntry}
            onDeletePayment={onDeletePayment}
            onShowMigrationUtility={onShowMigrationUtility}
            onMigrationComplete={onMigrationComplete}
            onCloseMigrationUtility={onCloseMigrationUtility}
          />
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewPanel({
  loanData,
  calculatedBalanceData,
  linkedFixedExpenses,
  currentRate,
  balanceHistory,
  loading,
  onEditLoanDetails,
  onEditRate,
  onMarkPaidOff,
}) {
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [rateError, setRateError] = useState(null);
  const [rateSaving, setRateSaving] = useState(false);
  const [showRateHistory, setShowRateHistory] = useState(false);

  const handleStartEditRate = () => {
    setRateInput(currentRate ? currentRate.toString() : '');
    setRateError(null);
    setIsEditingRate(true);
  };

  const handleSaveRate = async () => {
    const parsed = parseFloat(rateInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setRateError('Rate must be between 0 and 100');
      return;
    }
    setRateSaving(true);
    setRateError(null);
    try {
      await onEditRate(parsed);
      setIsEditingRate(false);
    } catch (err) {
      setRateError(err.message || 'Failed to update rate');
    } finally {
      setRateSaving(false);
    }
  };

  const handleCancelEditRate = () => {
    setIsEditingRate(false);
    setRateError(null);
  };

  const rateHistory = buildRateHistory(balanceHistory);

  return (
    <div className={styles.overviewPanel}>
      {/* Requirement 4.1, 4.2 — MortgageDetailSection handles renewal banner internally */}
      <MortgageDetailSection mortgage={loanData} />

      {/* Interest Rate section with inline edit */}
      <div className={styles.section}>
        <h4 className={styles.sectionHeading}>Interest Rate</h4>
        {isEditingRate ? (
          <div className={styles.rateEditRow}>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className={styles.rateInput}
              disabled={rateSaving}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRate();
                if (e.key === 'Escape') handleCancelEditRate();
              }}
            />
            <span className={styles.rateInputSuffix}>%</span>
            <button className={styles.rateBtn} onClick={handleSaveRate} disabled={rateSaving}>
              {rateSaving ? '…' : '✓'}
            </button>
            <button className={styles.rateBtnCancel} onClick={handleCancelEditRate} disabled={rateSaving}>
              ✕
            </button>
            {rateError && <span className={styles.rateError}>{rateError}</span>}
          </div>
        ) : (
          <div className={styles.rateDisplayRow}>
            <span className={styles.rateValue}>
              {currentRate > 0 ? `${currentRate}%` : 'Not set'}
            </span>
            {loanData?.rate_type === 'variable' && (
              <button className={styles.rateEditBtn} onClick={handleStartEditRate} disabled={loading}>
                ✎ Update
              </button>
            )}
          </div>
        )}

        {/* Rate history toggle */}
        {rateHistory.length > 1 && (
          <div className={styles.rateHistorySection}>
            <button
              className={styles.rateHistoryToggle}
              onClick={() => setShowRateHistory(!showRateHistory)}
            >
              {showRateHistory ? '▾' : '▸'} Rate History ({rateHistory.length - 1} change{rateHistory.length === 2 ? '' : 's'})
            </button>
            {showRateHistory && (
              <ul className={styles.rateHistoryList}>
                {[...rateHistory].reverse().map((entry, idx) => (
                  <li key={idx} className={styles.rateHistoryItem}>
                    <span className={styles.rateHistoryDate}>
                      {String(entry.month).padStart(2, '0')}/{entry.year}
                    </span>
                    <span className={styles.rateHistoryValue}>{entry.rate}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Requirement 4.3 — Linked fixed expenses */}
      {linkedFixedExpenses?.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionHeading}>Linked Fixed Expenses</h4>
          <ul className={styles.expenseList}>
            {linkedFixedExpenses.map((expense) => (
              <li key={expense.id} className={styles.expenseItem}>
                <span className={styles.expenseName}>{expense.name}</span>
                <span className={styles.expenseAmount}>
                  {formatCurrency(expense.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Requirement 4.4 — Payment summary */}
      <div className={styles.section}>
        <h4 className={styles.sectionHeading}>Payment Summary</h4>
        <dl className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <dt>Total Payments</dt>
            <dd>{calculatedBalanceData?.totalPayments != null
              ? formatCurrency(calculatedBalanceData.totalPayments)
              : '—'}
            </dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Current Balance</dt>
            <dd>{calculatedBalanceData?.currentBalance != null
              ? formatCurrency(calculatedBalanceData.currentBalance)
              : '—'}
            </dd>
          </div>

          <div className={styles.summaryItem}>
            <dt>Last Payment</dt>
            <dd>{calculatedBalanceData?.lastPaymentDate ? formatDate(calculatedBalanceData.lastPaymentDate) : '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Requirement 4.5 — Action buttons */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={onEditLoanDetails} disabled={loading}>
          Edit Loan Details
        </button>
        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={onMarkPaidOff} disabled={loading}>
          Mark Paid Off
        </button>
      </div>
    </div>
  );
}

// ─── Charts Tab ──────────────────────────────────────────────────────────────

function ChartsPanel({ loanData, payments, balanceHistory, paymentBalanceHistory, currentBalance, currentRate }) {
  const rateHistory = buildRateHistory(balanceHistory);
  return (
    <div className={styles.chartsPanel}>
      {/* Requirement 5.1 — EquityChart when property value is set */}
      {loanData?.estimated_property_value > 0 && (
        <EquityChart
          loanId={loanData.id}
          estimatedPropertyValue={loanData.estimated_property_value}
          currentBalance={currentBalance}
        />
      )}

      {/* Requirement 5.2 — AmortizationChart always */}
      <AmortizationChart
        loanId={loanData?.id}
        currentBalance={currentBalance}
        currentRate={currentRate}
      />

      {/* Requirement 5.3 — PaymentBalanceChart when payments exist */}
      {payments?.length > 0 && (
        <PaymentBalanceChart
          payments={payments}
          initialBalance={loanData?.initial_balance}
          serverHistory={paymentBalanceHistory}
          loanName={loanData?.name}
        />
      )}

      {/* Requirement 5.4 — Rate History Chart for variable rate with balance history */}
      {loanData?.rate_type === 'variable' && rateHistory.length > 0 && (
        <RateHistoryChart rateHistory={rateHistory} currentRate={currentRate} />
      )}
    </div>
  );
}

/**
 * Step chart of a variable rate over time, extended to the current month.
 */
function RateHistoryChart({ rateHistory, currentRate }) {
  const now = new Date();
  const points = [...rateHistory];
  const last = points[points.length - 1];
  if (currentRate > 0 && currentRate !== last.rate) {
    points.push({ year: now.getFullYear(), month: now.getMonth() + 1, rate: currentRate });
  }
  const index = (p) => p.year * 12 + (p.month - 1);
  const startIndex = index(points[0]);
  const endIndex = Math.max(index(points[points.length - 1]), now.getFullYear() * 12 + now.getMonth());
  const span = Math.max(1, endIndex - startIndex);

  const rates = points.map(p => p.rate);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const padRate = Math.max(0.25, (maxRate - minRate) * 0.2);
  const low = Math.max(0, minRate - padRate);
  const high = maxRate + padRate;

  const width = 600;
  const height = 180;
  const pad = { top: 16, right: 20, bottom: 30, left: 50 };
  const x = (i) => pad.left + ((i - startIndex) / span) * (width - pad.left - pad.right);
  const y = (rate) => pad.top + (1 - (rate - low) / (high - low)) * (height - pad.top - pad.bottom);

  let path = `M ${x(index(points[0]))} ${y(points[0].rate)}`;
  for (let i = 1; i < points.length; i++) {
    path += ` H ${x(index(points[i]))} V ${y(points[i].rate)}`;
  }
  path += ` H ${x(endIndex)}`;

  const label = (p) => new Date(p.year, p.month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  return (
    <div data-testid="rate-history-chart" className={styles.rateChart}>
      <h4 className={styles.sectionHeading}>Rate History</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.rateChartSvg} role="img" aria-label="Interest rate over time">
        {[low, (low + high) / 2, high].map((rate) => (
          <g key={rate}>
            <line x1={pad.left} x2={width - pad.right} y1={y(rate)} y2={y(rate)} className={styles.rateChartGrid} />
            <text x={pad.left - 8} y={y(rate) + 4} textAnchor="end" className={styles.rateChartLabel}>{rate.toFixed(2)}%</text>
          </g>
        ))}
        <path d={path} className={styles.rateChartLine} />
        {points.map((p) => (
          <g key={`${p.year}-${p.month}`}>
            <circle cx={x(index(p))} cy={y(p.rate)} r="4" className={styles.rateChartDot}>
              <title>{`${label(p)}: ${p.rate}%`}</title>
            </circle>
            <text x={x(index(p))} y={height - 10} textAnchor="middle" className={styles.rateChartLabel}>{label(p)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Projections Tab ─────────────────────────────────────────────────────────

function ProjectionsPanel({ insights, insightsLoading, onCalculateScenario }) {
  // Requirement 6.4 — insufficient balance data message
  if (insights?.dataStatus?.hasBalanceData === false) {
    return (
      <div className={styles.projectionsPanel}>
        <p>Insufficient balance data to calculate projections.</p>
      </div>
    );
  }

  const usesCalculatedPayment = insights?.dataStatus?.paymentSource === 'calculated';

  return (
    <div className={styles.projectionsPanel}>
      {usesCalculatedPayment && (
        <div className={styles.paymentMismatchNote}>
          <strong>Note:</strong> No fixed expense is linked to this mortgage, so projections use the
          calculated minimum payment of {formatCurrency(insights.currentStatus.currentPayment)}/mo.
          Link your mortgage payment fixed expense to project your actual payment.
        </div>
      )}
      {/* Requirement 6.1 */}
      <PayoffProjectionInsights
        projections={insights?.projections}
        loading={insightsLoading}
      />
      {/* Requirement 6.2 */}
      <ScenarioAnalysisInsights
        currentScenario={insights?.projections?.currentScenario}
        onCalculateScenario={onCalculateScenario}
        loading={insightsLoading}
      />
    </div>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsPanel({
  loanData,
  currentBalance,
  calculatedBalanceData,
  payments,
  balanceHistory,
  paymentBalanceHistory,
  loadingPayments,
  showPaymentForm,
  editingPayment,
  showMigrationUtility,
  onShowPaymentForm,
  onCancelPaymentForm,
  onPaymentRecorded,
  onEditPaymentEntry,
  onDeletePayment,
  onShowMigrationUtility,
  onMigrationComplete,
  onCloseMigrationUtility,
}) {
  const showMigrationPrompt =
    balanceHistory?.length > 0 && (!payments || payments.length === 0);

  return (
    <div className={styles.paymentsPanel}>
      {/* Requirement 7.1 — Log Payment button */}
      <div className={styles.paymentActions}>
        <button className={styles.actionBtn} onClick={onShowPaymentForm}>
          Log Payment
        </button>
      </div>

      {/* Requirement 7.2 — Payment form */}
      {showPaymentForm && (
        <LoanPaymentForm
          loanId={loanData?.id}
          loanName={loanData?.name}
          loanType={loanData?.loan_type}
          currentBalance={currentBalance}
          calculatedBalanceData={calculatedBalanceData}
          editingPayment={editingPayment}
          onPaymentRecorded={onPaymentRecorded}
          onCancel={onCancelPaymentForm}
          disabled={loadingPayments}
        />
      )}

      {/* Requirement 7.3 — Payment history */}
      <LoanPaymentHistory
        payments={payments}
        initialBalance={loanData?.initial_balance}
        serverHistory={paymentBalanceHistory}
        currentBalance={currentBalance}
        loading={loadingPayments}
        onEdit={onEditPaymentEntry}
        onDelete={onDeletePayment}
        disabled={loadingPayments}
      />

      {/* Requirement 7.4 — Migration prompt */}
      {showMigrationPrompt && (
        <div className={styles.migrationSection}>
          <p className={styles.migrationPrompt}>
            You have balance history entries but no payment records. You can
            migrate your balance history into payment records.
          </p>
          <button className={styles.actionBtn} onClick={onShowMigrationUtility}>
            Show Migration Utility
          </button>
          {showMigrationUtility && (
            <MigrationUtility
              loanId={loanData?.id}
              loanName={loanData?.name}
              onMigrationComplete={onMigrationComplete}
              onClose={onCloseMigrationUtility}
              disabled={loadingPayments}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default MortgageTabbedContent;
