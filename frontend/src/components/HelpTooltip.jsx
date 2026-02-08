import React, { useState, useRef, useEffect } from 'react';
import './HelpTooltip.css';

const HelpTooltip = ({ content, position = 'top', maxWidth = 300 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const tooltipRef = useRef(null);
  const iconRef = useRef(null);

  useEffect(() => {
    if (isVisible && tooltipRef.current && iconRef.current) {
      const tooltip = tooltipRef.current;
      const icon = iconRef.current;
      const tooltipRect = tooltip.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newPosition = position;

      // Check if tooltip overflows viewport and adjust position
      if (position === 'top' && tooltipRect.top < 0) {
        newPosition = 'bottom';
      } else if (position === 'bottom' && tooltipRect.bottom > viewportHeight) {
        newPosition = 'top';
      } else if (position === 'left' && tooltipRect.left < 0) {
        newPosition = 'right';
      } else if (position === 'right' && tooltipRect.right > viewportWidth) {
        newPosition = 'left';
      }

      if (newPosition !== adjustedPosition) {
        setAdjustedPosition(newPosition);
      }
    }
  }, [isVisible, position, adjustedPosition]);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleFocus = () => {
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsVisible(false);
      iconRef.current?.blur();
    }
  };

  const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <span className="help-tooltip-wrapper">
      <span
        ref={iconRef}
        className="help-tooltip-icon"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label="Help information"
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        ⓘ
      </span>
      {isVisible && (
        <span
          ref={tooltipRef}
          id={tooltipId}
          className={`help-tooltip-content help-tooltip-${adjustedPosition}`}
          style={{ maxWidth: `${maxWidth}px` }}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  );
};

export default HelpTooltip;
