/**
 * Error Testing Utilities for Archive of Obselis
 * 
 * This file provides helper functions to test error pages and scenarios
 * from anywhere in the frontend application.
 */

/**
 * Test a specific HTTP error code
 * @param {number} errorCode - The HTTP error code to test (500, 501, 502, etc.)
 * @returns {Promise<Object>} - Test result object
 */
export const testErrorCode = async (errorCode) => {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`/api/test/test-${errorCode}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      code: errorCode,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      success: response.status === errorCode,
      error: null,
      message: response.status === errorCode 
        ? `✅ Successfully triggered ${errorCode} error`
        : `❌ Unexpected response: ${response.status} instead of ${errorCode}`
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      code: errorCode,
      status: 'Network Error',
      statusText: 'Failed to fetch',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      success: false,
      error: error.message,
      message: `❌ Network error: ${error.message}`
    };
  }
};

/**
 * Test all 5xx error codes
 * @returns {Promise<Array>} - Array of test results
 */
export const testAllErrors = async () => {
  const errorCodes = [500, 501, 502, 503, 504, 505];
  const results = [];

  for (const code of errorCodes) {
    const result = await testErrorCode(code);
    results.push(result);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
};

/**
 * Navigate to a specific error page
 * @param {number} errorCode - The HTTP error code
 */
export const viewErrorPage = (errorCode) => {
  window.location.href = `/error/${errorCode}`;
};

/**
 * Trigger a real server error
 * @returns {Promise<Object>} - Test result object
 */
export const triggerRealError = async () => {
  const startTime = Date.now();
  
  try {
    await fetch('/api/test/trigger-error');
    // This should never reach here as it throws an error
    return {
      code: 'Real Error',
      status: 'Unexpected Success',
      statusText: 'No Error Thrown',
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
      success: false,
      error: 'Expected error was not thrown',
      message: '❌ Real error test failed - no error was thrown'
    };
  } catch (error) {
    return {
      code: 'Real Error',
      status: 'Thrown Error',
      statusText: 'Server Error',
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
      success: true,
      error: null,
      message: '✅ Successfully triggered real server error'
    };
  }
};

/**
 * Simulate a network error by making a request to a non-existent endpoint
 * @returns {Promise<Object>} - Test result object
 */
export const simulateNetworkError = async () => {
  const startTime = Date.now();
  
  try {
    const response = await fetch('/api/nonexistent-endpoint-that-will-fail', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return {
      code: 'Network Error',
      status: response.status,
      statusText: response.statusText,
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
      success: false,
      error: 'Endpoint should not exist',
      message: `❌ Unexpected success: ${response.status}`
    };
  } catch (error) {
    return {
      code: 'Network Error',
      status: 'Network Error',
      statusText: 'Failed to fetch',
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
      success: true,
      error: null,
      message: '✅ Successfully simulated network error'
    };
  }
};

/**
 * Test error page responsiveness by simulating different screen sizes
 * @param {number} errorCode - The HTTP error code to test
 */
export const testErrorPageResponsiveness = (errorCode) => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  
  // Test mobile view
  window.resizeTo(375, 667);
  viewErrorPage(errorCode);
  
  // Reset after a delay
  setTimeout(() => {
    window.resizeTo(originalWidth, originalHeight);
  }, 2000);
};

/**
 * Console logging utility for error testing
 * @param {string} message - Message to log
 * @param {string} type - Log type (info, warn, error)
 */
export const logErrorTest = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = '🏛️ [Error Test]';
  
  switch (type) {
    case 'error':
      console.error(`${prefix} ${timestamp}: ${message}`);
      break;
    case 'warn':
      console.warn(`${prefix} ${timestamp}: ${message}`);
      break;
    default:
      console.log(`${prefix} ${timestamp}: ${message}`);
  }
};

/**
 * Batch test multiple scenarios
 * @returns {Promise<Object>} - Comprehensive test results
 */
export const runComprehensiveTest = async () => {
  logErrorTest('Starting comprehensive error test suite...');
  
  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };

  // Test all 5xx errors
  const errorResults = await testAllErrors();
  results.tests.push(...errorResults);

  // Test real error
  const realErrorResult = await triggerRealError();
  results.tests.push(realErrorResult);

  // Test network error
  const networkErrorResult = await simulateNetworkError();
  results.tests.push(networkErrorResult);

  // Calculate summary
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.success).length;
  results.summary.failed = results.tests.filter(t => !t.success).length;

  logErrorTest(`Comprehensive test completed: ${results.summary.passed}/${results.summary.total} passed`);
  
  return results;
};

// Export all functions
export default {
  testErrorCode,
  testAllErrors,
  viewErrorPage,
  triggerRealError,
  simulateNetworkError,
  testErrorPageResponsiveness,
  logErrorTest,
  runComprehensiveTest
}; 