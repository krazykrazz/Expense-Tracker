# Design Document

## Overview

This feature enhances the existing income source tracking system by introducing categorization. Users will be able to classify each income source into one of four predefined categories: Salary, Government, Gifts, or Other. This categorization enables better income analysis, reporting on the annual summary, and understanding of income composition over time.

The implementation requires a database schema change (adding a category column), updates to the backend service and repository layers, frontend UI enhancements in the Income Management Modal, and new visualizations on the Annual Summary page.

## Architecture

The solution follows the existing layered architecture pattern:

**Frontend Components → Backend Controller → Service Layer → Repository Layer → Database**

### Key Components

1. **Database Layer**: Add `category` column to `income_sources` table
2. **Repository Layer**: Update `IncomeRepository` to handle category field
3. **Service Layer**: Update `IncomeService` to validate category values
4. **Controller Layer**: Update `IncomeController` to accept category in requests
5. **Frontend Modal**: Update `IncomeManagementModal` to include category selection
6. **Frontend Annual Summary**: Enhance `AnnualSummary` to show income breakdown by category
7. **Migration**: Database migration script to add category column with default value

## Components and Interfaces

### Database Schema Changes

#### Modified Table: income_sources

Add a new `category` column to the existing table:

```sql
ALTER TABLE income_sources 
ADD COLUMN category TEXT NOT NULL DEFAULT 'Other' 
CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other'))
```

**Complete Updated Schema:**
```sql
CREATE TABLE income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  category TEXT NOT NULL DEFAULT 'Other' CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

**Index (existing):**
```sql
CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)
```

#### Migration Strategy

Create a new migration function `migrateAddIncomeCategoryColumn` that:
1. Checks if migration has been applied using `checkMigrationApplied`
2. Creates automatic backup using `createBackup`
3. Adds the category column with default value 'Other' (to match fixed expenses pattern)
4. Marks migration as applied using `markMigrationApplied`
5. Uses idempotent approach (safe to run multiple times)
6. Runs automatically on Docker container startup via `runMigrations()` in `db.js`

**Note:** The default category is 'Other' to align with the existing pattern used for fixed expenses, where uncategorized items default to 'Other'.


### Backend Components

#### Constants

**File**: `backend/utils/constants.js` (or create if doesn't exist)

```javascript
const INCOME_CATEGORIES = ['Salary', 'Government', 'Gifts', 'Other'];

module.exports = {
  INCOME_CATEGORIES
};
```

#### IncomeRepository Updates

**File**: `backend/repositories/incomeRepository.js`

**Modified Methods:**

```javascript
/**
 * Get all income sources for a specific month (now includes category)
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Array>} Array of income source objects with category
 */
async getIncomeSources(year, month) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id, year, month, name, amount, category, created_at, updated_at
      FROM income_sources
      WHERE year = ? AND month = ?
      ORDER BY category ASC, created_at ASC
    `;
    
    db.all(sql, [year, month], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

/**
 * Get income totals by category for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Object with category totals
 */
async getIncomeByCategoryForMonth(year, month) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM income_sources
      WHERE year = ? AND month = ?
      GROUP BY category
    `;
    
    db.all(sql, [year, month], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Convert array to object
      const result = {};
      rows.forEach(row => {
        result[row.category] = parseFloat(row.total.toFixed(2));
      });
      
      resolve(result);
    });
  });
}

/**
 * Get income totals by category for entire year
 * @param {number} year - Year
 * @returns {Promise<Object>} Object with category totals for the year
 */
