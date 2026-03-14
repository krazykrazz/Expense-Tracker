import './VersionUpgradeModal.css';

/**
 * Modal that displays changelog after a version upgrade.
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Callback when modal is closed
 * @param {string} newVersion - New version number
 * @param {Array} changelogEntries - Changelog entries to display
 */
function VersionUpgradeModal({ isOpen, onClose, newVersion, changelogEntries }) {
  if (!isOpen) return null;

  const entries = changelogEntries || [];

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Version ${newVersion} upgrade details`}>
      <div className="version-upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="version-upgrade-header">
          <div className="version-upgrade-title-section">
            <h2>🎉 Updated to v{newVersion}</h2>
            <span className="version-upgrade-badge">New Version</span>
          </div>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close upgrade notification"
          >
            ×
          </button>
        </div>

        <div className="version-upgrade-body">
          {entries.length > 0 ? (
            <div className="changelog">
              {entries.map((entry, index) => (
                <div key={index} className="changelog-entry">
                  <div className="changelog-version">v{entry.version}</div>
                  <div className="changelog-date">{entry.date}</div>

                  {entry.added && entry.added.length > 0 && (
                    <>
                      <h4 className="changelog-category added">Added</h4>
                      <ul className="changelog-items">
                        {entry.added.map((item, i) => (
                          <li key={`added-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {entry.changed && entry.changed.length > 0 && (
                    <>
                      <h4 className="changelog-category changed">Changed</h4>
                      <ul className="changelog-items">
                        {entry.changed.map((item, i) => (
                          <li key={`changed-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {entry.fixed && entry.fixed.length > 0 && (
                    <>
                      <h4 className="changelog-category fixed">Fixed</h4>
                      <ul className="changelog-items">
                        {entry.fixed.map((item, i) => (
                          <li key={`fixed-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {entry.removed && entry.removed.length > 0 && (
                    <>
                      <h4 className="changelog-category removed">Removed</h4>
                      <ul className="changelog-items">
                        {entry.removed.map((item, i) => (
                          <li key={`removed-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="version-upgrade-fallback">See changelog for details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default VersionUpgradeModal;
