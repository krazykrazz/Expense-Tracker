import { useState } from 'react';
import { formatCurrency } from '../../../utils/formatters';
import { MONTHS } from './inboxFormat';

/**
 * Expected income a deposit could confirm, each with "Update to <deposit>" when the amounts differ (on by default).
 * @param {{txn: object, onMatchIncome: Function, busy: boolean}} props
 */
const IncomeCandidates = ({ txn, onMatchIncome, busy }) => {
  const [updateAmount, setUpdateAmount] = useState({});
  const deposit = Math.abs(txn.amount);
  return (
    <>
      <div className="bank-import-muted">Expected income: this month, or the next/previous month within 3 days</div>
      <ul>
        {txn.incomeCandidates.map(income => {
          const update = updateAmount[income.id] ?? true;
          return (
            <li key={`i-${income.id}`} data-testid="income-candidate">
              <span>
                {income.name} · {MONTHS[income.month - 1]} {income.year} · {formatCurrency(income.amount)}
                {income.amountDiffers && (
                  <label className="inbox-inline-check">
                    <input
                      type="checkbox"
                      checked={update}
                      onChange={(event) => setUpdateAmount(prev => ({ ...prev, [income.id]: event.target.checked }))}
                    />
                    {' '}Update to {formatCurrency(deposit)}
                  </label>
                )}
              </span>
              <button
                className="bank-import-primary"
                onClick={() => onMatchIncome({ incomeSourceId: income.id, updateAmount: income.amountDiffers ? update : true })}
                disabled={busy}
              >
                Confirm
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default IncomeCandidates;
