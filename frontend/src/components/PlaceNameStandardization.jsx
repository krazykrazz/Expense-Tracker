import { useState } from 'react';
import './PlaceNameStandardization.css';
import { analyzePlaceNames, standardizePlaceNames } from '../services/placeNameApi';
import SimilarityGroup from './SimilarityGroup';

const PlaceNameStandardization = ({ onClose }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [similarityGroups, setSimilarityGroups] = useState([]);
  const [selections, setSelections] = useState(new Map());
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  /**
   * Fetch similarity groups from backend
   */
  const handleAnalyzePlaceNames = async () => {
    setAnalyzing(true);
    setMessage({ text: '', type: '' });

    try {
      const data = await analyzePlaceNames();
      
      if (!data.groups || data.groups.length === 0) {
        setMessage({ 
          text: 'No similar place names found. All place names are already unique!', 
          type: 'info' 
        });
        setSimilarityGroups([]);
      } else {
        setSimilarityGroups(data.groups);
        setMessage({ 
          text: `Found ${data.totalGroups} similarity groups affecting ${data.totalExpenses} expenses`, 
          type: 'success' 
        });
      }
    } catch (err) {
      setMessage({ text: err.message || 'Failed to analyze place names', type: 'error' });
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Update canonical name selection for a group
   */
  const handleCanonicalSelection = (groupId, canonicalName) => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      newSelections.set(groupId, canonicalName);
      return newSelections;
    });
  };

  /**
   * Generate preview of changes
   */
  const handleShowPreview = () => {
    const updates = [];
    let totalAffected = 0;

    similarityGroups.forEach(group => {
      const selectedCanonical = selections.get(group.id);
      
      if (selectedCanonical) {
        // Get all variations except the canonical one
        const variationsToUpdate = group.variations
          .filter(v => v.name !== selectedCanonical)
          .map(v => v.name);
        
        if (variationsToUpdate.length > 0) {
          const affectedCount = group.variations
            .filter(v => v.name !== selectedCanonical)
            .reduce((sum, v) => sum + v.count, 0);
          
          updates.push({
            from: variationsToUpdate,
            to: selectedCanonical,
            affectedCount
          });
          
          totalAffected += affectedCount;
        }
      }
    });

    if (updates.length === 0) {
      setMessage({ 
        text: 'Please select canonical names for at least one group', 
        type: 'warning' 
      });
      return;
    }

    setPreviewData({
      updates,
      totalAffected
    });
    setShowPreview(true);
  };

  /**
   * Apply standardization changes
   */
  const handleApplyStandardization = async () => {
    if (!previewData || previewData.updates.length === 0) {
      return;
    }

    setApplying(true);
    setMessage({ text: 'Applying standardization...', type: 'info' });

    try {
      const result = await standardizePlaceNames(previewData.updates);
      
      setMessage({ 
        text: `Successfully standardized ${result.updatedCount} expense records!`, 
        type: 'success' 
      });
      
      // Reset state after successful update
      setTimeout(() => {
        handleCancel();
        // Trigger a refresh of expense lists if needed
        window.dispatchEvent(new Event('expensesUpdated'));
      }, 2000);
    } catch (err) {
      setMessage({ text: err.message || 'Failed to apply standardization', type: 'error' });
    } finally {
      setApplying(false);
    }
  };

  /**
   * Cancel and reset state
   */
  const handleCancel = () => {
    setSimilarityGroups([]);
    setSelections(new Map());
    setShowPreview(false);
    setPreviewData(null);
    setMessage({ text: '', type: '' });
    if (onClose) {
      onClose();
    }
  };

  /**
   * Go back from preview to editing
   */
  const handleBackFromPreview = () => {
    setShowPreview(false);
    setPreviewData(null);
  };

  return (
    <div className="place-name-standardization">
      <div className="standardization-header">
        <h3>🏷️ Standardize Place Names</h3>
        <p>Find and fix inconsistent place names in your expenses</p>
      </div>

      {/* Initial state - no analysis yet */}
      {!analyzing && similarityGroups.length === 0 && !showPreview && (
        <div className="standardization-start">
          <p>Click the button below to analyze your expense data and identify similar place names.</p>
          <button 
            className="analyze-button"
            onClick={handleAnalyzePlaceNames}
          >
            🔍 Analyze Place Names
          </button>
        </div>
      )}

      {/* Analyzing state */}
      {analyzing && (
        <div className="standardization-loading">
          <div className="spinner"></div>
          <p>Analyzing place names...</p>
        </div>
      )}

      {/* Similarity groups display */}
      {!analyzing && !showPreview && similarityGroups.length > 0 && (
        <div className="standardization-groups">
          <div className="groups-header">
            <p>Review the groups below and select a canonical name for each:</p>
          </div>

          <div className="groups-list">
            {similarityGroups.map(group => (
              <SimilarityGroup
                key={group.id}
                group={group}
                selectedCanonical={selections.get(group.id)}
                onSelectCanonical={handleCanonicalSelection}
              />
            ))}
          </div>

          <div className="groups-actions">
            <button 
              className="preview-button"
              onClick={handleShowPreview}
              disabled={selections.size === 0}
            >
              👁️ Preview Changes
            </button>
            <button 
              className="cancel-button"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Preview state */}
      {showPreview && previewData && (
        <div className="standardization-preview">
          <div className="preview-header">
            <h4>Preview Changes</h4>
            <p>Review the changes that will be applied:</p>
          </div>

          <div className="preview-summary">
            <strong>Total records to be updated: {previewData.totalAffected}</strong>
          </div>

          <div className="preview-list">
            {previewData.updates.map((update, index) => (
              <div key={index} className="preview-item">
                <div className="preview-from">
                  <strong>From:</strong>
                  <ul>
                    {update.from.map(name => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
                <div className="preview-arrow">→</div>
                <div className="preview-to">
                  <strong>To:</strong>
                  <div className="canonical-name">{update.to}</div>
                </div>
                <div className="preview-count">
                  <span className="affected-count">{update.affectedCount} records</span>
                </div>
              </div>
            ))}
          </div>

          <div className="preview-actions">
            <button 
              className="apply-button"
              onClick={handleApplyStandardization}
              disabled={applying}
            >
              {applying ? 'Applying...' : '✓ Apply Changes'}
            </button>
            <button 
              className="back-button"
              onClick={handleBackFromPreview}
              disabled={applying}
            >
              ← Go Back
            </button>
          </div>
        </div>
      )}

      {/* Applying state */}
      {applying && (
        <div className="standardization-loading">
          <div className="spinner"></div>
          <p>Applying standardization changes...</p>
        </div>
      )}

      {/* Messages */}
      {message.text && (
        <div className={`standardization-message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};

export default PlaceNameStandardization;
