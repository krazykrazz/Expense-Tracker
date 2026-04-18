import { useRef } from 'react';
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

import { formatCurrency } from '../../utils/formatters';

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
  onEditPayment,
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
            onEditLoanDetails={onEditLoanDetails}
            onMarkPaidOff={onMarkPaidOff}
          />
        )}
        {activeTab === 'charts' && (
          <ChartsPanel
            loanData={loanData}
            payments={payments}
            balanceHistory={balanceHistory}
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
  onEditLoanDetails,
  onMarkPaidOff,
}) {
  return (
    <div className={styles.overviewPanel}>
      {/* Requirement 4.1, 4.2 — MortgageDetailSection handles renewal banner internally */}
      <MortgageDetailSection mortgage={loanData} />

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
            <dt>Interest Accrued</dt>
            <dd>{calculatedBalanceData?.totalInterestAccrued != null
              ? formatCurrency(calculatedBalanceData.totalInterestAccrued)
              : '—'}
            </dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Last Payment</dt>
            <dd>{calculatedBalanceData?.lastPaymentDate ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Requirement 4.5 — Action buttons */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={onEditLoanDetails}>
          Edit Loan Details
        </button>
        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={onMarkPaidOff}>
          Mark Paid Off
        </button>
      </div>
    </div>
  );
}

// ─── Charts Tab ──────────────────────────────────────────────────────────────

function ChartsPanel({ loanData, payments, balanceHistory }) {
  return (
    <div className={styles.chartsPanel}>
      {/* Requirement 5.1 — EquityChart when property value is set */}
      {loanData?.estimated_property_value > 0 && (
        <EquityChart loanData={loanData} />
      )}

      {/* Requirement 5.2 — AmortizationChart always */}
      <AmortizationChart loanData={loanData} />

      {/* Requirement 5.3 — PaymentBalanceChart when payments exist */}
      {payments?.length > 0 && (
        <PaymentBalanceChart loanData={loanData} payments={payments} />
      )}

      {/* Requirement 5.4 — Rate History Chart for variable rate with balance history */}
      {loanData?.rate_type === 'variable' && balanceHistory?.length > 0 && (
        <div data-testid="rate-history-chart" className={styles.chartPlaceholder}>
          Rate History (variable rate)
        </div>
      )}
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

  return (
    <div className={styles.projectionsPanel}>
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
        />
      )}

      {/* Requirement 7.3 — Payment history */}
      <LoanPaymentHistory
        payments={payments}
        loading={loadingPayments}
        onEdit={onEditPaymentEntry}
        onDelete={onDeletePayment}
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
            />
          )}
        </div>
      )}
    </div>
  );
}

export default MortgageTabbedContent;
