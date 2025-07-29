import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global Error Handler for 404 Detection and Routing
 * Automatically routes users to the 404 page when 404 errors are detected
 */

class ErrorHandler {
  constructor() {
    this.navigate = null;
    this.isInitialized = false;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
    this.originalFetch = window.fetch;
    this.originalXMLHttpRequest = window.XMLHttpRequest;
    this.errorPatterns = [
      /404/,
      /not found/i,
      /page not found/i,
      /resource not found/i,
      /endpoint not found/i,
      /route not found/i,
      /path not found/i
    ];
    this.serverErrorPatterns = [
      /500/,
      /internal server error/i,
      /server error/i,
      /internal error/i,
      /server is down/i,
      /service unavailable/i,
      /bad gateway/i,
      /gateway timeout/i
    ];
    this.ignoredUrls = [
      '/api/health',
      '/api/metrics',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/logout',
      '/api/auth/verify',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/auth/change-password',
      '/api/auth/invites',
      '/api/auth/users'
    ];
  }

  /**
   * Initialize the error handler with navigation function
   * @param {Function} navigate - React Router navigate function
   */
  init(navigate) {
    if (this.isInitialized) return;
    
    // Check if error handler is disabled (for debugging)
    if (sessionStorage.getItem('disableErrorHandler') === 'true') {
      console.log('🔍 Error Handler disabled by sessionStorage flag');
      return;
    }
    
    this.navigate = navigate;
    this.isInitialized = true;
    
    // Override console methods
    this.overrideConsole();
    
    // Override fetch
    this.overrideFetch();
    
    // Override XMLHttpRequest
    this.overrideXMLHttpRequest();
    
    // Listen for unhandled promise rejections
    this.handleUnhandledRejections();
    
    // Listen for global errors
    this.handleGlobalErrors();
    
    console.log('🔍 Error Handler initialized - 404 detection active');
  }

  /**
   * Override console.error and console.warn to detect 404 patterns
   */
  overrideConsole() {
    const self = this;
    
    console.error = function(...args) {
      // Call original console.error
      self.originalConsoleError.apply(console, args);
      
      // Check for error patterns
      const message = args.join(' ');
      if (self.is404Error(message)) {
        self.handle404Error('Console Error', message);
      } else if (self.isServerError(message)) {
        self.handleServerError('Console Error', message);
      }
    };

    console.warn = function(...args) {
      // Call original console.warn
      self.originalConsoleWarn.apply(console, args);
      
      // Check for error patterns
      const message = args.join(' ');
      if (self.is404Error(message)) {
        self.handle404Error('Console Warning', message);
      } else if (self.isServerError(message)) {
        self.handleServerError('Console Warning', message);
      }
    };
  }

