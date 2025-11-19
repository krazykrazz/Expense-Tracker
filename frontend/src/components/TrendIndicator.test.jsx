import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import TrendIndicator from './TrendIndicator';

describe('TrendIndicator', () => {
  describe('Property-Based Tests', () => {
    // Feature: expense-trend-indicators, Property 4: Tooltip accuracy
    // Validates: Requirements 4.4
    it('should display accurate tooltip text matching calculated percentage change', () => {
      fc.assert(
        fc.property(
          // Generate positive numbers for previous value (avoid zero)
          fc.double({ min: 0.01, max: 10000, noNaN: true }),
          // Generate a multiplier that ensures we're above the 1% threshold
          fc.double({ min: 1.02, max: 10, noNaN: true }),
          (previous, multiplier) => {
            const current = previous * multiplier;
            
            // Calculate expected percentage change
            const percentChange = (current - previous) / previous;
            const expectedTooltip = `+${(percentChange * 100).toFixed(1)}%`;
            
            // Render the component
            const { container } = render(
              <TrendIndicator currentValue={current} previousValue={previous} />
            );
            
            // Find the trend indicator element
            const indicator = container.querySelector('.trend-indicator');
            
            // Should render an indicator (not null)
            expect(indicator).not.toBeNull();
            
            // Tooltip (title attribute) should match expected value
            expect(indicator.getAttribute('title')).toBe(expectedTooltip);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display accurate tooltip text for downward trends', () => {
      fc.assert(
        fc.property(
          // Generate positive numbers for previous value (avoid zero)
          fc.double({ min: 0.01, max: 10000, noNaN: true }),
          // Generate a multiplier < 0.99 to ensure we're above the 1% threshold
          fc.double({ min: 0.1, max: 0.98, noNaN: true }),
          (previous, multiplier) => {
            const current = previous * multiplier;
            
            // Calculate expected percentage change
            const percentChange = (current - previous) / previous;
            const expectedTooltip = `${(percentChange * 100).toFixed(1)}%`;
            
            // Render the component
            const { container } = render(
              <TrendIndicator currentValue={current} previousValue={previous} />
            );
            
            // Find the trend indicator element
            const indicator = container.querySelector('.trend-indicator');
            
            // Should render an indicator (not null)
            expect(indicator).not.toBeNull();
            
            // Tooltip (title attribute) should match expected value
            expect(indicator.getAttribute('title')).toBe(expectedTooltip);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    it('should render upward arrow for increases above threshold', () => {
      const { container } = render(
        <TrendIndicator currentValue={150} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator.textContent).toBe('▲');
      expect(indicator.classList.contains('trend-up')).toBe(true);
    });

    it('should render downward arrow for decreases above threshold', () => {
      const { container } = render(
        <TrendIndicator currentValue={75} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator.textContent).toBe('▼');
      expect(indicator.classList.contains('trend-down')).toBe(true);
    });

    it('should render nothing for values below threshold', () => {
      const { container } = render(
        <TrendIndicator currentValue={100.5} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator).toBeNull();
    });

    it('should render nothing when previous value is null', () => {
      const { container } = render(
        <TrendIndicator currentValue={100} previousValue={null} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator).toBeNull();
    });

    it('should render nothing when previous value is zero', () => {
      const { container } = render(
        <TrendIndicator currentValue={100} previousValue={0} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator).toBeNull();
    });

    it('should display correct tooltip text for upward trend', () => {
      const { container } = render(
        <TrendIndicator currentValue={150} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator.getAttribute('title')).toBe('+50.0%');
    });

    it('should display correct tooltip text for downward trend', () => {
      const { container } = render(
        <TrendIndicator currentValue={75} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator.getAttribute('title')).toBe('-25.0%');
    });

    it('should have appropriate CSS classes for upward trend', () => {
      const { container } = render(
        <TrendIndicator currentValue={150} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator.classList.contains('trend-indicator')).toBe(true);
      expect(indicator.classList.contains('trend-up')).toBe(true);
    });

    it('should have appropriate CSS classes for downward trend', () => {
      const { container } = render(
        <TrendIndicator currentValue={75} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator.classList.contains('trend-indicator')).toBe(true);
      expect(indicator.classList.contains('trend-down')).toBe(true);
    });

    it('should have aria-label for accessibility', () => {
      const { container } = render(
        <TrendIndicator currentValue={150} previousValue={100} />
      );
      
      const indicator = container.querySelector('.trend-indicator');
      expect(indicator.getAttribute('aria-label')).toContain('Trend up');
      expect(indicator.getAttribute('aria-label')).toContain('+50.0%');
    });
  });
});
