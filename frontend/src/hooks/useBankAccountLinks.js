import { useBankLinks } from './useBankLinks';

/**
 * Bank accounts (Plaid) mapped to each payment method, for showing "linked to bank" in the UI.
 * Returns an empty Map, without calling the bank endpoints, while Plaid is not configured, so screens
 * behave the same with or without Plaid. Failures also yield an empty Map (the badge is informational).
 *
 * @returns {Map<number, Array<{institutionName: string, accountName: string, mask: string|null, accountType: (string|null),
 *   currentBalance: (number|null), availableBalance: (number|null), balanceCurrency: (string|null),
 *   balanceAsOf: (string|null), bankStatus: string, bankUpdatedAt: (string|null)}>>}
 */
export function useBankAccountLinks() {
  return useBankLinks('paymentMethodId');
}

export default useBankAccountLinks;
