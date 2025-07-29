/**
 * Example usage of the 404 Error Handler
 * This file demonstrates how to use the error handler in different scenarios
 */

import errorHandler from './errorHandler';
import { use404Handler } from '../hooks/use404Handler';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

// Example 1: Manual trigger in a component
export const ExampleComponent = () => {
  const { trigger404 } = use404Handler();

  const handleMissingContent = () => {
    // Manually trigger 404 when content is not found
    trigger404('Content not found in database');
  };

  const handleInvalidMedia = () => {
    // Manually trigger 404 for invalid media
    trigger404('Media file not found on server');
  };

  return (
    <div>
      <button onClick={handleMissingContent}>Test Missing Content 404</button>
      <button onClick={handleInvalidMedia}>Test Invalid Media 404</button>
    </div>
  );
};

// Example 2: API call with automatic 404 detection
export const fetchMediaContent = async (mediaId) => {
  try {
    const response = await fetch(`/api/media/${mediaId}`);
    
    if (response.status === 404) {
      // This will automatically trigger the 404 handler
      throw new Error('Media not found');
    }
    
    return await response.json();
  } catch (error) {
    // The error handler will catch this and route to 404
    console.error('Failed to fetch media:', error);
    throw error;
  }
};

// Example 3: Adding custom 404 patterns
export const setupCustomPatterns = () => {
  // Add custom patterns for your specific use cases
  errorHandler.add404Pattern(/transcoding.*failed/i);
  errorHandler.add404Pattern(/thumbnail.*missing/i);
  errorHandler.add404Pattern(/metadata.*not.*available/i);
  
  // Add URLs to ignore
  errorHandler.addIgnoredUrl('/api/analytics');
  errorHandler.addIgnoredUrl('/api/logs');
};

// Example 4: React Hook usage in a component
export const MediaPlayerComponent = () => {
  const { trigger404, add404Pattern } = use404Handler();

  useEffect(() => {
    // Add specific patterns for this component
    add404Pattern(/stream.*unavailable/i);
    add404Pattern(/codec.*not.*supported/i);
  }, [add404Pattern]);

  const handleStreamError = (error) => {
    if (error.message.includes('stream unavailable')) {
      trigger404('Stream is currently unavailable');
    }
  };

  return (
    <div>
      {/* Your media player content */}
    </div>
  );
};

// Example 5: Global error handling setup
export const setupGlobalErrorHandling = () => {
  // The ErrorHandlerProvider automatically sets up:
  // - Console error/warning monitoring
  // - Fetch request monitoring
  // - XMLHttpRequest monitoring
  // - Unhandled promise rejection monitoring
  // - Global error event monitoring
  
  console.log('Global error handling is active!');
  
  // Test the handler
  setTimeout(() => {
    console.error('This is a test 404 error message');
  }, 1000);
};

// Example 6: Conditional 404 routing
export const conditional404Routing = (condition, reason) => {
  if (condition) {
    errorHandler.trigger404(reason);
  }
};

// Example 7: API wrapper with 404 handling
export const apiWrapper = {
  get: async (url) => {
    try {
      const response = await fetch(url);
      
      if (response.status === 404) {
        // Let the error handler deal with it
        throw new Error(`404: ${url} not found`);
      }
      
      return response;
    } catch (error) {
      // The error handler will catch this automatically
      throw error;
    }
  },
  
  post: async (url, data) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (response.status === 404) {
        throw new Error(`404: ${url} not found`);
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }
};

// Example 8: Testing the error handler
export const testErrorHandler = () => {
  console.log('Testing error handler...');
  
  // Test console.error
  console.error('This is a test 404 error');
  
  // Test console.warn
  console.warn('This is a test not found warning');
  
  // Test manual trigger
  setTimeout(() => {
    errorHandler.trigger404('Test manual trigger');
  }, 2000);
};

// Example 9: Integration with React Query
export const useMediaQuery = (mediaId) => {
  const { trigger404 } = use404Handler();
  
  return useQuery({
    queryKey: ['media', mediaId],
    queryFn: async () => {
      const response = await fetch(`/api/media/${mediaId}`);
      
      if (response.status === 404) {
        trigger404(`Media with ID ${mediaId} not found`);
        throw new Error('Media not found');
      }
      
      return response.json();
    },
    onError: (error) => {
      // The error handler will handle 404s automatically
      console.error('Media query error:', error);
    }
  });
};

// Example 10: Cleanup and restoration
export const cleanupErrorHandler = () => {
  // Only call this if you want to completely remove the error handler
  // Usually not needed as it stays global
  errorHandler.cleanup();
}; 