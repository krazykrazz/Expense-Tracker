/**
 * Receipts (invoices) changed outside the component showing them, e.g. uploaded in the expense form while the
 * expense list keeps its own invoice cache. Listeners reload the given expense's invoices, or all of them when
 * no expense id is given (a change from another tab).
 */
export const INVOICES_CHANGED_EVENT = 'invoicesChanged';

export function notifyInvoicesChanged(expenseId = null) {
  window.dispatchEvent(new CustomEvent(INVOICES_CHANGED_EVENT, { detail: { expenseId } }));
}
