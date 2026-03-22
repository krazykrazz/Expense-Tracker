/**
 * Property-Based Tests for AnomalyAlertItem CSS Module class isolation.
 *
 * @invariant Property 23: CSS Module class isolation
 * For any anomaly object (enriched, cluster, drift, or legacy),
 * when rendered as AnomalyAlertItem, every CSS class name on every
 * DOM element must be CSS Module-scoped (matching the Vite hash
 * pattern _<name>_<hash>) rather than a raw global class name.
 * No unscoped global class names should leak through.
 *
 * Validates: Requirements 18.1, 18.2
 *
 * @framework fast-check + vitest + @testing-library/react
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';

vi.mock('../../utils/formatters', () => ({
  formatCAD: (val) => `$${parseFloat(val || 0).toFixed(2)}`,
}));

import AnomalyAlertItem from './AnomalyAlertItem';
import {
  arbEnrichedAnomaly,
  arbClusterAnomaly,
  arbDriftAnomaly,
  arbLegacyAnomaly,
} from '../../test-utils/arbitraries';

// Vite CSS Module scoped class pattern: _<originalName>_<hash>
// e.g., _alertItem_b72497, _clickable_a1b2c3
const CSS_MODULE_SCOPED_PATTERN = /^_[a-zA-Z][a-zA-Z0-9]*_[a-z0-9]+$/;

/**
 * Extracts all individual CSS class names from every element in a container.
 * Splits compound classNames (space-separated) into individual tokens.
 */
function getAllClassNames(container) {
  const allElements = container.querySelectorAll('*');
  const classNames = new Set();
  for (const el of allElements) {
    if (el.className && typeof el.className === 'string') {
      for (const cls of el.className.split(/\s+/)) {
        if (cls) classNames.add(cls);
      }
    }
  }
  return classNames;
}

describe('AnomalyAlertItem PBT — Property 23: CSS Module class isolation', () => {
  /** **Validates: Requirements 18.1, 18.2** */

  const onDismiss = vi.fn().mockResolvedValue(undefined);
  const onMarkExpected = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Helper: renders an anomaly and asserts all class names are CSS Module-scoped.
   * CSS Module-scoped classes in Vite follow the pattern: _<name>_<hash>
   * Global/unscoped classes would be plain names like "alert-item" or "container".
   */
  function assertAllClassesAreModuleScoped(anomaly) {
    const { container } = render(
      <AnomalyAlertItem
        anomaly={anomaly}
        onDismiss={onDismiss}
        onMarkExpected={onMarkExpected}
      />
    );

    const classNames = getAllClassNames(container);

    // There must be at least one class (the root alertItem)
    expect(classNames.size).toBeGreaterThan(0);

    // Every class name must match the CSS Module scoped pattern
    for (const cls of classNames) {
      expect(
        CSS_MODULE_SCOPED_PATTERN.test(cls),
        `Class name "${cls}" is not CSS Module-scoped. ` +
        `Expected pattern: _<name>_<hash> (e.g., _alertItem_b72497). ` +
        `This indicates a global/unscoped class name leaked through.`
      ).toBe(true);
    }

    cleanup();
  }

  it('Property 23a: enriched anomalies use only CSS Module classes', () => {
    fc.assert(
      fc.property(arbEnrichedAnomaly(), (anomaly) => {
        assertAllClassesAreModuleScoped(anomaly);
      }),
      { numRuns: 80 }
    );
  });

  it('Property 23b: cluster anomalies use only CSS Module classes', () => {
    fc.assert(
      fc.property(arbClusterAnomaly(), (anomaly) => {
        assertAllClassesAreModuleScoped(anomaly);
      }),
      { numRuns: 40 }
    );
  });

  it('Property 23c: drift anomalies use only CSS Module classes', () => {
    fc.assert(
      fc.property(arbDriftAnomaly(), (anomaly) => {
        assertAllClassesAreModuleScoped(anomaly);
      }),
      { numRuns: 40 }
    );
  });

  it('Property 23d: legacy anomalies use only CSS Module classes', () => {
    fc.assert(
      fc.property(arbLegacyAnomaly(), (anomaly) => {
        assertAllClassesAreModuleScoped(anomaly);
      }),
      { numRuns: 40 }
    );
  });
});
