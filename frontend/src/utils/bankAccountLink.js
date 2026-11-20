/**
 * The bank account facts the UI shows for something linked to a bank account (a payment method, or an
 * investment): which account, its balance and how fresh the connection is.
 * @param {{institutionName: string, status?: string, bankUpdatedAt?: (string|null)}} item the bank connection
 * @param {object} account one of the connection's accounts (GET /api/plaid/items)
 */
export function toBankLink(item, account) {
  return {
    institutionName: item.institutionName,
    accountName: account.name,
    mask: account.mask ?? null,
    accountType: account.type ?? null,
    currentBalance: account.currentBalance ?? null,
    availableBalance: account.availableBalance ?? null,
    balanceCurrency: account.balanceCurrency ?? null,
    balanceAsOf: account.balanceAsOf ?? null,
    // The connection's own state: a balance from a bank that needs a login or isn't updating may be old
    bankStatus: item.status ?? 'ok',
    bankUpdatedAt: item.bankUpdatedAt ?? null
  };
}

/**
 * Group the accounts of all connections by a link column (`paymentMethodId`, `investmentId`).
 * @param {Array<{accounts?: Array<object>}>} items connections from GET /api/plaid/items
 * @param {string} key the account field holding the target id
 * @returns {Map<number, Array<object>>}
 */
export function groupBankLinks(items, key) {
  const grouped = new Map();
  for (const item of items || []) {
    for (const account of item.accounts || []) {
      if (account[key] == null) continue;
      const list = grouped.get(account[key]) || [];
      list.push(toBankLink(item, account));
      grouped.set(account[key], list);
    }
  }
  return grouped;
}
