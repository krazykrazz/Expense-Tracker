import { useState, useEffect } from 'react';
import './PeopleManagementModal.css';
import {
  getPeople,
  createPerson,
  updatePerson,
  deletePerson
} from '../services/peopleApi';

const PeopleManagementModal = ({ isOpen, onClose, onPeopleUpdated }) => {
  const [people, setPeople] = useState([]);
  const [editingPerson, setEditingPerson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    dateOfBirth: ''
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Fetch people when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPeople();
    }
  }, [isOpen]);

  const fetchPeople = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPeople();
      setPeople(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load people. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching people:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setFormData({
      name: '',
      dateOfBirth: ''
    });
    setValidationErrors({});
    setEditingPerson(null);
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name || formData.name.trim() === '') {
      errors.name = 'Name is required';
    }
    
    if (formData.dateOfBirth && formData.dateOfBirth.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formData.dateOfBirth)) {
        errors.dateOfBirth = 'Date must be in YYYY-MM-DD format';
      } else {
        const date = new Date(formData.dateOfBirth);
        if (isNaN(date.getTime())) {
          errors.dateOfBirth = 'Invalid date';
        } else if (date > new Date()) {
          errors.dateOfBirth = 'Date cannot be in the future';
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleAddPerson = () => {
    clearForm();
    setEditingPerson('new');
  };

  const handleEditPerson = (person) => {
    setFormData({
      name: person.name,
      dateOfBirth: person.dateOfBirth || ''
    });
    setEditingPerson(person.id);
    setValidationErrors({});
  };

  const handleSavePerson = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { name, dateOfBirth } = formData;
      const dateValue = dateOfBirth.trim() === '' ? null : dateOfBirth;

      if (editingPerson === 'new') {
        await createPerson(name.trim(), dateValue);
      } else {
        await updatePerson(editingPerson, name.trim(), dateValue);
      }

      // Refresh people list
      await fetchPeople();
      clearForm();
      
      // Notify parent component
      if (onPeopleUpdated) {
        onPeopleUpdated();
      }
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to save person. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error saving person:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    clearForm();
    setError(null);
  };

  const handleDeleteClick = (person) => {
    setDeleteConfirm(person);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    setLoading(true);
    setError(null);

    try {
      await deletePerson(deleteConfirm.id);
      
      // Refresh people list
      await fetchPeople();
      setDeleteConfirm(null);
      
      // Notify parent component
      if (onPeopleUpdated) {
        onPeopleUpdated();
      }
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to delete person. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error deleting person:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  const handleClose = () => {
    clearForm();
    setError(null);
    setDeleteConfirm(null);
    onClose();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="people-modal-overlay" onClick={handleClose}>
      <div className="people-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="people-modal-header">
          <h2>Manage Family Members</h2>
          <button className="people-modal-close" onClick={handleClose}>✕</button>
        </div>

        {error && (
          <div className="people-modal-error">
            <div>{error}</div>
            {people.length === 0 && !loading && (
              <button 
                className="people-error-retry-button" 
                onClick={fetchPeople}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="people-modal-content">
          {loading && people.length === 0 ? (
            <div className="people-modal-loading">Loading family members...</div>
          ) : (
            <>
              {/* Add Person Section */}
              <div className="people-add-section">
                <button
                  className="people-add-button"
                  onClick={handleAddPerson}
                  disabled={loading || editingPerson !== null}
                >
                  ➕ Add Family Member
                </button>
              </div>

              {/* Person Form (for adding/editing) */}
              {editingPerson !== null && (
                <div className="people-form-section">
                  <h3>{editingPerson === 'new' ? 'Add New Person' : 'Edit Person'}</h3>
                  
                  <div className="people-form">
                    <div className="people-form-group">
                      <label htmlFor="person-name">Name *</label>
                      <input
                        id="person-name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter person's name"
                        className={validationErrors.name ? 'input-error' : ''}
                        disabled={loading}
                        autoFocus
                      />
                      {validationErrors.name && (
                        <span className="validation-error">{validationErrors.name}</span>
                      )}
                    </div>

                    <div className="people-form-group">
                      <label htmlFor="person-dob">Date of Birth (Optional)</label>
                      <input
                        id="person-dob"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        className={validationErrors.dateOfBirth ? 'input-error' : ''}
                        disabled={loading}
                      />
                      {validationErrors.dateOfBirth && (
                        <span className="validation-error">{validationErrors.dateOfBirth}</span>
                      )}
                    </div>

                    <div className="people-form-actions">
                      <button
                        className="people-save-button"
                        onClick={handleSavePerson}
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : (editingPerson === 'new' ? 'Add Person' : 'Save Changes')}
                      </button>
                      <button
                        className="people-cancel-button"
                        onClick={handleCancelEdit}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* People List */}
              <div className="people-list-section">
                <h3>Family Members ({people.length})</h3>
                
                {people.length === 0 ? (
                  <div className="people-empty-state">
                    <p>No family members added yet.</p>
                    <p>Click "Add Family Member" to get started.</p>
                  </div>
                ) : (
                  <div className="people-list">
                    {people.map((person) => (
                      <div key={person.id} className="people-list-item">
                        <div className="people-info">
                          <div className="people-name">{person.name}</div>
                          <div className="people-dob">
                            Born: {formatDate(person.dateOfBirth)}
                          </div>
                        </div>
                        
                        <div className="people-actions">
                          <button
                            className="people-edit-button"
                            onClick={() => handleEditPerson(person)}
                            disabled={loading || editingPerson !== null}
                            title="Edit person"
                          >
                            ✏️
                          </button>
                          <button
                            className="people-delete-button"
                            onClick={() => handleDeleteClick(person)}
                            disabled={loading}
                            title="Delete person"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info Section */}
              <div className="people-info-section">
                <p className="people-info-text">
                  💡 <strong>Note:</strong> Deleting a person will remove them from all associated medical expenses. This action cannot be undone.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="people-delete-overlay">
            <div className="people-delete-modal">
              <h3>Confirm Deletion</h3>
              <p>
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
              </p>
              <p className="people-delete-warning">
                ⚠️ This will remove them from all associated medical expenses and cannot be undone.
              </p>
              
              <div className="people-delete-actions">
                <button
                  className="people-delete-confirm-button"
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  className="people-delete-cancel-button"
                  onClick={handleDeleteCancel}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PeopleManagementModal;