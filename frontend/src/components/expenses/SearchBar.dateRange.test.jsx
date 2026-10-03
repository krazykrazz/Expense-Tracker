import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar, { isCommittableRange } from './SearchBar';

describe('isCommittableRange', () => {
  it('accepts empty or complete dates in order', () => {
    expect(isCommittableRange('', '')).toBe(true);
    expect(isCommittableRange('2026-09-14', '')).toBe(true);
    expect(isCommittableRange('2026-09-14', '2026-09-14')).toBe(true);
  });

  it('rejects partially typed years and reversed ranges', () => {
    expect(isCommittableRange('0202-09-14', '')).toBe(false);
    expect(isCommittableRange('2026-10-04', '2026-10-03')).toBe(false);
  });
});

describe('SearchBar date range', () => {
  const renderBar = (props = {}) => {
    const onDateRangeChange = vi.fn();
    const utils = render(
      <SearchBar showOnlyFilters onDateRangeChange={onDateRangeChange} categories={[]} paymentMethods={[]} {...props} />
    );
    return { onDateRangeChange, ...utils };
  };

  it('commits a complete start date with an open end', () => {
    const { onDateRangeChange } = renderBar();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-14' } });
    expect(onDateRangeChange).toHaveBeenCalledWith('2026-09-14', '');
  });

  it('does not commit while the year is still being typed, but keeps the draft visible', () => {
    const { onDateRangeChange } = renderBar();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '0202-09-14' } });
    expect(onDateRangeChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('From')).toHaveValue('0202-09-14');
  });

  it('does not commit an end before the start', () => {
    const { onDateRangeChange } = renderBar({ filterStartDate: '2026-10-04' });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-03' } });
    expect(onDateRangeChange).not.toHaveBeenCalled();
  });

  it('resyncs drafts when filters are cleared externally', () => {
    const { rerender } = renderBar({ filterStartDate: '2026-09-14' });
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-14');
    rerender(<SearchBar showOnlyFilters onDateRangeChange={vi.fn()} categories={[]} paymentMethods={[]} filterStartDate="" />);
    expect(screen.getByLabelText('From')).toHaveValue('');
  });
});
