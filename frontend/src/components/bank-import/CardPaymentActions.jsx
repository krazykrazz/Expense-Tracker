import { useState } from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters';

/**
 * Credit card payments in the Import Inbox. A payment leaves a bank account as a debit and arrives on the card as
 * a credit; both resolve to one recorded payment. Whichever side arrives first records it (taking the other along
 * when it is already here); the side that arrives later links itself on the server, or is offered **Link** when
 * that isn't certain. `txn.cardPayment` comes from the server: { side, kind, looksLikeCardPayment, pairCandidates
 * (the other side's bank rows), paymentCandidates (payments already recorded), suggestedCardId (debits) }.
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
export const CardPaymentButtons = ({ txn, creditCards, expanded, onExpand, busy }) => {
  const cp = txn.cardPayment;
  if (!cp) return null;
  const toggle = (mode) => onExpand(expanded === mode ? null : mode);

  if (cp.side === 'card') {
    return (
      <button
        className={cp.kind ? 'bank-import-primary' : 'bank-import-secondary'}
        onClick={() => toggle('card-payment')}
        disabled={busy || txn.pending}
        aria-expanded={expanded === 'card-payment'}
        title={txn.pending ? 'Pending at the bank: record it once it settles' : undefined}
      >
        Record payment
      </button>
    );
  }
  if (cp.paymentCandidates.length > 0) {
    return (
      <button className="bank-import-primary" onClick={() => toggle('link-payment')} disabled={busy} aria-expanded={expanded === 'link-payment'}>
        Link to card payment
      </button>
    );
  }
  const sure = cp.kind || cp.pairCandidates.length > 0;
  if (creditCards.length > 0 && (sure || cp.looksLikeCardPayment)) {
    return (
      <button className={sure ? 'bank-import-primary' : 'bank-import-secondary'} onClick={() => toggle('record-to-card')} disabled={busy} aria-expanded={expanded === 'record-to-card'}>
        Record payment
      </button>
    );
  }
  return null;
};

/** For a debit recorded to a connected card: its credit needs no action when it arrives. */
export const CardPaymentHint = ({ txn }) => {
  const cp = txn.cardPayment;
  if (!cp || cp.side !== 'funding' || cp.paymentCandidates.length > 0 || cp.pairCandidates.length > 0) return null;
  if (!cp.kind && !cp.looksLikeCardPayment) return null;
  return (
    <div className="inbox-row-hint">
      Record it here. When the card is connected to a bank, its credit links to this payment by itself when it arrives.
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

const RecordToCard = ({ txn, creditCards, onSubmit, onCancel, busy }) => {
  const { pairCandidates, suggestedCardId } = txn.cardPayment;
  const initial = suggestedCardId ?? (creditCards.length === 1 ? creditCards[0].id : null);
  const [paymentMethodId, setPaymentMethodId] = useState(initial === null ? '' : String(initial));
  const card = creditCards.find(c => String(c.id) === paymentMethodId);
  // The chosen card's credit already in the inbox: record from it, so both rows are linked to the payment
  const credits = pairCandidates.filter(pair => card && pair.paymentMethodId === card.id);
  const credit = credits.length === 1 ? credits[0] : null;
  return (
    <div className="inbox-match-picker" data-testid="card-payment-panel">
      <label className="inbox-card-payment-select">
        Card
        <select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
          <option value="" disabled>Choose…</option>
          {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div>
        Records a {formatCurrency(Math.abs(txn.amount))} payment{card ? <> to <strong>{card.name}</strong></> : ''} dated {formatDate(credit ? credit.date : txn.postedDate)}.
        {credit && ` Its credit on ${formatDate(credit.date)} is linked too.`}
        {!credit && card?.connected && ' Its credit links to it when it arrives.'}
      </div>
      <div className="inbox-form-actions">
        <button
          className="bank-import-primary"
          onClick={() => onSubmit(credit ? { alsoLinkId: credit.id } : { paymentMethodId: Number(paymentMethodId) })}
          disabled={busy || !paymentMethodId}
        >
          Record payment
        </button>
        <button className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

/** The panel for the row's expanded mode, or null. */
export const CardPaymentPanel = ({ txn, mode, creditCards, onSubmit, onCancel, busy }) => {
  if (!txn.cardPayment) return null;
  if (mode === 'card-payment') return <RecordCardCredit txn={txn} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
  if (mode === 'link-payment') return <LinkDebit txn={txn} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
  if (mode === 'record-to-card') return <RecordToCard txn={txn} creditCards={creditCards} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
  return null;
};
