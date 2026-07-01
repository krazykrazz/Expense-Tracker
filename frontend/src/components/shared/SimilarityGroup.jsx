import './SimilarityGroup.css';

/**
 * SimilarityGroup Component
 * 
 * Displays a single group of similar place names with options to select
 * a canonical name from variations or enter a custom name. Individual
 * variations can be excluded from the merge (useful when fuzzy matching
 * groups unrelated names together, e.g. "Topper's" alongside "Shoppers").
 * 
 * @param {Object} props - Component props
 * @param {Object} props.group - Similarity group data
 * @param {string} props.group.id - Unique identifier for the group
 * @param {Array} props.group.variations - Array of place name variations
 * @param {string} props.group.suggestedCanonical - Suggested canonical name
 * @param {number} props.group.totalCount - Total expense count for the group
 * @param {string} props.selectedCanonical - Currently selected canonical name
 * @param {Set<string>} props.excludedVariations - Variation names excluded from the merge
 * @param {Function} props.onSelectCanonical - Callback when canonical name is selected
 * @param {Function} props.onToggleVariation - Callback to include/exclude a variation
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4
 */
const SimilarityGroup = ({
  group,
  selectedCanonical,
  excludedVariations,
  onSelectCanonical,
  onToggleVariation
}) => {
  const excluded = excludedVariations || new Set();

  /**
   * Handle radio button selection
   */
  const handleRadioChange = (variationName) => {
    onSelectCanonical(group.id, variationName);
  };

  /**
   * Handle custom name input
   */
  const handleCustomNameChange = (e) => {
    const customName = e.target.value;
    onSelectCanonical(group.id, customName);
  };

  /**
   * Toggle whether a variation is included in the merge
   */
  const handleIncludeToggle = (variationName) => {
    onToggleVariation(group.id, variationName);
  };

  /**
   * Check if the selected canonical is a custom name (not in variations)
   */
  const isCustomName = selectedCanonical && 
    !group.variations.some(v => v.name === selectedCanonical);

  return (
    <div className="similarity-group">
      {/* Group header with total count */}
      <div className="group-header">
        <span className="group-total">
          Total: {group.totalCount} expenses
        </span>
      </div>

      {/* Display all variations with include checkboxes and canonical radios */}
      <div className="group-variations">
        {group.variations.map(variation => {
          const isExcluded = excluded.has(variation.name);
          const isSuggested = variation.name === group.suggestedCanonical;

          return (
            <div
              key={variation.name}
              className={`variation-option ${isSuggested ? 'suggested' : ''} ${
                isExcluded ? 'excluded' : ''
              }`}
            >
              <input
                type="checkbox"
                className="variation-include"
                checked={!isExcluded}
                onChange={() => handleIncludeToggle(variation.name)}
                aria-label={`Include ${variation.name} in merge`}
                title={isExcluded ? 'Excluded from merge' : 'Included in merge'}
              />
              <label className="variation-label">
                <input
                  type="radio"
                  name={`group-${group.id}`}
                  value={variation.name}
                  checked={selectedCanonical === variation.name}
                  onChange={() => handleRadioChange(variation.name)}
                  disabled={isExcluded}
                />
                <span className="variation-name">{variation.name}</span>
                <span className="variation-count">({variation.count})</span>
                {isSuggested && (
                  <span className="suggested-badge">Suggested</span>
                )}
              </label>
            </div>
          );
        })}
      </div>

      {/* Custom name input */}
      <div className="custom-name-input">
        <label>
          Or enter a custom name:
          <input
            type="text"
            placeholder="Custom canonical name"
            value={isCustomName ? selectedCanonical : ''}
            onChange={handleCustomNameChange}
          />
        </label>
      </div>
    </div>
  );
};

export default SimilarityGroup;
