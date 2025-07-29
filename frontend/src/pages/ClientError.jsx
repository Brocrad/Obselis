import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ContactSupportModal from '../components/ContactSupportModal';
import { authManager } from '../utils/authManager';

const ClientError = () => {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Get error code from URL path
  const errorCode = location.pathname.split('/').pop() || '400';
  
  // Error configurations for different 4xx status codes
  const errorConfigs = {
    '400': {
      title: 'Bad Request',
      subtitle: 'The request could not be understood',
      description: 'The server could not understand the request due to invalid syntax. Please check your request and try again.',
      icon: '📝',
      color: 'from-orange-400 to-red-400',
      bgColor: 'via-orange-900/20'
    },
    '401': {
      title: 'Unauthorized',
      subtitle: 'Authentication required',
      description: 'You need to be authenticated to access this resource. Please log in and try again.',
      icon: '🔐',
      color: 'from-red-400 to-pink-400',
      bgColor: 'via-red-900/20'
    },
    '403': {
      title: 'Forbidden',
      subtitle: 'Access denied',
      description: 'You do not have permission to access this resource. Please contact an administrator if you believe this is an error.',
      icon: '🚫',
      color: 'from-red-500 to-orange-500',
      bgColor: 'via-red-900/20'
    },
    '404': {
      title: 'Not Found',
      subtitle: 'The requested resource was not found',
      description: 'The page or resource you are looking for does not exist. Please check the URL and try again.',
      icon: '🔍',
      color: 'from-blue-400 to-purple-400',
      bgColor: 'via-blue-900/20'
    },
    '405': {
      title: 'Method Not Allowed',
      subtitle: 'The HTTP method is not supported',
      description: 'The HTTP method used is not allowed for this resource. Please use a different method.',
      icon: '⚡',
      color: 'from-yellow-400 to-orange-400',
      bgColor: 'via-yellow-900/20'
    },
    '408': {
      title: 'Request Timeout',
      subtitle: 'The request timed out',
      description: 'The server timed out waiting for the request. Please try again with a faster connection.',
      icon: '⏰',
      color: 'from-orange-400 to-red-400',
      bgColor: 'via-orange-900/20'
    },
    '413': {
      title: 'Payload Too Large',
      subtitle: 'The request entity is too large',
      description: 'The request entity is larger than the server is willing or able to process. Please reduce the size and try again.',
      icon: '📦',
      color: 'from-purple-400 to-pink-400',
      bgColor: 'via-purple-900/20'
    },
    '422': {
      title: 'Unprocessable Entity',
      subtitle: 'The request was well-formed but cannot be processed',
      description: 'The request was well-formed but contains semantic errors. Please check your input and try again.',
      icon: '⚠️',
      color: 'from-yellow-400 to-orange-400',
      bgColor: 'via-yellow-900/20'
    },
    '429': {
      title: 'Too Many Requests',
      subtitle: 'Rate limit exceeded',
      description: 'You have exceeded the rate limit for this resource. Please wait a moment and try again.',
      icon: '🚦',
      color: 'from-red-400 to-orange-400',
      bgColor: 'via-red-900/20'
    }
  };

  const config = errorConfigs[errorCode] || errorConfigs['400'];

  // Load error details from session storage
  useEffect(() => {
    const storedError = sessionStorage.getItem('lastClientError');
    if (storedError) {
      try {
        setErrorDetails(JSON.parse(storedError));
      } catch (error) {
        console.error('Failed to parse stored error details:', error);
      }
    } else {
      // If no stored error details, create a fallback for direct access
      console.log(`⚠️ No stored error details found - this might be a direct access to /${errorCode}`);
      setErrorDetails({
        errorCode: `ERR-${errorCode}-DIRECT-ACCESS`,
        source: 'direct_navigation',
        message: `Direct access to ${errorCode} error page`,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        referrer: document.referrer
      });
    }
  }, []);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    
    // Simulate retry delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to reload the page
    window.location.reload();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-900 ${config.bgColor} to-slate-900 flex items-center justify-center relative overflow-hidden`}>
      {/* Animated background particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(25)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-1 h-1 bg-gradient-to-r ${config.color} rounded-full opacity-40`}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${4 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 4}s`
            }}
          />
        ))}
      </div>

      {/* Glow effects */}
      <div className={`absolute top-1/4 left-1/4 w-64 h-64 ${config.color.replace('from-', 'bg-').replace(' to-', '-')}/10 rounded-full blur-3xl animate-pulse`} />
      <div className={`absolute bottom-1/4 right-1/4 w-64 h-64 ${config.color.replace('from-', 'bg-').replace(' to-', '-')}/10 rounded-full blur-3xl animate-pulse`} style={{ animationDelay: '2s' }} />
      <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 ${config.color.replace('from-', 'bg-').replace(' to-', '-')}/5 rounded-full blur-3xl animate-pulse`} style={{ animationDelay: '1s' }} />

      <div className="text-center text-white relative z-10 max-w-2xl mx-auto px-6">
        {/* Mystical symbol */}
        <div className="text-8xl mb-6 animate-bounce" style={{ animationDuration: '2s' }}>
          {config.icon}
        </div>

        {/* Error code */}
        <h1 className={`text-7xl font-bold mb-4 bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
          {errorCode}
        </h1>

        {/* Title */}
        <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-red-400 to-pink-400 bg-clip-text text-transparent">
          {config.title}
        </h2>

        {/* Subtitle */}
        <p className="text-xl text-slate-300 mb-6">
          {config.subtitle}
        </p>

        {/* Description */}
        <p className="text-slate-400 mb-8 leading-relaxed">
          {config.description}
        </p>

        {/* Error details (if available) */}
        {retryCount > 0 && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-300">
              Retry attempt: {retryCount} - Still experiencing issues
            </p>
          </div>
        )}

        {/* Error Code Display */}
        {errorDetails && (
          <div className="mb-6 p-4 bg-slate-800/50 border border-slate-600 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-300">Error Code:</p>
              <button
                onClick={() => navigator.clipboard.writeText(errorDetails.errorCode)}
                className="text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600 transition-colors"
                title="Copy error code"
              >
                📋 Copy
              </button>
            </div>
            <p className="text-lg font-mono text-blue-400 mb-2">{errorDetails.errorCode}</p>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-300 mb-1">Technical Details</summary>
              <div className="space-y-1 mt-2">
                <p><strong>Source:</strong> {errorDetails.source}</p>
                <p><strong>Message:</strong> {errorDetails.message}</p>
                <p><strong>Timestamp:</strong> {errorDetails.timestamp}</p>
                <p><strong>URL:</strong> {errorDetails.url}</p>
                {errorDetails.sessionId !== 'unknown' && (
                  <p><strong>Session ID:</strong> {errorDetails.sessionId}</p>
                )}
                {errorDetails.userId !== 'unknown' && (
                  <p><strong>User ID:</strong> {errorDetails.userId}</p>
                )}
                {errorDetails.memory && (
                  <p><strong>Memory Usage:</strong> {Math.round(errorDetails.memory.usedJSHeapSize / 1024 / 1024)}MB / {Math.round(errorDetails.memory.totalJSHeapSize / 1024 / 1024)}MB</p>
                )}
                {errorDetails.network && (
                  <p><strong>Network:</strong> {errorDetails.network.effectiveType} ({errorDetails.network.downlink}Mbps)</p>
                )}
              </div>
            </details>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={`px-8 py-4 bg-gradient-to-r ${config.color} text-white font-semibold rounded-xl hover:from-red-600 hover:to-orange-600 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span>{isRetrying ? '⏳' : '🔄'}</span>
            <span>{isRetrying ? 'Retrying...' : 'Try Again'}</span>
          </button>
          
          <button
            onClick={handleRefresh}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <span>🔄</span>
            <span>Refresh Page</span>
          </button>
        </div>

        {/* Navigation buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => {
              // Try to go back first, if that fails, go to home
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/', { replace: true });
              }
            }}
            className="px-8 py-4 bg-slate-700/50 border border-slate-600 text-slate-300 font-semibold rounded-xl hover:bg-slate-600/50 hover:text-white transform hover:scale-105 transition-all duration-200 backdrop-blur-sm flex items-center gap-2"
          >
            <span>🏠</span>
            <span>Return Home</span>
          </button>
          
          <button
            onClick={goBack}
            className="px-8 py-4 bg-slate-700/50 border border-slate-600 text-slate-300 font-semibold rounded-xl hover:bg-slate-600/50 hover:text-white transform hover:scale-105 transition-all duration-200 backdrop-blur-sm flex items-center gap-2"
          >
            <span>⬅️</span>
            <span>Go Back</span>
          </button>
        </div>

        {/* Contact Support Button */}
        <div className="mt-8">
          <button
            onClick={() => setShowContactModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:from-cyan-600 hover:to-blue-600 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 mx-auto"
          >
            <span>📧</span>
            <span>Contact Support</span>
          </button>
        </div>

        {/* Mystical quote */}
        <div className="mt-8 p-4 bg-slate-800/30 border border-slate-600/30 rounded-lg">
          <p className="text-slate-400 italic text-sm">
            "In the Archive of Obselis, even errors are part of the mystical journey. Every misstep is a step toward understanding."
          </p>
        </div>
      </div>

      {/* Contact Support Modal */}
      {showContactModal && (
        <ContactSupportModal
          isOpen={showContactModal}
          onClose={() => setShowContactModal(false)}
          errorCode={errorCode}
          errorDetails={errorDetails}
        />
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
      `}</style>
    </div>
  );
};

export default ClientError; 