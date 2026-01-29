/**
 * MortgageDetailSection Component
 * 
 * Displays mortgage-specific information within LoanDetailView:
 * - Mortgage summary (amortization, term, renewal date, rate type, frequency)
 * - Renewal reminder banner (if within 6 months)
 * 
 * Requirements: 8.1, 8.2, 8.5, 7.1
 */

import { useState, useEffect } from 'react';
import './MortgageDetailSection.css';
import { formatCurrency, formatDate } from '../utils/formatters';

/**
 * Format payment frequency for display
 * @param {string} frequency - Payment frequency value
 * @returns {string} Human-readable frequency
 */
const formatPaymentFrequency = (frequency) => {
  switch (frequency) {
    case 'monthly':
      return 'Monthly';
    case 'bi-weekly':
      return 'Bi-weekly';
    case 'accelerated_bi-weekly':
      return 'Accelerated Bi-weekly';
    default:
      return frequency || 'N/A';
  }
};

/**
 * Format rate type for display
 * @param {string} rateType - Rate type value
 * @returns {string} Human-readable rate type
 */
const formatRateType = (rateType) => {
  switch (rateType) {
    case 'fixed':
      return 'Fixed';
    case 'variable':
      return 'Variable';
    default:
      return rateType || 'N/A';
  }
};

/**
 * Calculate renewal status
 * @param {string} renewalDate - ISO date string
 * @returns {Object} { isApproaching, monthsUntilRenewal, isPastDue }
 */
const calculateRenewalStatus = (renewalDate) => {
  if (!renewalDate) {
    return { isApproaching: false, monthsUntilRenewal: null, isPastDue: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);

  const isPastDue = renewal < today;
  const diffTime = renewal.getTime() - today.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const monthsUntilRenewal = Math.round(diffDays / 30.44);
  const isApproaching = !isPastDue && monthsUntilRenewal <= 6 && monthsUntilRenewal >= 0;

  return { isApproaching, monthsUntilRenewal, isPastDue };
};

const MortgageDetailSection = ({ mortgage, onUpdatePropertyValue }) => {
  const [renewalStatus, setRenewalStatus] = useState({
    isApproaching: false,
    monthsUntilRenewal: null,
    isPastDue: false
  });

  useEffect(() => {
    if (mortgage?.renewal_date) {
      setRenewalStatus(calculateRenewalStatus(mortgage.renewal_date));
    }
  }, [mortgage?.renewal_date]);

  if (!mortgage || mortgage.loan_type !== 'mortgage') {
    return null;
  }

  return (
    <div className="mortgage-detail-section">
      {/* Renewal Reminder Banner - Requirement 7.1 */}
      {renewalStatus.isPastDue && (
        <div className="mortgage-renewal-banner mortgage-renewal-overdue">
          <span className="renewal-icon">⚠️</span>
          <div className="renewal-content">
            <strong>Renewal Overdue</strong>
            <p>Your mortgage renewal date ({formatDate(mortgage.renewal_date)}) has passed. Please update your renewal information.</p>
          </div>
        </div>
      )}
      
      {renewalStatus.isApproaching && !renewalStatus.isPastDue && (
        <div className="mortgage-renewal-banner mortgage-renewal-approaching">
          <span className="renewal-icon">📅</span>
          <div className="renewal-content">
            <strong>Renewal Approaching</strong>
            <p>
              Your mortgage renewal is in {renewalStatus.monthsUntilRenewal} month{renewalStatus.monthsUntilRenewal !== 1 ? 's' : ''} 
              ({formatDate(mortgage.renewal_date)}). Start preparing for rate negotiations.
            </p>
          </div>
        </div>
      )}

      {/* Mortgage Summary - Requirements 8.1, 8.2 */}
      <div className="mortgage-summary-section">
        <h4>Mortgage Details</h4>
        <div className="mortgage-summary-grid">
          <div className="mortgage-summary-item">
            <span className="mortgage-label">Amortization Period</span>
            <span className="mortgage-value">{mortgage.amortization_period} years</span>
          </div>
          
          <div className="mortgage-summary-item">
            <span className="mortgage-label">Term Length</span>
            <span className="mortgage-value">{mortgage.term_length} years</span>
          </div>
          
          <div className="mortgage-summary-item">
            <span className="mortgage-label">Renewal Date</span>
            <span className={`mortgage-value ${renewalStatus.isPastDue ? 'overdue' : renewalStatus.isApproaching ? 'approaching' : ''}`}>
              {formatDate(mortgage.renewal_date)}
            </span>
          </div>
          
          <div className="mortgage-summary-item">
            <span className="mortgage-label">Rate Type</span>
            <span className={`mortgage-value rate-type-${mortgage.rate_type}`}>
              {formatRateType(mortgage.rate_type)}
            </span>
          </div>
          
          <div className="mortgage-summary-item">
            <span className="mortgage-label">Payment Frequency</span>
            <span className="mortgage-value">{formatPaymentFrequency(mortgage.payment_frequency)}</span>
          </div>
          
          {mortgage.estimated_property_value && (
            <div className="mortgage-summary-item">
              <span className="mortgage-label">Estimated Property Value</span>
              <span className="mortgage-value property-value">
                {formatCurrency(mortgage.estimated_property_value)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MortgageDetailSection;
