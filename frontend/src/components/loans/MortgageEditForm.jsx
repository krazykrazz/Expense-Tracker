/**
 * MortgageEditForm Component
 *
 * Inline form for the editable mortgage details: name, notes, estimated property
 * value and renewal date. The other mortgage terms are fixed once created.
 */
const MortgageEditForm = ({ formData, onChange, validationErrors = {}, loading = false, onSave, onCancel }) => {
  const update = (field) => (e) => onChange({ ...formData, [field]: e.target.value });

  return (
    <div className="loan-summary-card">
      <h3>Edit Mortgage Details</h3>
      <div className="loan-edit-form">
        <div className="loan-input-group">
          <label htmlFor="mortgage-edit-name">Name *</label>
          <input
            id="mortgage-edit-name"
            type="text"
            value={formData.name}
            onChange={update('name')}
            className={validationErrors.name ? 'input-error' : ''}
            disabled={loading}
          />
          {validationErrors.name && <span className="validation-error">{validationErrors.name}</span>}
        </div>

        <div className="loan-input-group">
          <label htmlFor="mortgage-edit-property-value">Estimated Property Value</label>
          <input
            id="mortgage-edit-property-value"
            type="number"
            min="0"
            step="1000"
            placeholder="e.g. 750000"
            value={formData.estimated_property_value}
            onChange={update('estimated_property_value')}
            className={validationErrors.estimated_property_value ? 'input-error' : ''}
            disabled={loading}
          />
          {validationErrors.estimated_property_value && (
            <span className="validation-error">{validationErrors.estimated_property_value}</span>
          )}
        </div>

        <div className="loan-input-group">
          <label htmlFor="mortgage-edit-renewal-date">Renewal Date</label>
          <input
            id="mortgage-edit-renewal-date"
            type="date"
            value={formData.renewal_date}
            onChange={update('renewal_date')}
            className={validationErrors.renewal_date ? 'input-error' : ''}
            disabled={loading}
          />
          {validationErrors.renewal_date && (
            <span className="validation-error">{validationErrors.renewal_date}</span>
          )}
        </div>

        <div className="loan-input-group">
          <label htmlFor="mortgage-edit-notes">Notes</label>
          <textarea
            id="mortgage-edit-notes"
            value={formData.notes}
            onChange={update('notes')}
            rows="3"
            disabled={loading}
          />
        </div>

        <div className="loan-edit-actions">
          <button className="loan-save-button" onClick={onSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button className="loan-cancel-button" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MortgageEditForm;
