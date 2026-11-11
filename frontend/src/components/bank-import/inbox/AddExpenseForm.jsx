import { useState } from 'react';
import { CATEGORIES } from '../../../utils/constants';

/**
 * Add a bank transaction as an expense: place, category, date and notes, pre-filled from the bank and history.
 * @param {{txn: object, onSubmit: Function, onCancel: Function, busy: boolean, warnCardPayment?: boolean}} props
 */
const AddExpenseForm = ({ txn, onSubmit, onCancel, busy, warnCardPayment = false }) => {
  const [fields, setFields] = useState({
    place: txn.place,
    type: txn.suggestedCategory || '',
    date: txn.date,
    notes: ''
  });
  const set = (name) => (event) => setFields(prev => ({ ...prev, [name]: event.target.value }));

  return (
    <form
      className="inbox-add-form"
      onSubmit={(event) => { event.preventDefault(); onSubmit(fields); }}
    >
      <label>Place<input value={fields.place} onChange={set('place')} maxLength={200} /></label>
      <label>
        Category
        <select value={fields.type} onChange={set('type')} required>
          <option value="" disabled>Choose…</option>
          {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>Date<input type="date" value={fields.date} onChange={set('date')} required /></label>
      <label>Notes<input value={fields.notes} onChange={set('notes')} maxLength={200} /></label>
      {warnCardPayment && (
        <div className="inbox-form-note" role="note">
          This looks like a credit card payment. Adding it as an expense counts the spending twice (it is already on the
          card). Use Record payment or Link to card payment instead.
        </div>
      )}
      <div className="inbox-form-actions">
        <button type="submit" className="bank-import-primary" disabled={busy || !fields.type}>Add expense</button>
        <button type="button" className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
};

export default AddExpenseForm;
