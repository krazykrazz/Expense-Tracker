import { useState } from 'react';
import './SearchBar.css';

const SearchBar = ({ onSearchChange }) => {
  const [searchText, setSearchText] = useState('');

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    
    // Emit search text to parent component
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  const handleClear = () => {
    setSearchText('');
    if (onSearchChange) {
      onSearchChange('');
    }
  };

  return (
    <div className="search-bar-container">
      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="Search by place or notes..."
          value={searchText}
          onChange={handleSearchChange}
        />
        {searchText && (
          <button 
            className="clear-button" 
            onClick={handleClear}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
