import { useState } from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Credit card payments in the Import Inbox. A payment leaves a bank account as a debit and arrives on the card as
 * a credit; both resolve to one recorded payment. The card's credit records it (optionally taking the paying
 * debit along), the debit links to it. `txn.cardPayment` comes from the server: { side, kind, looksLikeCardPayment,
 * pairCandidates (the other side's bank rows), paymentCandidates (payments already recorded) }.
 */

const accountLabel = (row) => `${row.paymentMethodName}${row.accountMask ? ` ••${row.accountMask}` : ''}`;
const paymentLabel = (payment) => `${formatDate(payment.date)} · ${payment.paymentMethodName} · ${formatCurrency(payment.amount)}`;

/** A debit that is, or may be, a card payment: adding it as an expense would count the spending twice. */
export const isCardPaymentRow = (txn) => {
  const cp = txn.cardPayment;
  return Boolean(cp && cp.side === 'funding' && (cp.kind || cp.looksLikeCardPayment || cp.pairCandidates.length > 0 || cp.paymentCandidates.length > 0));
};

/** The label for a row's card payment status, or null (a credit nothing says is a payment keeps "Refund / credit"). */
const badgeText = (cp) => {
  if (cp.side === 'card') return cp.kind ? 'Card payment' : null;
  if (cp.paymentCandidates.length > 0) return `Card payment → ${cp.paymentCandidates[0].paymentMethodName}`;
  if (cp.kind || cp.pairCandidates.length > 0) return 'Card payment';
  return cp.looksLikeCardPayment ? 'Maybe a card payment' : null;
};

export const CardPaymentBadge = ({ txn }) => {
  const text = txn.cardPayment ? badgeText(txn.cardPayment) : null;
  if (!text) return null;
  const sure = txn.cardPayment.kind || txn.cardPayment.pairCandidates.length > 0 || txn.cardPayment.paymentCandidates.length > 0;
  return <span className={`inbox-badge ${sure ? 'match' : ''}`}>{text}</span>;
};

/** Row buttons for a card payment: which panel they open is decided by InboxRow's `expanded` mode. */
export const CardPaymentButtons = ({ txn, unconnectedCards, expanded, onExpand, busy }) => {
  const cp = txn.cardPayment;
  if (!cp) return null;
  const toggle = (mode) => onExpand(expanded === mode ? null : mode);

  if (cp.side === 'card') {
    return (
      <button
        className={cp.kind ? 'bank-import-primary' : 'bank-import-secondary'}
        onClick={() => toggle('card-payment')}
        disabled={busy || txn.pending}
        title={txn.pending ? 'Pending at the bank: record it once it settles' : undefined}
      >
        Record payment
      </button>
    );
  }
  if (cp.paymentCandidates.length > 0) {
    return <button className="bank-import-primary" onClick={() => toggle('link-payment')} disabled={busy}>Link to card payment</button>;
  }
  if (unconnectedCards.length > 0 && cp.pairCandidates.length === 0 && (cp.kind || cp.looksLikeCardPayment)) {
    return <button className="bank-import-secondary" onClick={() => toggle('record-to-card')} disabled={busy}>Record payment to…</button>;
  }
  return null;
};

/** What to do next with a debit that is, or may be, a card payment. */
export const CardPaymentHint = ({ txn, unconnectedCards }) => {
  const cp = txn.cardPayment;
  if (!cp || cp.side !== 'funding' || cp.paymentCandidates.length > 0) return null;
  if (cp.pairCandidates.length > 0) {
    const credit = cp.pairCandidates[0];
    return (
      <div className="inbox-row-hint">
        Paid {accountLabel(credit)}: record it from that credit ({formatDate(credit.date)})
        {cp.pairCandidates.length > 1 ? ` (or one of ${cp.pairCandidates.length - 1} other card${cp.pairCandidates.length > 2 ? 's' : ''} with the same amount)` : ''}.
        It links this debit too.
      </div>
    );
  }
  if (!cp.kind && !cp.looksLikeCardPayment) return null;
  return (
    <div className="inbox-row-hint">
      Looks like a credit card payment. Record it from the card&apos;s credit when it arrives in the inbox, usually within a few days.
      {unconnectedCards.length > 0 ? ' For a card that isn’t connected to a bank, record it here.' : ''}
    </div>
  );
};

const PairChoice = ({ pairs, value, onChange }) => {
  if (pairs.length === 0) return null;
  if (pairs.length === 1) {
    const [pair] = pairs;
    return (
      <label className="inbox-inline-check inbox-card-payment-also">
        <input type="checkbox" checked={value === pair.id} onChange={(event) => onChange(event.target.checked ? pair.id : null)} />
        {' '}Also mark the {accountLabel(pair)} debit on {formatDate(pair.date)} as this payment
      </label>
    );
  }
  return (
    <fieldset className="inbox-card-payment-pairs">
      <legend className="bank-import-muted">Several debits could have paid this. Link one?</legend>
      <label className="inbox-inline-check">
        <input type="radio" name="card-payment-pair" checked={value === null} onChange={() => onChange(null)} /> Don&apos;t link a debit
      </label>
      {pairs.map(pair => (
        <label key={pair.id} className="inbox-inline-check">
          <input type="radio" name="card-payment-pair" checked={value === pair.id} onChange={() => onChange(pair.id)} />
          {' '}{accountLabel(pair)} · {formatDate(pair.date)} · {formatCurrency(pair.amount)}
        </label>
      ))}
    </fieldset>
  );
};

const PaymentList = ({ intro, payments, actionLabel, onChoose, busy }) => (
  <>
    <div className="bank-import-muted">{intro}</div>
    <ul>
      {payments.map(payment => (
        <li key={payment.id} data-testid="payment-candidate">
          <span>
            {paymentLabel(payment)}
            {payment.notes ? <span className="bank-import-muted"> — {payment.notes}</span> : null}
          </span>
          <button className="bank-import-primary" onClick={() => onChoose(payment.id)} disabled={busy}>{actionLabel}</button>
        </li>
      ))}
    </ul>
  </>
);

const RecordCardCredit = ({ txn, onSubmit, onCancel, busy }) => {
  const { pairCandidates, paymentCandidates } = txn.cardPayment;
  // One possible payer is taken along unless unchecked; with several the user picks. The inbox can reload while
  // this is open (a sync), so a choice that is no longer offered falls back to the default.
  const [choice, setChoice] = useState(undefined);
  const defaultId = pairCandidates.length === 1 ? pairCandidates[0].id : null;
  const alsoLinkId = choice !== undefined && (choice === null || pairCandidates.some(pair => pair.id === choice)) ? choice : defaultId;
  return (
    <div className="inbox-match-picker" data-testid="card-payment-panel">
      {paymentCandidates.length > 0 && (
        <PaymentList
          intro={`Already recorded for ${txn.paymentMethodName} (same amount, within 5 days). Match it instead of recording the payment again:`}
          payments={paymentCandidates}
          actionLabel="Match"
          onChoose={(creditCardPaymentId) => onSubmit({ creditCardPaymentId })}
          busy={busy}
        />
      )}
      <div>
        Records a {formatCurrency(Math.abs(txn.amount))} payment to <strong>{txn.paymentMethodName}</strong> dated {formatDate(txn.postedDate)}.
      </div>
      <PairChoice pairs={pairCandidates} value={alsoLinkId} onChange={setChoice} />
      <div className="inbox-form-actions">
        <button className="bank-import-primary" onClick={() => onSubmit(alsoLinkId === null ? {} : { alsoLinkId })} disabled={busy}>Record payment</button>
        <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

const LinkDebit = ({ txn, onSubmit, onCancel, busy }) => (
  <div className="inbox-match-picker" data-testid="card-payment-panel">
    <PaymentList
      intro="Recorded payments for the same amount, within 5 days. Linking creates nothing; it ties this debit to the payment:"
      payments={txn.cardPayment.paymentCandidates}
      actionLabel="Link"
      onChoose={(creditCardPaymentId) => onSubmit({ creditCardPaymentId })}
      busy={busy}
    />
    <div className="inbox-form-actions">
      <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
    </div>
  </div>
);

const RecordToCard = ({ txn, unconnectedCards, onSubmit, onCancel, busy }) => {
  const [paymentMethodId, setPaymentMethodId] = useState(unconnectedCards.length === 1 ? String(unconnectedCards[0].id) : '');
  return (
    <div className="inbox-match-picker" data-testid="card-payment-panel">
      <div className="bank-import-muted">
        For a card that isn&apos;t connected to a bank. A connected card records its payments from its own credit.
      </div>
      <label className="inbox-card-payment-select">
        Card
        <select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
          <option value="" disabled>Choose…</option>
          {unconnectedCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
        </select>
      </label>
      <div>Records a {formatCurrency(Math.abs(txn.amount))} payment dated {formatDate(txn.postedDate)}.</div>
      <div className="inbox-form-actions">
        <button className="bank-import-primary" onClick={() => onSubmit({ paymentMethodId: Number(paymentMethodId) })} disabled={busy || !paymentMethodId}>
          Record payment
        </button>
        <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

/** The panel for the row's expanded mode, or null. */
export const CardPaymentPanel = ({ txn, mode, unconnectedCards, onSubmit, onCancel, busy }) => {
  if (!txn.cardPayment) return null;
  if (mode === 'card-payment') return <RecordCardCredit txn={txn} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
  if (mode === 'link-payment') return <LinkDebit txn={txn} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
  if (mode === 'record-to-card') return <RecordToCard txn={txn} unconnectedCards={unconnectedCards} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
  return null;
};
