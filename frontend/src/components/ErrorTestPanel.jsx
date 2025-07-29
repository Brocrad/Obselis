import React, { useState } from 'react';

const ErrorTestPanel = () => {
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const clientErrorTests = [
    // 4xx Client Errors
    { code: 400, name: 'Bad Request', description: 'The request could not be understood' },
    { code: 401, name: 'Unauthorized', description: 'Authentication required' },
    { code: 403, name: 'Forbidden', description: 'Access denied' },
    { code: 404, name: 'Not Found', description: 'The requested resource was not found' },
    { code: 405, name: 'Method Not Allowed', description: 'The HTTP method is not supported' },
    { code: 408, name: 'Request Timeout', description: 'The request timed out' },
    { code: 413, name: 'Payload Too Large', description: 'The request entity is too large' },
    { code: 422, name: 'Unprocessable Entity', description: 'The request was well-formed but cannot be processed' },
    { code: 429, name: 'Too Many Requests', description: 'Rate limit exceeded' }
  ];

  const serverErrorTests = [
    // 5xx Server Errors
    { code: 500, name: 'Internal Server Error', description: 'Server encountered an unexpected condition' },
    { code: 501, name: 'Not Implemented', description: 'Server does not support the requested functionality' },
    { code: 502, name: 'Bad Gateway', description: 'Server received an invalid response from upstream' },
    { code: 503, name: 'Service Unavailable', description: 'Server is temporarily unavailable' },
    { code: 504, name: 'Gateway Timeout', description: 'Server did not receive a timely response' },
    { code: 505, name: 'HTTP Version Not Supported', description: 'Server does not support the HTTP protocol version' }
  ];

  const testError = async (errorCode) => {
    setIsLoading(true);
    const startTime = Date.now();
    
    try {
      console.log(`Testing error ${errorCode} at /api/test/test-${errorCode}`);
      
      const url = `/api/test/test-${errorCode}`;
      console.log(`Making fetch request to: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`Response received:`, {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        ok: response.ok,
        type: response.type
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      const result = {
        code: errorCode,
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        success: response.status === errorCode,
        error: null
      };

      if (response.status === errorCode) {
        // This is expected - the error page should be displayed
        result.message = `✅ Successfully triggered ${errorCode} error`;
      } else {
        result.message = `❌ Unexpected response: ${response.status} instead of ${errorCode}`;
        result.error = `Expected ${errorCode}, got ${response.status}`;
      }

      console.log(`Test result:`, result);
      setTestResults(prev => [...prev, result]);
    } catch (error) {
      console.error(`Error testing ${errorCode}:`, error);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      const result = {
        code: errorCode,
        status: 'Network Error',
        statusText: 'Failed to fetch',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        message: `❌ Network error: ${error.message}`
      };

      setTestResults(prev => [...prev, result]);
    } finally {
      setIsLoading(false);
    }
  };

  const testAllErrors = async (errorTests) => {
    setIsLoading(true);
    setTestResults([]);
    
    for (const test of errorTests) {
      await testError(test.code);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsLoading(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

        const testReactErrorPage = (errorCode) => {
          // Test the React error page directly
          window.location.href = `/api/test/react-${errorCode}`;
        };

  const testConnectivity = async () => {
    setIsLoading(true);
    try {
      console.log('Testing basic connectivity to /api/test/');
      const response = await fetch('/api/test/', {
        method: 'GET',
      });
      
      const data = await response.json();
      console.log('Connectivity test response:', data);
      
      const result = {
        code: 'Connectivity',
        status: response.status,
        statusText: response.statusText,
        duration: 'N/A',
        timestamp: new Date().toISOString(),
        success: response.status === 200,
        error: null,
        message: response.status === 200 
          ? `✅ Connectivity test successful: ${data.message}`
          : `❌ Connectivity test failed: ${response.status}`
      };
      
      setTestResults(prev => [...prev, result]);
    } catch (error) {
      console.error('Connectivity test error:', error);
      const result = {
        code: 'Connectivity',
        status: 'Network Error',
        statusText: 'Failed to fetch',
        duration: 'N/A',
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        message: `❌ Connectivity test failed: ${error.message}`
      };
      
      setTestResults(prev => [...prev, result]);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4" style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            🏛️ Archive of Obselis - Error Testing Panel
          </h1>
          <p className="text-slate-400 text-lg">
            Test 4xx client errors and 5xx server errors with comprehensive API testing and React page viewing
          </p>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-4 justify-center mb-8 flex-wrap">
          <button
            onClick={() => testAllErrors(clientErrorTests)}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-semibold rounded-xl hover:from-orange-700 hover:to-red-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? '🔄 Testing...' : '🚫 Test 4xx Errors'}
          </button>
          
          <button
            onClick={() => testAllErrors(serverErrorTests)}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? '🔄 Testing...' : '🔧 Test 5xx Errors'}
          </button>
          
          <button
            onClick={testConnectivity}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            🔗 Test Connectivity
          </button>
          
          <button
            onClick={clearResults}
            className="px-6 py-3 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-xl hover:bg-slate-600/50 hover:text-slate-200 transition-all duration-300 flex items-center gap-2"
          >
            🗑️ Clear Results
          </button>
        </div>

        {/* 4xx Client Error Tests */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-slate-200 flex items-center gap-2">
            🚫 4xx Client Errors
            <span className="text-sm font-normal text-slate-400">
              ({clientErrorTests.length} errors)
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clientErrorTests.map((test) => (
              <div key={test.code} className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6 hover:border-slate-500/50 transition-all duration-300">
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold mb-2" style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    {test.code}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">{test.name}</h3>
                  <p className="text-slate-400 text-sm">{test.description}</p>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => testError(test.code)}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white text-sm font-medium rounded-lg hover:from-orange-700 hover:to-red-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Test API
                  </button>
                  <button
                    onClick={() => testReactErrorPage(test.code)}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-sm font-medium rounded-lg hover:from-cyan-700 hover:to-teal-700 transition-all duration-300"
                  >
                    React Page
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5xx Server Error Tests */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-slate-200 flex items-center gap-2">
            🔧 5xx Server Errors
            <span className="text-sm font-normal text-slate-400">
              ({serverErrorTests.length} errors)
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {serverErrorTests.map((test) => (
              <div key={test.code} className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6 hover:border-slate-500/50 transition-all duration-300">
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold mb-2" style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    {test.code}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">{test.name}</h3>
                  <p className="text-slate-400 text-sm">{test.description}</p>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => testError(test.code)}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Test API
                  </button>
                  <button
                    onClick={() => testReactErrorPage(test.code)}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-sm font-medium rounded-lg hover:from-cyan-700 hover:to-teal-700 transition-all duration-300"
                  >
                    React Page
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-slate-200 flex items-center gap-2">
              📊 Test Results
              <span className="text-sm font-normal text-slate-400">
                ({testResults.length} tests)
              </span>
            </h2>
            
            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    result.success 
                      ? 'bg-green-900/20 border-green-600/30' 
                      : 'bg-red-900/20 border-red-600/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-200">
                        {result.code}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        result.success 
                          ? 'bg-green-600/20 text-green-400' 
                          : 'bg-red-600/20 text-red-400'
                      }`}>
                        {result.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </div>
                    <span className="text-slate-400 text-sm">
                      {result.duration}
                    </span>
                  </div>
                  
                  <p className="text-slate-300 mb-2">{result.message}</p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Status:</span>
                      <span className="text-slate-200 ml-2">{result.status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Time:</span>
                      <span className="text-slate-200 ml-2">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  
                  {result.error && (
                    <div className="mt-2 p-2 bg-red-900/20 border border-red-600/30 rounded text-red-300 text-sm">
                      Error: {result.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 bg-slate-800/50 border border-slate-600/50 rounded-xl p-6">
          <h3 className="text-xl font-bold mb-4 text-slate-200 flex items-center gap-2">
            📖 How to Test Error Pages
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-slate-300 mb-2">🧪 API Testing</h4>
              <ul className="text-slate-400 space-y-1 text-sm">
                <li>• <strong>Test 4xx Errors:</strong> Test all client error APIs at once</li>
                <li>• <strong>Test 5xx Errors:</strong> Test all server error APIs at once</li>
                <li>• <strong>Individual Tests:</strong> Test specific error codes</li>
                <li>• <strong>Test Connectivity:</strong> Verify API endpoint availability</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-300 mb-2">🌐 Page Testing</h4>
              <ul className="text-slate-400 space-y-1 text-sm">
                <li>• <strong>React Pages:</strong> Rich error pages with contact support</li>
                <li>• <strong>4xx Client Errors:</strong> Bad Request, Unauthorized, Forbidden, etc.</li>
                <li>• <strong>5xx Server Errors:</strong> Internal Server Error, Service Unavailable, etc.</li>
                <li>• <strong>Responsive Design:</strong> Test on mobile devices</li>
                <li>• <strong>Animations:</strong> Check mystical effects and transitions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorTestPanel; 