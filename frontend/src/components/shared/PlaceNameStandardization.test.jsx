import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlaceNameStandardization from './PlaceNameStandardization';
import { analyzePlaceNames, standardizePlaceNames } from '../../services/placeNameApi';

// The component reaches the backend only through these two functions.
vi.mock('../../services/placeNameApi');

/**
 * Regression coverage for selective merge: fuzzy matching can group unrelated
 * names together (e.g. "Topper's" alongside the "Shoppers" variants). Users
 * must be able to exclude the false positives and merge only a subset.
 */
describe('PlaceNameStandardization - selective merge (variation exclusion)', () => {
  const group = {
    id: 'g1',
    totalCount: 391,
    suggestedCanonical: 'Shoppers Drug Mart',
    variations: [
      { name: 'Shoppers Drug Mart', count: 378 },
      { name: 'Shoppers', count: 8 },
      { name: "Shopper's", count: 3 },
      { name: "Topper's", count: 1 },
      { name: "Topper's Pizza", count: 1 },
    ],
  };

  const analyze = () =>
    fireEvent.click(screen.getByRole('button', { name: /Analyze Place Names/ }));

  const radioFor = (value) =>
    screen.getAllByRole('radio').find((r) => r.value === value);

  beforeEach(() => {
    vi.clearAllMocks();
    analyzePlaceNames.mockResolvedValue({
      groups: [group],
      totalGroups: 1,
      totalExpenses: 391,
    });
    standardizePlaceNames.mockResolvedValue({ success: true, updatedCount: 11 });
  });

  it('previews only the included variations, leaving excluded false positives out', async () => {
    render(<PlaceNameStandardization />);
    analyze();
    await screen.findByLabelText("Include Topper's in merge");

    // Exclude the two unrelated names.
    fireEvent.click(screen.getByLabelText("Include Topper's in merge"));
    fireEvent.click(screen.getByLabelText("Include Topper's Pizza in merge"));

    // Choose the canonical target and preview.
    fireEvent.click(radioFor('Shoppers Drug Mart'));
    fireEvent.click(screen.getByRole('button', { name: /Preview Changes/ }));

    // The merge affects only the two Shoppers variants (8 + 3 = 11 records).
    expect(await screen.findByText('11 records')).toBeInTheDocument();
    expect(screen.getByText('Shoppers')).toBeInTheDocument();
    expect(screen.getByText("Shopper's")).toBeInTheDocument();
    expect(screen.queryByText("Topper's")).not.toBeInTheDocument();
    expect(screen.queryByText("Topper's Pizza")).not.toBeInTheDocument();
  });

  it('sends only the included variations in the standardize payload', async () => {
    // Reject so no post-success timer is scheduled; the call args are what we assert.
    standardizePlaceNames.mockRejectedValueOnce(new Error('boom'));

    render(<PlaceNameStandardization />);
    analyze();
    await screen.findByLabelText("Include Topper's in merge");

    fireEvent.click(screen.getByLabelText("Include Topper's in merge"));
    fireEvent.click(screen.getByLabelText("Include Topper's Pizza in merge"));
    fireEvent.click(radioFor('Shoppers Drug Mart'));
    fireEvent.click(screen.getByRole('button', { name: /Preview Changes/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Apply Changes/ }));

    await waitFor(() => expect(standardizePlaceNames).toHaveBeenCalledTimes(1));
    expect(standardizePlaceNames).toHaveBeenCalledWith([
      { from: ['Shoppers', "Shopper's"], to: 'Shoppers Drug Mart', affectedCount: 11 },
    ]);
  });

  it('disables the canonical radio for an excluded variation', async () => {
    render(<PlaceNameStandardization />);
    analyze();
    await screen.findByLabelText("Include Topper's in merge");

    fireEvent.click(screen.getByLabelText("Include Topper's in merge"));
    expect(radioFor("Topper's")).toBeDisabled();
  });

  it('clears the selection when the chosen canonical is excluded', async () => {
    render(<PlaceNameStandardization />);
    analyze();
    await screen.findByLabelText('Include Shoppers in merge');

    // Pick "Shoppers" as canonical, then exclude that same variation.
    fireEvent.click(radioFor('Shoppers'));
    expect(radioFor('Shoppers').checked).toBe(true);

    fireEvent.click(screen.getByLabelText('Include Shoppers in merge'));
    expect(radioFor('Shoppers').checked).toBe(false);
    expect(radioFor('Shoppers')).toBeDisabled();
  });
});
