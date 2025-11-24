import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BudgetProgressBar from './BudgetProgressBar';

describe('BudgetProgressBar', () => {
  describe('Unit Tests', () => {
    // Test color coding logic
    describe('Color Coding', () => {
      it('should apply safe status (green) for progress < 80%', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={500}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        expect(progressBar.classList.contains('progress-safe')).toBe(true);
      });

      it('should apply warning status (yellow) for progress 80-89%', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={850}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        expect(progressBar.classList.contains('progress-warning')).toBe(true);
      });

      it('should apply danger status (orange) for progress 90-99%', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={950}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        expect(progressBar.classList.contains('progress-danger')).toBe(true);
      });

      it('should apply critical status (red) for progress >= 100%', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1000}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        expect(progressBar.classList.contains('progress-critical')).toBe(true);
      });

      it('should apply critical status for overspending', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1200}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        expect(progressBar.classList.contains('progress-critical')).toBe(true);
      });
    });

    // Test percentage calculation display
    describe('Percentage Calculation', () => {
      it('should display correct percentage for 50% progress', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={500}
            showAlert={true}
          />
        );
        
        const percentage = container.querySelector('.progress-percentage');
        expect(percentage.textContent).toBe('50.0%');
      });

      it('should display correct percentage for 100% progress', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1000}
            showAlert={true}
          />
        );
        
        const percentage = container.querySelector('.progress-percentage');
        expect(percentage.textContent).toBe('100.0%');
      });

      it('should display percentage > 100% for overspending', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1250}
            showAlert={true}
          />
        );
        
        const percentage = container.querySelector('.progress-percentage');
        expect(percentage.textContent).toBe('125.0%');
      });

      it('should display 0% when no spending', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={0}
            showAlert={true}
          />
        );
        
        const percentage = container.querySelector('.progress-percentage');
        expect(percentage.textContent).toBe('0.0%');
      });

      it('should handle decimal percentages correctly', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={333.33}
            showAlert={true}
          />
        );
        
        const percentage = container.querySelector('.progress-percentage');
        expect(percentage.textContent).toBe('33.3%');
      });
    });

    // Test alert indicator display
    describe('Alert Indicators', () => {
      it('should not show alert indicator when progress < 80%', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={500}
            showAlert={true}
          />
        );
        
        const alertIndicator = container.querySelector('.alert-indicator');
        expect(alertIndicator).toBeNull();
      });

      it('should show warning alert at 80% progress', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={800}
            showAlert={true}
          />
        );
        
        const alertIndicator = container.querySelector('.alert-indicator');
        expect(alertIndicator).not.toBeNull();
        expect(alertIndicator.classList.contains('alert-warning')).toBe(true);
      });

      it('should show danger alert at 90% progress', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={900}
            showAlert={true}
          />
        );
        
        const alertIndicator = container.querySelector('.alert-indicator');
        expect(alertIndicator).not.toBeNull();
        expect(alertIndicator.classList.contains('alert-danger')).toBe(true);
      });

      it('should show critical alert at 100% progress', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1000}
            showAlert={true}
          />
        );
        
        const alertIndicator = container.querySelector('.alert-indicator');
        expect(alertIndicator).not.toBeNull();
        expect(alertIndicator.classList.contains('alert-critical')).toBe(true);
      });

      it('should not show alert when showAlert is false', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={900}
            showAlert={false}
          />
        );
        
        const alertIndicator = container.querySelector('.alert-indicator');
        expect(alertIndicator).toBeNull();
      });
    });

    // Test overflow handling
    describe('Overflow Handling', () => {
      it('should cap progress bar width at 100% for overspending', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1500}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        const width = progressBar.style.width;
        expect(width).toBe('100%');
      });

      it('should display "over budget" text for overspending', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1200}
            showAlert={true}
          />
        );
        
        const overageText = container.querySelector('.overage-amount');
        expect(overageText).not.toBeNull();
        expect(overageText.textContent).toContain('over budget');
      });

      it('should display correct overage amount', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={1200}
            showAlert={true}
          />
        );
        
        const overageText = container.querySelector('.overage-amount');
        expect(overageText.textContent).toContain('$200.00');
      });

      it('should display "remaining" text when under budget', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={600}
            showAlert={true}
          />
        );
        
        const remainingText = container.querySelector('.remaining-amount');
        expect(remainingText).not.toBeNull();
        expect(remainingText.textContent).toContain('remaining');
      });

      it('should display correct remaining amount', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={600}
            showAlert={true}
          />
        );
        
        const remainingText = container.querySelector('.remaining-amount');
        expect(remainingText.textContent).toContain('$400.00');
      });
    });

    // Test accessibility
    describe('Accessibility', () => {
      it('should have proper ARIA attributes', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={500}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        expect(progressBar.getAttribute('role')).toBe('progressbar');
        expect(progressBar.getAttribute('aria-valuenow')).toBe('50');
        expect(progressBar.getAttribute('aria-valuemin')).toBe('0');
        expect(progressBar.getAttribute('aria-valuemax')).toBe('100');
      });

      it('should have descriptive aria-label', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={500}
            showAlert={true}
          />
        );
        
        const progressBar = container.querySelector('.progress-bar-fill');
        const ariaLabel = progressBar.getAttribute('aria-label');
        expect(ariaLabel).toContain('Groceries');
        expect(ariaLabel).toContain('50.0%');
      });
    });

    // Test currency formatting
    describe('Currency Formatting', () => {
      it('should format amounts as Canadian currency', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1234.56}
            spent={567.89}
            showAlert={true}
          />
        );
        
        const amounts = container.querySelector('.progress-amounts');
        expect(amounts.textContent).toContain('$567.89');
        expect(amounts.textContent).toContain('$1,234.56');
      });

      it('should display amounts with 2 decimal places', () => {
        const { container } = render(
          <BudgetProgressBar 
            category="Groceries"
            budgetLimit={1000}
            spent={500.5}
            showAlert={true}
          />
        );
        
        const amounts = container.querySelector('.progress-amounts');
        expect(amounts.textContent).toContain('$500.50');
      });
    });
  });
});

