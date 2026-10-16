import PropTypes from 'prop-types';
import { formatCAD } from '../../utils/formatters';
import './Money.css';

/**
 * Money - Formatted CAD amount with de-emphasised cents ("$1,234" + ".56").
 * The full amount stays in the text content for copy/paste and screen readers.
 */
const Money = ({ value, className = '' }) => {
  const text = formatCAD(value);
  const dot = text.lastIndexOf('.');
  const classes = `money ${className}`.trim();

  if (dot === -1) {
    return <span className={classes}>{text}</span>;
  }

  return (
    <span className={classes}>
      {text.slice(0, dot)}
      <span className="money-cents">{text.slice(dot)}</span>
    </span>
  );
};

Money.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
};

export default Money;
