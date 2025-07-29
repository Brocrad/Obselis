import { useCallback } from 'react';
import errorHandler from '../utils/errorHandler';

/**
 * Hook for manually triggering error routing
 * Useful for components that need to programmatically redirect to error pages
 */
export const use404Handler = () => {
  const trigger404 = useCallback((reason = 'Manual trigger') => {
    errorHandler.trigger404(reason);
  }, []);

  const triggerServerError = useCallback((reason = 'Manual trigger') => {
    errorHandler.triggerServerError(reason);
  }, []);

  const add404Pattern = useCallback((pattern) => {
    errorHandler.add404Pattern(pattern);
  }, []);

  const addServerErrorPattern = useCallback((pattern) => {
    errorHandler.addServerErrorPattern(pattern);
  }, []);

  const addIgnoredUrl = useCallback((url) => {
    errorHandler.addIgnoredUrl(url);
  }, []);

  return {
    trigger404,
    triggerServerError,
    add404Pattern,
    addServerErrorPattern,
    addIgnoredUrl,
    errorHandler
  };
};

export default use404Handler; 