  /**
   * Override fetch to detect 404 responses
   */
  overrideFetch() {
    const self = this;
    
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      
      // Skip ignored URLs
      if (self.shouldIgnoreUrl(url)) {
        return self.originalFetch.apply(window, args);
      }
      
      return self.originalFetch.apply(window, args)
        .then(response => {
          // Only handle errors for non-authentication endpoints and when not in auth flow
          if (!self.isAuthenticationFlow() && !self.shouldIgnoreUrl(url)) {
            if (response.status === 404) {
              self.handle404Error('Fetch Response', `404 error for ${url}`);
            } else if (response.status >= 500) {
              self.handleServerError('Fetch Response', `${response.status} error for ${url}`);
            }
          }
          return response;
        })
        .catch(error => {
          if (self.is404Error(error.message)) {
            self.handle404Error('Fetch Error', error.message);
          } else if (self.isServerError(error.message)) {
            self.handleServerError('Fetch Error', error.message);
          }
          throw error;
        });
    };
  }

  /**
   * Override XMLHttpRequest to detect 404 responses
   */
  overrideXMLHttpRequest() {
    const self = this;
    const OriginalXMLHttpRequest = this.originalXMLHttpRequest;
    
    window.XMLHttpRequest = function() {
      const xhr = new OriginalXMLHttpRequest();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      
      xhr.open = function(method, url, ...args) {
        this._url = url;
        return originalOpen.apply(this, [method, url, ...args]);
      };
      
      xhr.send = function(...args) {
        const url = this._url;
        
        // Skip ignored URLs
        if (self.shouldIgnoreUrl(url)) {
          return originalSend.apply(this, args);
        }
        
        this.addEventListener('load', function() {
          if (this.status === 404) {
            self.handle404Error('XMLHttpRequest', `404 error for ${url}`);
          } else if (this.status >= 500) {
            self.handleServerError('XMLHttpRequest', `${this.status} error for ${url}`);
          }
        });
        
        this.addEventListener('error', function() {
          if (self.is404Error(this.statusText)) {
            self.handle404Error('XMLHttpRequest Error', this.statusText);
          } else if (self.isServerError(this.statusText)) {
            self.handleServerError('XMLHttpRequest Error', this.statusText);
          }
        });
        
        return originalSend.apply(this, args);
      };
      
      return xhr;
    };
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejections() {
    const self = this;
    
    window.addEventListener('unhandledrejection', function(event) {
      const message = event.reason?.message || event.reason?.toString() || '';
      
      if (self.is404Error(message)) {
        self.handle404Error('Unhandled Promise Rejection', message);
      } else if (self.isServerError(message)) {
        self.handleServerError('Unhandled Promise Rejection', message);
      }
    });
  }

  /**
   * Handle global errors
   */
  handleGlobalErrors() {
    const self = this;
    
    window.addEventListener('error', function(event) {
      const message = event.message || event.error?.message || '';
      
      if (self.is404Error(message)) {
        self.handle404Error('Global Error', message);
      } else if (self.isServerError(message)) {
        self.handleServerError('Global Error', message);
      }
    });
  }

  /**
   * Check if a message contains 404 error patterns
   * @param {string} message - Error message to check
   * @returns {boolean} - True if 404 error detected
   */
  is404Error(message) {
    if (!message || typeof message !== 'string') return false;
    
    return this.errorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Check if a message contains server error patterns
   * @param {string} message - Error message to check
   * @returns {boolean} - True if server error detected
   */
  isServerError(message) {
    if (!message || typeof message !== 'string') return false;
    
    return this.serverErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Check if URL should be ignored (health checks, etc.)
   * @param {string} url - URL to check
   * @returns {boolean} - True if URL should be ignored
   */
  shouldIgnoreUrl(url) {
    if (!url) return false;
    
    return this.ignoredUrls.some(ignoredUrl => 
      url.includes(ignoredUrl) || url.endsWith(ignoredUrl)
    );
  }

  /**
   * Handle 404 error detection
   * @param {string} source - Source of the error
   * @param {string} message - Error message
   */
  handle404Error(source, message) {
    // Don't redirect during authentication flows
    if (this.isAuthenticationFlow()) {
      console.log(`🔍 404 detected during auth flow from ${source}: ${message} - not redirecting`);
      return;
    }
    
    console.log(`🔍 404 detected from ${source}: ${message}`);
    
    // Prevent multiple redirects
    if (window.location.pathname === '/404' || window.location.pathname === '/not-found') {
      return;
    }
    
    // Add a small delay to prevent immediate redirects
    setTimeout(() => {
      if (this.navigate) {
        this.navigate('/404');
      } else {
        // Fallback to window.location if navigate is not available
        window.location.href = '/404';
      }
    }, 100);
  }

  /**
   * Handle server error detection
   * @param {string} source - Source of the error
   * @param {string} message - Error message
   */
  handleServerError(source, message) {
    // Don't redirect during authentication flows
    if (this.isAuthenticationFlow()) {
      console.log(`🔧 Server error detected during auth flow from ${source}: ${message} - not redirecting`);
      return;
    }
    
    // Generate unique error code
    const errorCode = this.generateErrorCode();
    const errorDetails = this.createErrorDetails(source, message, errorCode);
    
    console.log(`🔧 Server error detected from ${source}: ${message}`);
    console.log(`🔍 Error Code: ${errorCode}`);
    
    // Store error details in session storage for the 500 page
    sessionStorage.setItem('lastServerError', JSON.stringify(errorDetails));
    
    // Prevent multiple redirects
    if (window.location.pathname === '/500' || window.location.pathname === '/server-error') {
      return;
    }
    
    // Add a small delay to prevent immediate redirects
    setTimeout(() => {
      if (this.navigate) {
        this.navigate('/500');
      } else {
        // Fallback to window.location if navigate is not available
        window.location.href = '/500';
      }
    }, 100);
  }

  /**
   * Check if we're in an authentication flow
   * @returns {boolean} - True if in auth flow
   */
  isAuthenticationFlow() {
    const authPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/change-password'];
    const currentPath = window.location.pathname;
    
    // Check if current path is an auth path
    if (authPaths.some(path => currentPath.includes(path))) {
      console.log('🔍 Auth flow detected: current path is auth path', currentPath);
      return true;
    }
    
    // Check if we have a token (user is logged in)
    const token = sessionStorage.getItem('token');
    if (!token) {
      console.log('🔍 Auth flow detected: no token found');
      return true; // No token means we might be in auth flow
    }
    
    console.log('🔍 Not in auth flow: has token and not on auth path');
    return false;
  }

  /**
   * Generate a unique error code
   * @returns {string} - Unique error code
   */
  generateErrorCode() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `ERR-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Create detailed error information
   * @param {string} source - Source of the error
   * @param {string} message - Error message
   * @param {string} errorCode - Unique error code
   * @returns {object} - Detailed error information
   */
  createErrorDetails(source, message, errorCode) {
    return {
      errorCode,
      source,
      message,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      stack: new Error().stack,
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      } : null,
      network: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt
      } : null,
      sessionId: sessionStorage.getItem('sessionId') || 'unknown',
      userId: sessionStorage.getItem('userId') || 'unknown'
    };
  }

  /**
   * Manually trigger 404 routing
   * @param {string} reason - Reason for the 404
   */
  trigger404(reason = 'Manual trigger') {
    this.handle404Error('Manual', reason);
  }

  /**
   * Manually trigger server error routing
   * @param {string} reason - Reason for the server error
   */
  triggerServerError(reason = 'Manual trigger') {
    this.handleServerError('Manual', reason);
  }

  /**
   * Add custom 404 pattern to detect
   * @param {RegExp} pattern - Regex pattern to match
   */
  add404Pattern(pattern) {
    if (pattern instanceof RegExp) {
      this.errorPatterns.push(pattern);
    }
  }

  /**
   * Add custom server error pattern to detect
   * @param {RegExp} pattern - Regex pattern to match
   */
  addServerErrorPattern(pattern) {
    if (pattern instanceof RegExp) {
      this.serverErrorPatterns.push(pattern);
    }
  }

  /**
   * Add URL to ignore list
   * @param {string} url - URL to ignore
   */
  addIgnoredUrl(url) {
    if (url && !this.ignoredUrls.includes(url)) {
      this.ignoredUrls.push(url);
    }
  }

  /**
   * Cleanup and restore original methods
   */
  cleanup() {
    if (!this.isInitialized) return;
    
    // Restore console methods
    console.error = this.originalConsoleError;
    console.warn = this.originalConsoleWarn;
    
    // Restore fetch
    window.fetch = this.originalFetch;
    
    // Restore XMLHttpRequest
    window.XMLHttpRequest = this.originalXMLHttpRequest;
    
    this.isInitialized = false;
    this.navigate = null;
    
    console.log('🧹 Error Handler cleaned up');
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// React Hook for using the error handler
export const useErrorHandler = () => {
  const navigate = useNavigate();
  
  React.useEffect(() => {
    errorHandler.init(navigate);
    
    // Cleanup on unmount
    return () => {
      // Don't cleanup on component unmount to keep it global
      // errorHandler.cleanup();
    };
  }, [navigate]);
  
  return errorHandler;
};

// Export the singleton for direct use
export default errorHandler; 