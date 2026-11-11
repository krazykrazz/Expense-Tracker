import { formatDateTime } from '../../../utils/formatters';
import { INSTITUTION_STATUS_TEXT } from './connectionStatus';

const formatIso = (iso) => (iso ? formatDateTime(iso) : null);

/** "Bank data updated by Plaid: <time>" plus, when it's unhealthy, Plaid's status for the institution. */
const BankFreshness = ({ item }) => {
  if (!item.bankUpdatedAt && !item.institutionStatus) return null;
  const institution = INSTITUTION_STATUS_TEXT[item.institutionStatus];
  return (
    <div className="bank-import-muted" data-testid="bank-freshness">
      {item.bankUpdatedAt && <>Bank data updated by Plaid: {formatIso(item.bankUpdatedAt)}</>}
      {institution && (
        <span className="bank-connection-error">
          {item.bankUpdatedAt ? ' · ' : ''}Plaid reports {item.institutionName} updates {institution}
          {item.institutionStatusSince ? ` since ${formatIso(item.institutionStatusSince)}` : ''}
        </span>
      )}
    </div>
  );
};

export default BankFreshness;