async getIncomeByCategoryForYear(year) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM income_sources
      WHERE year = ?
      GROUP BY category
    `;
    
    db.all(sql, [year], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Convert array to object
      const result = {};
      rows.forEach(row => {
        result[row.category] = parseFloat(row.total.toFixed(2));
      });
      
      resolve(result);
    });
  });
}

/**
 * Create a new income source (now includes category)
 * @param {Object} incomeSource - { year, month, name, amount, category }
 * @returns {Promise<Object>} Created income source with ID
 */
async createIncomeSource(incomeSource) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO income_sources (year, month, name, amount, category)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const params = [
      incomeSource.year,
      incomeSource.month,
      incomeSource.name,
      incomeSource.amount,
      incomeSource.category || 'Salary'  // Default to Salary if not provided
    ];
    
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      
      // Return the created income source with its ID
      resolve({
        id: this.lastID,
        ...incomeSource,
        category: incomeSource.category || 'Salary'
      });
    });
  });
}

/**
 * Update an income source by ID (now includes category)
 * @param {number} id - Income source ID
 * @param {Object} updates - { name, amount, category }
 * @returns {Promise<Object|null>} Updated income source or null if not found
 */
async updateIncomeSource(id, updates) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE income_sources
      SET name = ?, amount = ?, category = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const params = [
      updates.name,
      updates.amount,
      updates.category,
      id
    ];
    
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      
      if (this.changes === 0) {
        resolve(null); // No rows updated, income source not found
        return;
      }
      
      // Fetch and return the updated income source
      db.get('SELECT * FROM income_sources WHERE id = ?', [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  });
}

/**
 * Copy income sources from previous month (preserves categories)
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @returns {Promise<Array>} Array of created income sources
 */
async copyFromPreviousMonth(year, month) {
  const db = await getDatabase();
  
  // Calculate previous month
  let prevYear = year;
  let prevMonth = month - 1;
  
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  
  return new Promise((resolve, reject) => {
    // First, get income sources from previous month
    const selectSql = `
      SELECT name, amount, category
      FROM income_sources
      WHERE year = ? AND month = ?
      ORDER BY created_at ASC
    `;
    
    db.all(selectSql, [prevYear, prevMonth], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!rows || rows.length === 0) {
        resolve([]);
        return;
      }
      
      // Insert each source into the target month
      const insertSql = `
        INSERT INTO income_sources (year, month, name, amount, category)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const createdSources = [];
      let completed = 0;
      
      rows.forEach((row) => {
        db.run(insertSql, [year, month, row.name, row.amount, row.category], function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          createdSources.push({
            id: this.lastID,
            year,
            month,
            name: row.name,
            amount: row.amount,
            category: row.category
          });
          
          completed++;
          if (completed === rows.length) {
            resolve(createdSources);
          }
        });
      });
    });
  });
}
```


#### IncomeService Updates

**File**: `backend/services/incomeService.js`

**Modified Methods:**

```javascript
const { INCOME_CATEGORIES } = require('../utils/constants');

/**
 * Validate income source data (now includes category validation)
 * @param {Object} incomeSource - Income source data to validate
 * @throws {Error} If validation fails
 */
