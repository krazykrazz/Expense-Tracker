import { useState, useEffect, useCallback, useRef } from 'react';
import { getCardCycleChecks, openBankImport } from '../../services/plaidApi';
import { useSyncEvent } from '../../hooks/useSyncEvent';
import { formatDate } from '../../utils/formatters';
import { createLogger } from '../../utils/logger';
import { describeCycleCause, describeCycleTotals } from './cardCycleCheck';
import { inboxViewFor } from './cardBalanceCheck';
import './BankImport.css';

const logger = createLogger('CardCycleChecks');

const hasInboxCause = (cycle) => cycle.causes.some(cause => cause.type === 'bank_only' || cause.type === 'cancelled');

/**
 * The card's last closed statements against what the bank posted in each (Billing Cycles tab). A statement
 * the bank history only partly covers is left out. Render only for cards linked to a bank; renders nothing
 * until it has cycles, and on failure, so the tab looks as before without it.
 * @param {{paymentMethodId: number, refreshKey?: *}} props refreshKey: reload when it changes (e.g. after an edit)
 */
const CardCycleChecks = ({ paymentMethodId, refreshKey }) => {
  const [cycles, setCycles] = useState([]);
  // Only the newest request may update the list (a sync event can reload while the first load is in flight)
  const requestRef = useRef(0);

  const load = useCallback(async (signal) => {
    const request = ++requestRef.current;
    try {
      const result = await getCardCycleChecks(paymentMethodId, { signal });
      if (request === requestRef.current && !signal?.aborted) setCycles(result?.cycles || []);
    } catch (err) {
      if (err.name === 'AbortError' || request !== requestRef.current) return;
      logger.warn('Could not load the statement bank check', err);
      setCycles([]);
    }
  }, [paymentMethodId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  useSyncEvent(['plaid', 'credit_card'], () => { load(); });

  if (cycles.length === 0) return null;

  return (
    <section className="card-cycle-checks" data-testid="card-cycle-checks" aria-label="Statements compared with the bank">
      <h5 className="card-cycle-checks-title">Compared with the bank</h5>
      {cycles.map(cycle => (
        <details key={cycle.endDate} className={`card-cycle-check ${cycle.status}`} open={cycle.status === 'differs'}>
          <summary>
            <span className="card-cycle-check-dates">{formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}</span>
            <span className="card-cycle-check-totals">{describeCycleTotals(cycle)}</span>
          </summary>
          {cycle.status === 'differs' && (
            <ul>
              {cycle.causes.map(cause => (
                <li key={`${cause.type}-${cause.transactionId ?? ''}-${cause.kind ?? ''}-${cause.id ?? ''}`}>{describeCycleCause(cause)}</li>
              ))}
              {cycle.awaitingMatch > 0 && (
                <li>
                  {cycle.awaitingMatch} Inbox {cycle.awaitingMatch === 1 ? 'transaction matches an entry' : 'transactions match entries'} already
                  in the tracker (they cancel out here): Match {cycle.awaitingMatch === 1 ? 'it' : 'them'} in Bank Import
                </li>
              )}
            </ul>
          )}
          {cycle.status === 'differs' && hasInboxCause(cycle) && (
            <button type="button" className="bank-import-secondary" onClick={() => openBankImport('inbox', { inboxView: inboxViewFor(cycle.causes) })}>Open Inbox</button>
          )}
        </details>
      ))}
    </section>
  );
};

export default CardCycleChecks;
