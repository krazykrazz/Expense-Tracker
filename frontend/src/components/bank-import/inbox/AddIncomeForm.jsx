import { useState } from 'react';
import { INCOME_CATEGORIES } from '../../../utils/constants';
import { formatCurrency } from '../../../utils/formatters';
import { MONTHS } from './inboxFormat';

/**
 * Add a deposit as a new income source in its month, with a name and category learned from earlier deposits.
 * @param {{txn: object, onSubmit: Function, onCancel: Function, busy: boolean}} props
 */
const AddIncomeForm = ({ txn, onSubmit, onCancel, busy }) => {
  const [fields, setFields] = useState({
    name: txn.incomeSuggestion?.name || txn.place || '',
    category: txn.incomeSuggestion?.category || 'Other'
  });
  const set = (name) => (event) => setFields(prev => ({ ...prev, [name]: event.target.value }));
  const month = `${MONTHS[Number(txn.postedDate.slice(5, 7)) - 1]} ${txn.postedDate.slice(0, 4)}`;

  return (
    <form
      className="inbox-add-form"
      onSubmit={(event) => { event.preventDefault(); onSubmit(fields); }}
    >
      <label>Income name<input value={fields.name} onChange={set('name')} maxLength={100} required /></label>
      <label>
        Category
        <select value={fields.category} onChange={set('category')}>
          {INCOME_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <div className="bank-import-muted">Adds {formatCurrency(Math.abs(txn.amount))} to {month} income</div>
      <div className="inbox-form-actions">
        <button type="submit" className="bank-import-primary" disabled={busy || !fields.name.trim()}>Add income</button>
        <button type="button" className="bank-import-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
};

export default AddIncomeForm;
