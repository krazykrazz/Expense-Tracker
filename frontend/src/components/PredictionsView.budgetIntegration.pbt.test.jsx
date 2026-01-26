/**
 * Property-Based Tests for PredictionsView - Budget Integration
 * 
 * **Feature: spending-patterns-predictions, Property 24: Budget Integration**
 * **Validates: Requirements 7.4**
 * 
 * Property 24: For any analytics hub view where budget alerts exist for the current month,
 * the spending predictions SHALL display alongside budget status information.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import PredictionsView from './PredictionsView';
import * as analyticsApi from '../services/analyticsApi';
import { CATEGORIES } from '../utils/constants';
import { uiPbtOptions } from '../test/pbtArbitraries';

// Mock the analytics API
vi.mock('../services/analyticsApi', () => ({
  getMonthPrediction: vi.fn()
}));

describe('PredictionsView - Budget Integration Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Generator for budget alert objects
   */
  const budgetAlertArb = fc.record({
    category: fc.constantFrom(...CATEGORIES),
    percentUsed: fc.integer({ min: 0, max: 200 }),
    status: fc.constantFrom('warning', 'danger', 'critical', 'ok')
  });

  /**
   * Generator for prediction response
   */
  const predictionResponseArb = fc.record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    currentSpent: fc.float({ min: 0, max: 10000, noNaN: true }),
    predictedTotal: fc.float({ min: 0, max: 15000, noNaN: true }),
    daysElapsed: fc.integer({ min: 1, max: 31 }),
    daysRemaining: fc.integer({ min: 0, max: 30 }),
    dailyAverage: fc.float({ min: 0, max: 500, noNaN: true }),
    historicalMonthlyAverage: fc.float({ min: 0, max: 10000, noNaN: true }),
    confidenceLevel: fc.constantFrom('low', 'medium', 'high'),
    exceedsIncome: fc.boolean(),
    yearOverYearChange: fc.option(fc.float({ min: -100, max: 200, noNaN: true }), { nil: null }),
    categoryBreakdown: fc.array(
      fc.record({
        category: fc.constantFrom(...CATEGORIES),
        currentSpent: fc.float({ min: 0, max: 1000, noNaN: true }),
        predicted: fc.float({ min: 0, max: 2000, noNaN: true })
      }),
      { minLength: 0, maxLength: 5 }
    )
  });

  /**
   * Property 24: Budget alerts are displayed when provided
   * 
   * For any non-empty array of budget alerts, the PredictionsView component
   * SHALL render a Budget Status section displaying all provided alerts.
   */
  it('Property 24: should display budget status section when budget alerts are provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(budgetAlertArb, { minLength: 1, maxLength: 5 }),
        predictionResponseArb,
        async (budgetAlerts, predictionData) => {
          // Clean up before each iteration
          cleanup();
          
          // Mock the API response
          analyticsApi.getMonthPrediction.mockResolvedValue(predictionData);

          // Render the component with budget alerts
          const { container } = render(
            <PredictionsView
              year={predictionData.year}
              month={predictionData.month}
              monthlyIncome={5000}
              budgetAlerts={budgetAlerts}
            />
          );

          // Wait for the component to load
          await waitFor(() => {
            expect(screen.queryByText('Calculating predictions...')).not.toBeInTheDocument();
          });

          // Property: Budget Status section should be present
          const budgetSection = container.querySelector('.predictions-budget-section');
          expect(budgetSection).not.toBeNull();

          // Property: Budget Status heading should be present
          expect(screen.getAllByText('Budget Status').length).toBeGreaterThan(0);

          // Property: Each budget alert should be displayed
          const alertElements = container.querySelectorAll('.predictions-budget-alert');
          expect(alertElements.length).toBe(budgetAlerts.length);

          // Property: Each alert should show category and percentage
          budgetAlerts.forEach((alert) => {
            expect(screen.getAllByText(alert.category).length).toBeGreaterThan(0);
            expect(screen.getAllByText(`${alert.percentUsed}%`).length).toBeGreaterThan(0);
          });
        }
      ),
      uiPbtOptions()
    );
  });

  /**
   * Property 24: Budget alerts have correct status styling
   * 
   * For any budget alert with a specific status (warning, danger, critical, ok),
   * the alert element SHALL have the corresponding CSS class applied.
   */
  it('Property 24: should apply correct status class to budget alerts', async () => {
    await fc.assert(
      fc.asyncProperty(
        budgetAlertArb,
        predictionResponseArb,
        async (budgetAlert, predictionData) => {
          // Clean up before each iteration
          cleanup();
          
          // Mock the API response
          analyticsApi.getMonthPrediction.mockResolvedValue(predictionData);

          // Render with a single budget alert
          const { container } = render(
            <PredictionsView
              year={predictionData.year}
              month={predictionData.month}
              monthlyIncome={5000}
              budgetAlerts={[budgetAlert]}
            />
          );

          // Wait for the component to load
          await waitFor(() => {
            expect(screen.queryByText('Calculating predictions...')).not.toBeInTheDocument();
          });

          // Property: Alert element should have the correct status class
          const alertElement = container.querySelector('.predictions-budget-alert');
          expect(alertElement).not.toBeNull();
          expect(alertElement.classList.contains(budgetAlert.status)).toBe(true);
        }
      ),
      uiPbtOptions()
    );
  });

  /**
   * Property 24: No budget section when alerts array is empty
   * 
   * For any empty budget alerts array, the PredictionsView component
   * SHALL NOT render the Budget Status section.
   */
  it('Property 24: should not display budget section when no alerts provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        predictionResponseArb,
        async (predictionData) => {
          // Clean up before each iteration
          cleanup();
          
          // Mock the API response
          analyticsApi.getMonthPrediction.mockResolvedValue(predictionData);

          // Render with empty budget alerts
          const { container } = render(
            <PredictionsView
              year={predictionData.year}
              month={predictionData.month}
              monthlyIncome={5000}
              budgetAlerts={[]}
            />
          );

          // Wait for the component to load
          await waitFor(() => {
            expect(screen.queryByText('Calculating predictions...')).not.toBeInTheDocument();
          });

          // Property: Budget Status section should NOT be present
          const budgetSection = container.querySelector('.predictions-budget-section');
          expect(budgetSection).toBeNull();
        }
      ),
      uiPbtOptions()
    );
  });

  /**
   * Property 24: No budget section when alerts is undefined
   * 
   * For any undefined or null budget alerts prop, the PredictionsView component
   * SHALL NOT render the Budget Status section and SHALL NOT throw an error.
   */
  it('Property 24: should handle undefined/null budget alerts gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        predictionResponseArb,
        fc.constantFrom(undefined, null),
        async (predictionData, budgetAlerts) => {
          // Clean up before each iteration
          cleanup();
          
          // Mock the API response
          analyticsApi.getMonthPrediction.mockResolvedValue(predictionData);

          // Render with undefined/null budget alerts - should not throw
          const { container } = render(
            <PredictionsView
              year={predictionData.year}
              month={predictionData.month}
              monthlyIncome={5000}
              budgetAlerts={budgetAlerts}
            />
          );

          // Wait for the component to load
          await waitFor(() => {
            expect(screen.queryByText('Calculating predictions...')).not.toBeInTheDocument();
          });

          // Property: Budget Status section should NOT be present
          const budgetSection = container.querySelector('.predictions-budget-section');
          expect(budgetSection).toBeNull();

          // Property: Component should render without errors
          expect(container.querySelector('.predictions-view')).not.toBeNull();
        }
      ),
      uiPbtOptions()
    );
  });

  /**
   * Property 24: Budget alerts display alongside predictions
   * 
   * For any valid prediction data and budget alerts, both the prediction
   * information and budget status SHALL be displayed simultaneously.
   */
  it('Property 24: should display budget alerts alongside prediction data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(budgetAlertArb, { minLength: 1, maxLength: 3 }),
        predictionResponseArb,
        async (budgetAlerts, predictionData) => {
          // Clean up before each iteration
          cleanup();
          
          // Mock the API response
          analyticsApi.getMonthPrediction.mockResolvedValue(predictionData);

          // Render the component
          const { container } = render(
            <PredictionsView
              year={predictionData.year}
              month={predictionData.month}
              monthlyIncome={5000}
              budgetAlerts={budgetAlerts}
            />
          );

          // Wait for the component to load
          await waitFor(() => {
            expect(screen.queryByText('Calculating predictions...')).not.toBeInTheDocument();
          });

          // Property: Main prediction card should be present
          const mainCard = container.querySelector('.predictions-main-card');
          expect(mainCard).not.toBeNull();

          // Property: Budget section should be present
          const budgetSection = container.querySelector('.predictions-budget-section');
          expect(budgetSection).not.toBeNull();

          // Property: Predicted total should be displayed
          expect(screen.getAllByText('Predicted End-of-Month Total').length).toBeGreaterThan(0);

          // Property: Budget Status should be displayed
          expect(screen.getAllByText('Budget Status').length).toBeGreaterThan(0);

          // Property: Both sections should be visible simultaneously
          expect(mainCard).toBeVisible();
          expect(budgetSection).toBeVisible();
        }
      ),
      uiPbtOptions()
    );
  });
});
