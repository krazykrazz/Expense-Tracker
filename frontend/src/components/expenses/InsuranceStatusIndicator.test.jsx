import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InsuranceStatusIndicator from './InsuranceStatusIndicator';

describe('InsuranceStatusIndicator', () => {
  describe('rendering', () => {
    test('renders nothing when not insurance eligible', () => {
      const { container } = render(<InsuranceStatusIndicator insuranceEligible={false} />);
      expect(container).toBeEmptyDOMElement();
    });

    test('renders the status indicator when insurance eligible', () => {
      render(<InsuranceStatusIndicator insuranceEligible claimStatus="paid" />);
      expect(screen.getByLabelText('Insurance status: Paid')).toBeInTheDocument();
    });

    test.each([
      ['not_claimed', 'Not Claimed'],
      ['in_progress', 'In Progress'],
      ['paid', 'Paid'],
      ['denied', 'Denied'],
      [null, 'Not Claimed'],
    ])('maps claim status %s to label %s', (claimStatus, expectedLabel) => {
      render(<InsuranceStatusIndicator insuranceEligible claimStatus={claimStatus} />);
      expect(screen.getByLabelText(`Insurance status: ${expectedLabel}`)).toBeInTheDocument();
    });
  });

  // Regression: the early `insuranceEligible` return used to sit above four
  // useCallback calls, so flipping the prop changed the hook count 0 <-> 4.
  describe('hook order stability when insuranceEligible changes', () => {
    let consoleError;

    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    test('toggling from ineligible to eligible on a mounted instance does not error', () => {
      const { rerender, container } = render(
        <InsuranceStatusIndicator insuranceEligible={false} claimStatus="paid" />
      );
      expect(container).toBeEmptyDOMElement();

      rerender(<InsuranceStatusIndicator insuranceEligible claimStatus="paid" />);

      expect(screen.getByLabelText('Insurance status: Paid')).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    });

    test('toggling from eligible to ineligible on a mounted instance does not error', () => {
      const { rerender, container } = render(
        <InsuranceStatusIndicator insuranceEligible claimStatus="denied" />
      );
      expect(screen.getByLabelText('Insurance status: Denied')).toBeInTheDocument();

      rerender(<InsuranceStatusIndicator insuranceEligible={false} claimStatus="denied" />);

      expect(container).toBeEmptyDOMElement();
      expect(consoleError).not.toHaveBeenCalled();
    });

    test('survives repeated toggling with changing dependent props', () => {
      const onClick = vi.fn();
      const { rerender } = render(
        <InsuranceStatusIndicator insuranceEligible={false} claimStatus="not_claimed" />
      );

      rerender(
        <InsuranceStatusIndicator insuranceEligible claimStatus="in_progress" onClick={onClick} />
      );
      rerender(<InsuranceStatusIndicator insuranceEligible={false} claimStatus="paid" />);
      rerender(
        <InsuranceStatusIndicator
          insuranceEligible
          claimStatus="paid"
          originalCost={100}
          outOfPocket={25}
          onClick={onClick}
        />
      );

      expect(screen.getByLabelText('Insurance status: Paid')).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('tooltip', () => {
    test('includes reimbursement breakdown when both costs are provided', () => {
      render(
        <InsuranceStatusIndicator
          insuranceEligible
          claimStatus="paid"
          originalCost={100}
          outOfPocket={25}
        />
      );

      const title = screen.getByLabelText('Insurance status: Paid').getAttribute('title');
      expect(title).toContain('Original: $100.00');
      expect(title).toContain('Out-of-pocket: $25.00');
      expect(title).toContain('Reimbursement: $75.00');
    });
  });
});
