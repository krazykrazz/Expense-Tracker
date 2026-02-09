/**
 * Script to fix remaining ExpenseForm test failures
 * 
 * This script adds section expansion logic to tests that need to access
 * fields inside collapsible sections.
 */

const fs = require('fs');
const path = require('path');

const testFilePath = path.join(__dirname, 'frontend', 'src', 'components', 'ExpenseForm.test.jsx');
let content = fs.readFileSync(testFilePath, 'utf8');

console.log('Fixing remaining ExpenseForm test failures...\n');

// Track changes
let changesCount = 0;

/**
 * Fix 1: Future Months tests - need to expand Advanced Options section
 * Pattern: Tests accessing future months checkbox/dropdown
 */

// Fix: "should render future months checkbox"
content = content.replace(
  /it\('should render future months checkbox', async \(\) => \{[\s\S]*?expect\(screen\.getByText\(\/add to future months\/i\)\)\.toBeInTheDocument\(\);/m,
  match => {
    if (match.includes('fireEvent.click(advancedOptionsHeader)')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /expect\(screen\.getByText\(\/add to future months\/i\)\)\.toBeInTheDocument\(\);/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Now the checkbox should be visible
    expect(screen.getByText(/add to future months/i)).toBeInTheDocument();`
    );
  }
);

// Fix: "should have future months checkbox unchecked by default"
content = content.replace(
  /it\('should have future months checkbox unchecked by default', async \(\) => \{[\s\S]*?const futureMonthsSection = document\.querySelector\('\.future-months-section'\);[\s\S]*?const checkbox = futureMonthsSection\.querySelector\('input\[type="checkbox"\]'\);/m,
  match => {
    if (match.includes('fireEvent.click(advancedOptionsHeader)')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /const futureMonthsSection = document\.querySelector\('\.future-months-section'\);/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    const futureMonthsSection = document.querySelector('.future-months-section');`
    );
  }
);

// Fix: "should show date range preview when future months checkbox is checked"
content = content.replace(
  /it\('should show date range preview when future months checkbox is checked', async \(\) => \{[\s\S]*?\/\/ Check the future months checkbox/m,
  match => {
    if (match.includes('Expand Advanced Options')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /\/\/ Check the future months checkbox/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox`
    );
  }
);

// Fix: "should reset future months to 0 after successful submission"
content = content.replace(
  /it\('should reset future months to 0 after successful submission', async \(\) => \{[\s\S]*?\/\/ Check the future months checkbox and select 2 months/m,
  match => {
    if (match.includes('Expand Advanced Options')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /\/\/ Check the future months checkbox and select 2 months/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox and select 2 months`
    );
  }
);

// Fix: "should pass futureMonths to createExpense API"
content = content.replace(
  /it\('should pass futureMonths to createExpense API', async \(\) => \{[\s\S]*?\/\/ Check the future months checkbox and select 3 months/m,
  match => {
    if (match.includes('Expand Advanced Options')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /\/\/ Check the future months checkbox and select 3 months/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox and select 3 months`
    );
  }
);

// Fix: "should show success message with future expenses count"
content = content.replace(
  /it\('should show success message with future expenses count', async \(\) => \{[\s\S]*?\/\/ Check the future months checkbox and select 3 months/m,
  match => {
    if (match.includes('Expand Advanced Options')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /\/\/ Check the future months checkbox and select 3 months/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox and select 3 months`
    );
  }
);

// Fix: "should not show preview when future months checkbox is unchecked"
content = content.replace(
  /it\('should not show preview when future months checkbox is unchecked', async \(\) => \{[\s\S]*?\/\/ Check the future months checkbox/m,
  match => {
    if (match.includes('Expand Advanced Options')) {
      return match; // Already fixed
    }
    changesCount++;
    return match.replace(
      /\/\/ Check the future months checkbox/,
      `// Expand Advanced Options section first
    const advancedOptionsHeader = screen.getByRole('button', { name: /Advanced Options/i });
    fireEvent.click(advancedOptionsHeader);

    // Wait for section to expand
    await waitFor(() => {
      expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
    });

    // Check the future months checkbox`
    );
  }
);

console.log(`Applied ${changesCount} fixes to ExpenseForm.test.jsx`);
console.log('\nWriting changes to file...');

// Write the updated content back to the file
fs.writeFileSync(testFilePath, content, 'utf8');

console.log('✓ Successfully fixed remaining test failures');
console.log('\nNext steps:');
console.log('1. Run the tests: cd frontend && npm test -- --testPathPatterns="ExpenseForm.test"');
console.log('2. Verify all tests pass');
