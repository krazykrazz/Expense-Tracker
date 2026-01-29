import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';
import './EnvironmentBanner.css';

/**
 * Displays a prominent banner when running in non-production environments.
 * Fetches environment info from /api/version endpoint.
 * 
 * - Staging (orange): Docker container with test data copy
 * - Development (blue): Local dev server without Docker
 * - Production: No banner shown
 */
function EnvironmentBanner() {
  const [environment, setEnvironment] = useState(null);

  useEffect(() => {
    const fetchEnvironment = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.VERSION);
        if (response.ok) {
          const data = await response.json();
          // Only show banner for non-production environments
          if (data.environment && data.environment !== 'production') {
            setEnvironment(data.environment);
          }
        }
      } catch (error) {
        // Silently fail - don't show banner if we can't determine environment
        console.debug('Could not fetch environment info:', error);
      }
    };

    fetchEnvironment();
  }, []);

  if (!environment) {
    return null;
  }

  const isStaging = environment === 'staging';
  const isDevelopment = environment === 'development';

  return (
    <div className={`environment-banner ${isStaging ? 'staging' : ''} ${isDevelopment ? 'development' : ''}`}>
      <span className="environment-icon">
        {isStaging ? '🧪' : isDevelopment ? '🔧' : '⚠️'}
      </span>
      <span className="environment-text">
        {isStaging && 'STAGING ENVIRONMENT - Changes here do not affect production data'}
        {isDevelopment && 'DEVELOPMENT MODE - Local server without Docker'}
        {!isStaging && !isDevelopment && `${environment.toUpperCase()} ENVIRONMENT`}
      </span>
    </div>
  );
}

export default EnvironmentBanner;
