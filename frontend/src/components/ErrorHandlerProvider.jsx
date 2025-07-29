import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import errorHandler from '../utils/errorHandler';

/**
 * Error Handler Provider Component
 * Initializes the global error handler and provides 404 detection
 * throughout the application
 */
const ErrorHandlerProvider = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize the error handler
    errorHandler.init(navigate);

    // Add any custom 404 patterns for your app
    errorHandler.add404Pattern(/media.*not.*found/i);
    errorHandler.add404Pattern(/movie.*not.*found/i);
    errorHandler.add404Pattern(/show.*not.*found/i);
    errorHandler.add404Pattern(/user.*not.*found/i);
    errorHandler.add404Pattern(/content.*not.*found/i);

    // Add custom server error patterns for your app
    errorHandler.addServerErrorPattern(/transcoding.*failed/i);
    errorHandler.addServerErrorPattern(/database.*connection.*failed/i);
    errorHandler.addServerErrorPattern(/redis.*connection.*failed/i);
    errorHandler.addServerErrorPattern(/gpu.*unavailable/i);
    errorHandler.addServerErrorPattern(/storage.*unavailable/i);

    // Add URLs to ignore (health checks, monitoring, etc.)
    errorHandler.addIgnoredUrl('/api/health');
    errorHandler.addIgnoredUrl('/api/metrics');
    errorHandler.addIgnoredUrl('/api/status');
    errorHandler.addIgnoredUrl('/ping');
    errorHandler.addIgnoredUrl('/health');

    console.log('🔍 Error Handler Provider initialized');

    // Cleanup function (optional - keeps handler global)
    return () => {
      // Uncomment if you want to cleanup on unmount
      // errorHandler.cleanup();
    };
  }, [navigate]);

  return <>{children}</>;
};

export default ErrorHandlerProvider; 