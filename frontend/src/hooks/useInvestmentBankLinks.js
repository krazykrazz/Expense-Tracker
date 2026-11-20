import { useBankLinks } from './useBankLinks';

/**
 * Bank accounts (Plaid) linked to each investment (spec 4.1a), for the bank balance next to it. Empty without
 * Plaid, like useBankAccountLinks.
 *
 * @returns {Map<number, Array<{institutionName: string, accountName: string, mask: string|null, accountType: (string|null),
 *   currentBalance: (number|null), availableBalance: (number|null), balanceCurrency: (string|null),
 *   balanceAsOf: (string|null), bankStatus: string, bankUpdatedAt: (string|null)}>>}
 */
export function useInvestmentBankLinks() {
  return useBankLinks('investmentId');
}

export default useInvestmentBankLinks;