validateIncomeSource(incomeSource) {
  const errors = [];

  // Existing validations...
  if (!incomeSource.name || incomeSource.name.trim() === '') {
    errors.push('Name is required');
  }

  if (incomeSource.amount === undefined || incomeSource.amount === null) {
    errors.push('Amount is required');
  }

  if (incomeSource.name && incomeSource.name.length > 100) {
    errors.push('Name must not exceed 100 characters');
  }

  if (incomeSource.amount !== undefined && incomeSource.amount !== null) {
    const amount = parseFloat(incomeSource.amount);
    if (isNaN(amount)) {
      errors.push('Amount must be a valid number');
    } else if (amount < 0) {
      errors.push('Amount must be a non-negative number');
    }
    if (!/^\d+(\.\d{1,2})?$/.test(incomeSource.amount.toString())) {
      errors.push('Amount must have at most 2 decimal places');
    }
  }

  // NEW: Category validation
  if (incomeSource.category) {
    if (!INCOME_CATEGORIES.includes(incomeSource.category)) {
      errors.push(`Category must be one of: ${INCOME_CATEGORIES.join(', ')}`);
    }
  }

  // Year and month validation (when provided)
  if (incomeSource.year !== undefined) {
    const year = parseInt(incomeSource.year);
    if (isNaN(year)) {
      errors.push('Year must be a valid number');
    }
  }

  if (incomeSource.month !== undefined) {
    const month = parseInt(incomeSource.month);
    if (isNaN(month) || month < 1 || month > 12) {
      errors.push('Month must be between 1 and 12');
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

/**
 * Get all income sources for a month with total and category breakdown
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { sources: Array, total: number, byCategory: Object }
 */
async getMonthlyIncome(year, month) {
  // Validate year and month
  validateYearMonth(year, month);

  const yearNum = parseInt(year);
  const monthNum = parseInt(month);

  if (isNaN(yearNum) || isNaN(monthNum)) {
    throw new Error('Year and month must be valid numbers');
  }

  if (monthNum < 1 || monthNum > 12) {
    throw new Error('Month must be between 1 and 12');
  }

  // Fetch income sources, total, and category breakdown from repository
  const sources = await incomeRepository.getIncomeSources(yearNum, monthNum);
  const total = await incomeRepository.getTotalMonthlyGross(yearNum, monthNum);
  const byCategory = await incomeRepository.getIncomeByCategoryForMonth(yearNum, monthNum);

  return {
    sources,
    total,
    byCategory
  };
}

/**
 * Create a new income source (now includes category)
 * @param {Object} data - { year, month, name, amount, category }
 * @returns {Promise<Object>} Created income source
 */
async createIncomeSource(data) {
  // Validate required fields
  if (!data.year || !data.month) {
    throw new Error('Year and month are required');
  }

  // Validate the income source data
  this.validateIncomeSource(data);

  // Prepare income source object
  const incomeSource = {
    year: parseInt(data.year),
    month: parseInt(data.month),
    name: data.name.trim(),
    amount: parseFloat(data.amount),
    category: data.category || 'Salary'  // Default to Salary
  };

  // Create income source in repository
  return await incomeRepository.createIncomeSource(incomeSource);
}

/**
 * Update an income source (now includes category)
 * @param {number} id - Income source ID
 * @param {Object} data - { name, amount, category }
 * @returns {Promise<Object|null>} Updated income source or null if not found
 */
async updateIncomeSource(id, data) {
  // Validate ID
  if (!id) {
    throw new Error('Income source ID is required');
  }

  // Validate the income source data
  this.validateIncomeSource(data);

  // Prepare updates object
  const updates = {
    name: data.name.trim(),
    amount: parseFloat(data.amount),
    category: data.category || 'Salary'
  };

  // Update income source in repository
  return await incomeRepository.updateIncomeSource(id, updates);
}

/**
 * Get annual income breakdown by category
 * @param {number} year - Year
 * @returns {Promise<Object>} Category breakdown for the year
 */
async getAnnualIncomeByCategory(year) {
  const yearNum = parseInt(year);
  
  if (isNaN(yearNum)) {
    throw new Error('Year must be a valid number');
  }

  return await incomeRepository.getIncomeByCategoryForYear(yearNum);
}
```


#### IncomeController Updates

**File**: `backend/controllers/incomeController.js`

**Modified Methods:**

```javascript
/**
 * GET /api/income/:year/:month
 * Get all income sources for a specific month (now includes category breakdown)
 */
async getMonthlyIncome(req, res) {
  try {
    const { year, month } = req.params;
    const data = await incomeService.getMonthlyIncome(year, month);
    
    // Response now includes: { sources, total, byCategory }
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/income
 * Create a new income source (now accepts category)
 * Body: { year, month, name, amount, category }
 */
async createIncomeSource(req, res) {
  try {
    const { year, month, name, amount, category } = req.body;
    
    const createdSource = await incomeService.createIncomeSource({
      year,
      month,
      name,
      amount,
      category: category || 'Salary'  // Default to Salary
    });
    
    res.status(201).json(createdSource);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * PUT /api/income/:id
 * Update an income source (now accepts category)
 * Body: { name, amount, category }
 */
async updateIncomeSource(req, res) {
  try {
    const { id } = req.params;
    const { name, amount, category } = req.body;
    
    const updatedSource = await incomeService.updateIncomeSource(id, {
      name,
      amount,
      category
    });
    
    if (!updatedSource) {
      return res.status(404).json({ error: 'Income source not found' });
    }
    
    res.json(updatedSource);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * GET /api/income/annual/:year/by-category
 * Get annual income breakdown by category
 */
async getAnnualIncomeByCategory(req, res) {
  try {
    const { year } = req.params;
    const byCategory = await incomeService.getAnnualIncomeByCategory(year);
    
    res.json(byCategory);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
```

**New Route:**

**File**: `backend/routes/incomeRoutes.js`

```javascript
// Add new route for annual category breakdown
router.get('/annual/:year/by-category', incomeController.getAnnualIncomeByCategory);
```


### Frontend Components

#### Income Management Modal Updates

**File**: `frontend/src/components/IncomeManagementModal.jsx`

**State Changes:**

```javascript
// Add category state for new income source
const [newSourceCategory, setNewSourceCategory] = useState('Salary');

// Add category state for editing
const [editCategory, setEditCategory] = useState('');
```

**Modified Functions:**

```javascript
const handleAddSource = async () => {
  // ... existing validation ...
  
  try {
    const createdSource = await createIncomeSource({
      year,
      month,
      name: newSourceName.trim(),
      amount,
      category: newSourceCategory  // Include category
    });
    
    // ... rest of function ...
    
    // Reset form including category
    setNewSourceName('');
    setNewSourceAmount('');
    setNewSourceCategory('Salary');  // Reset to default
    setIsAdding(false);
  } catch (err) {
    // ... error handling ...
  }
};

const handleEditSource = (source) => {
  setEditingId(source.id);
  setEditName(source.name);
  setEditAmount(source.amount.toString());
  setEditCategory(source.category);  // Set category for editing
};

const handleSaveEdit = async () => {
  // ... existing validation ...
  
  try {
    const updatedSource = await updateIncomeSource(editingId, {
      name: editName.trim(),
      amount,
      category: editCategory  // Include category
    });
    
    // ... rest of function ...
    
    // Reset edit state including category
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    setEditCategory('');
  } catch (err) {
    // ... error handling ...
  }
};
```

**UI Changes:**

```jsx
{/* Category breakdown display */}
{byCategory && Object.keys(byCategory).length > 0 && (
  <div className="income-category-breakdown">
    <h4>By Category</h4>
    <div className="category-breakdown-grid">
      {Object.entries(byCategory).map(([category, amount]) => (
        <div key={category} className="category-breakdown-item">
          <span className="category-icon">{getCategoryIcon(category)}</span>
          <span className="category-name">{category}</span>
          <span className="category-amount">${amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  </div>
)}

{/* Income source list with category badges */}
{incomeSources.map((source) => (
  <div key={source.id} className="income-source-item">
    {editingId === source.id ? (
      <div className="income-source-edit">
        {/* ... existing name and amount inputs ... */}
        
        {/* Category selector for editing */}
        <select
          value={editCategory}
          onChange={(e) => setEditCategory(e.target.value)}
          className="income-edit-category"
          disabled={loading}
        >
          <option value="Salary">Salary</option>
          <option value="Government">Government</option>
          <option value="Gifts">Gifts</option>
          <option value="Other">Other</option>
        </select>
        
        {/* ... save and cancel buttons ... */}
      </div>
    ) : (
      <div className="income-source-display">
        <div className="income-source-header">
          <span className={`category-badge category-${source.category.toLowerCase()}`}>
            {source.category}
          </span>
          <span className="income-source-name">{source.name}</span>
        </div>
        <span className="income-source-amount">
          ${parseFloat(source.amount).toFixed(2)}
        </span>
        {/* ... edit and delete buttons ... */}
      </div>
    )}
  </div>
))}

{/* Add form with category selector */}
{isAdding && (
  <div className="income-add-form">
    {/* ... existing name input ... */}
    
    {/* Category selector */}
    <select
      value={newSourceCategory}
      onChange={(e) => setNewSourceCategory(e.target.value)}
      className="income-add-category"
      disabled={loading}
    >
      <option value="Salary">Salary</option>
      <option value="Government">Government</option>
      <option value="Gifts">Gifts</option>
      <option value="Other">Other</option>
    </select>
    
    {/* ... existing amount input and buttons ... */}
  </div>
)}
```

**Helper Function:**

```javascript
const getCategoryIcon = (category) => {
  const icons = {
    'Salary': '💼',
    'Government': '🏛️',
    'Gifts': '🎁',
    'Other': '💰'
  };
  return icons[category] || '💰';
};
```


#### Income Management Modal CSS Updates

**File**: `frontend/src/components/IncomeManagementModal.css`

**New Styles:**

```css
/* Category breakdown section */
.income-category-breakdown {
  margin: 20px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.income-category-breakdown h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #495057;
}

.category-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.category-breakdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: white;
  border-radius: 6px;
  font-size: 13px;
}

.category-icon {
  font-size: 18px;
}

.category-name {
  flex: 1;
  font-weight: 500;
  color: #495057;
}

.category-amount {
  font-weight: 600;
  color: #28a745;
}

/* Category badges */
.income-source-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.category-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.category-salary {
  background-color: #e3f2fd;
  color: #1976d2;
}

.category-government {
  background-color: #f3e5f5;
  color: #7b1fa2;
}

.category-gifts {
  background-color: #fff3e0;
  color: #f57c00;
}

.category-other {
  background-color: #e8f5e9;
  color: #388e3c;
}

/* Category selector in forms */
.income-add-category,
.income-edit-category {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  cursor: pointer;
}

.income-add-category:focus,
.income-edit-category:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.income-add-category:disabled,
.income-edit-category:disabled {
  background-color: #e9ecef;
  cursor: not-allowed;
}
```


#### Annual Summary Updates

**File**: `frontend/src/components/AnnualSummary.jsx`

**State Changes:**

```javascript
const [incomeByCategory, setIncomeByCategory] = useState(null);
```

**Fetch Function Update:**

```javascript
const fetchAnnualSummary = async () => {
  setLoading(true);
  setError(null);

  try {
    // Fetch annual summary
    const summaryResponse = await fetch(`/api/expenses/annual-summary?year=${year}`);
    if (!summaryResponse.ok) {
      throw new Error('Failed to fetch annual summary');
    }
    const summaryData = await summaryResponse.json();
    setSummary(summaryData);

    // Fetch income by category
    const incomeCategoryResponse = await fetch(`/api/income/annual/${year}/by-category`);
    if (incomeCategoryResponse.ok) {
      const categoryData = await incomeCategoryResponse.json();
      setIncomeByCategory(categoryData);
    }
  } catch (err) {
    setError(err.message);
    console.error('Error fetching annual summary:', err);
  } finally {
    setLoading(false);
  }
};
```

**New UI Section:**

```jsx
{/* Income by Category Section */}
{incomeByCategory && Object.keys(incomeByCategory).length > 0 && (
  <div className="summary-section">
    <h3>Income by Category</h3>
    <div className="category-grid">
      {Object.entries(incomeByCategory).map(([category, total]) => (
        <div key={category} className="category-item income-category-item">
          <div className="category-icon-large">{getCategoryIcon(category)}</div>
          <div className="category-name">{category}</div>
          <div className="category-amount">${formatAmount(total)}</div>
          <div className="category-percentage">
            {summary.totalIncome > 0 
              ? ((total / summary.totalIncome) * 100).toFixed(1) 
              : 0}%
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

**Helper Function:**

```javascript
const getCategoryIcon = (category) => {
  const icons = {
    'Salary': '💼',
    'Government': '🏛️',
    'Gifts': '🎁',
    'Other': '💰'
  };
  return icons[category] || '💰';
};
```

**Enhanced Monthly Chart (Optional):**

For showing income breakdown by category in the monthly chart, we can add stacked bars similar to how expenses are shown:

```jsx
{/* Income Bar - Stacked by Category */}
{(month.income || 0) > 0 && (
  <div className="bar-wrapper">
    <div className="horizontal-stacked-bar income-stacked-bar" style={{ width: `${incomeWidth}%` }}>
      {month.incomeByCategory && Object.entries(month.incomeByCategory).map(([category, amount]) => {
        const categoryWidth = ((amount / month.income) * 100);
        return categoryWidth > 0 ? (
          <div 
            key={category}
            className={`horizontal-segment income-segment-${category.toLowerCase()}`}
            style={{ width: `${categoryWidth}%` }}
            title={`${category}: ${formatAmount(amount)}`}
          >
            {categoryWidth > 15 && <span className="bar-value">${formatAmount(amount)}</span>}
          </div>
        ) : null;
      })}
    </div>
  </div>
)}
```


#### Annual Summary CSS Updates

**File**: `frontend/src/components/AnnualSummary.css`

**New Styles:**

```css
/* Income category items */
.income-category-item {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.income-category-item .category-name,
.income-category-item .category-amount,
.income-category-item .category-percentage {
  color: white;
}

.category-icon-large {
  font-size: 32px;
  margin-bottom: 8px;
}

/* Income stacked bar segments */
.income-stacked-bar {
  background: transparent;
}

.income-segment-salary {
  background-color: #1976d2;
}

.income-segment-government {
  background-color: #7b1fa2;
}

.income-segment-gifts {
  background-color: #f57c00;
}

.income-segment-other {
  background-color: #388e3c;
}
```

### Database Migration

**File**: `backend/database/migrations.js`

**New Migration Function:**

```javascript
/**
 * Migration: Add category column to income_sources table
 */
async function migrateAddIncomeCategoryColumn(db) {
  const migrationName = 'add_income_category_column_v1';
  
  // Check if already applied
  const isApplied = await checkMigrationApplied(db, migrationName);
  if (isApplied) {
    console.log(`✓ Migration "${migrationName}" already applied, skipping`);
    return;
  }

  console.log(`Running migration: ${migrationName}`);

  // Create backup
  await createBackup();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          return reject(err);
        }

        // Check if income_sources table exists
        db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='income_sources'",
          (err, row) => {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (!row) {
              console.log('ℹ income_sources table does not exist, skipping migration');
              markMigrationApplied(db, migrationName).then(() => {
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  console.log(`✓ Migration "${migrationName}" completed successfully`);
                  resolve();
                });
              }).catch(reject);
              return;
            }

            // Check if category column already exists
            db.all('PRAGMA table_info(income_sources)', (err, columns) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }

              const hasCategory = columns.some(col => col.name === 'category');

              if (hasCategory) {
                console.log('✓ income_sources already has category column');
                markMigrationApplied(db, migrationName).then(() => {
                  db.run('COMMIT', (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    console.log(`✓ Migration "${migrationName}" completed successfully`);
                    resolve();
                  });
                }).catch(reject);
                return;
              }

              // Add category column with default value 'Other'
              db.run(`
                ALTER TABLE income_sources 
                ADD COLUMN category TEXT NOT NULL DEFAULT 'Other' 
                CHECK(category IN ('Salary', 'Government', 'Gifts', 'Other'))
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                console.log('✓ Added category column to income_sources');

                // Count updated records
                db.get('SELECT COUNT(*) as count FROM income_sources', (err, row) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }

                  const recordCount = row ? row.count : 0;
                  if (recordCount > 0) {
                    console.log(`✓ Updated ${recordCount} existing income source(s) with default category 'Other'`);
                  }

                  // Mark migration as applied and commit
                  markMigrationApplied(db, migrationName).then(() => {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      console.log(`✓ Migration "${migrationName}" completed successfully`);
                      resolve();
                    });
                  }).catch(reject);
                });
              });
            });
          }
        );
      });
    });
  });
}
```

**Update runMigrations function:**

```javascript
async function runMigrations(db) {
  console.log('\n--- Checking for pending migrations ---');
  
  try {
    await migrateExpandCategories(db);
    await migrateAddClothingCategory(db);
    await migrateRemoveRecurringExpenses(db);
    await migrateFixCategoryConstraints(db);
    await migrateAddPersonalCareCategory(db);
    await migrateAddCategoryAndPaymentTypeToFixedExpenses(db);
    await migrateAddIncomeCategoryColumn(db);  // NEW MIGRATION
    console.log('✓ All migrations completed\n');
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    throw error;
  }
}
```

## Data Models

### Income Source Object (Updated)

```javascript
{
  id: number,              // Primary key
  year: number,            // Year (e.g., 2025)
  month: number,           // Month 1-12
  name: string,            // Income source name (e.g., "Main Job")
  amount: number,          // Income amount (non-negative, 2 decimals)
  category: string,        // Category: 'Salary', 'Government', 'Gifts', 'Other'
  created_at: string,      // ISO timestamp
  updated_at: string       // ISO timestamp
}
```

### Monthly Income Response (Updated)

```javascript
{
  sources: [               // Array of income source objects
    {
      id: 1,
      year: 2025,
      month: 11,
      name: "Main Job",
      amount: 5000.00,
      category: "Salary",
      created_at: "2025-11-01T00:00:00Z",
      updated_at: "2025-11-01T00:00:00Z"
    },
    {
      id: 2,
      year: 2025,
      month: 11,
      name: "EI Benefits",
      amount: 800.00,
      category: "Government",
      created_at: "2025-11-05T00:00:00Z",
      updated_at: "2025-11-05T00:00:00Z"
    }
  ],
  total: 5800.00,          // Sum of all source amounts
  byCategory: {            // Breakdown by category
    "Salary": 5000.00,
    "Government": 800.00
  }
}
```

### Annual Income by Category Response

```javascript
{
  "Salary": 60000.00,
  "Government": 9600.00,
  "Gifts": 500.00,
  "Other": 1200.00
}
```

## Error Handling

### Backend Error Responses

All errors return JSON with consistent structure:
```javascript
{
  error: string  // Human-readable error message
}
```

**HTTP Status Codes:**
- 200: Success
- 201: Created
- 400: Bad Request (validation errors)
- 404: Not Found
- 500: Internal Server Error

### Validation Error Messages

- "Category must be one of: Salary, Government, Gifts, Other"
- "Category is required"
- (All existing validation messages remain)

### Frontend Error Handling

- Display validation errors for category selection
- Handle API errors gracefully
- Show loading states during category-related operations
- Provide user-friendly error messages

## Testing Strategy

### Backend Testing

**Unit Tests:**
- Repository: Test category filtering and grouping queries
- Service: Test category validation logic
- Controller: Test category parameter handling

**Integration Tests:**
- Test creating income sources with different categories
- Test updating income source categories
- Test category breakdown calculations
- Test carry-forward preserves categories
- Test migration adds column correctly

### Frontend Testing

**Manual Testing:**
1. Add income sources with each category type
2. Edit income source categories
3. Verify category badges display correctly
4. Verify category breakdown shows in modal
5. Verify annual summary shows income by category
6. Test carry-forward preserves categories
7. Test category dropdown accessibility
8. Test responsive design with category elements

### Migration Testing

1. Test migration on database without category column
2. Test migration on database with existing income sources
3. Verify all existing sources get default 'Salary' category
4. Test migration idempotency (safe to run multiple times)
5. Verify backup is created before migration

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

Before defining properties, let's eliminate redundancy:

- Properties 1.3 and 3.5 both test category validation - combine into one
- Properties 1.5 and 3.3 both test round-trip persistence - can be combined
- Properties 2.1 and 2.4 both test category display in UI - combine
- Properties 6.1 and 6.2 are identical - keep only one
- Property 1.2 and 3.2 both test valid category values - combine

After reflection, we have the following unique properties:

Property 1: Category validation accepts only valid values
*For any* income source creation or update, the system should accept only the four valid categories (Salary, Government, Gifts, Other) and reject any other values
**Validates: Requirements 1.2, 3.2**

Property 2: Category persistence round-trip
*For any* income source with a category, creating or updating it and then retrieving it should return the same category value
**Validates: Requirements 1.5, 3.3**

Property 3: Category sorting
*For any* set of income sources, when retrieved for a month, they should be ordered by category
**Validates: Requirements 2.3**

Property 4: Category subtotal calculation
*For any* month with income sources, the sum of category subtotals should equal the total monthly income, and each category subtotal should equal the sum of amounts for sources in that category
**Validates: Requirements 2.5, 3.4**

Property 5: Annual category aggregation
*For any* year with income sources, the annual total for each category should equal the sum of all monthly amounts for that category across all 12 months
**Validates: Requirements 4.2**

Property 6: Carry-forward preserves categories
*For any* month with income sources, copying to the next month should create new sources with identical categories
**Validates: Requirements 6.1, 6.2**

Property 7: Migration default assignment
*For any* existing income source without a category, the migration should assign the default category 'Other'
**Validates: Requirements 7.2**

Property 8: Migration idempotence
*For any* database state, running the migration twice should produce the same result as running it once
**Validates: Requirements 7.3**

Property 9: Post-migration category invariant
*For any* income source after migration, it should have a non-null category value from the valid set
**Validates: Requirements 7.4**

## Implementation Notes

### Backward Compatibility

- The migration adds a column with a default value, so existing code continues to work
- The default 'Other' category ensures all existing income sources have a valid category (matching the pattern used for fixed expenses)
- API endpoints remain backward compatible (category is optional in requests, defaults to 'Other')
- Migration runs automatically on Docker container startup through the existing `runMigrations()` function in `db.js`

### Performance Considerations

- Category filtering uses existing year/month index
- Category grouping is done at database level using GROUP BY
- No additional indexes needed for category column (low cardinality)

### Future Enhancements

- Allow custom income categories (user-defined)
- Add category-based budgeting for income goals
- Export income by category to CSV
- Multi-year category trend analysis
- Category-based income forecasting

## Deployment Checklist

1. Migration runs automatically on Docker container startup (no manual intervention needed)
2. Verify all existing income sources have 'Other' category after migration
3. Test API endpoints with category parameter
4. Verify frontend displays categories correctly
5. Test annual summary shows income breakdown
6. Verify carry-forward preserves categories
7. Update API documentation if needed
8. Monitor for any migration issues in production logs
