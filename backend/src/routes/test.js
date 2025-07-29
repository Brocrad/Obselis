const express = require('express');
const router = express.Router();

// Simple test endpoint to verify routes are working
router.get('/', (req, res) => {
  res.json({ 
    message: 'Test routes are working!',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      // 4xx Client Error endpoints
      '/api/test/test-400',
      '/api/test/test-401', 
      '/api/test/test-403',
      '/api/test/test-404',
      '/api/test/test-405',
      '/api/test/test-408',
      '/api/test/test-413',
      '/api/test/test-422',
      '/api/test/test-429',
      '/api/test/react-400',
      '/api/test/react-401',
      '/api/test/react-403',
      '/api/test/react-404',
      '/api/test/react-405',
      '/api/test/react-408',
      '/api/test/react-413',
      '/api/test/react-422',
      '/api/test/react-429',
      // 5xx Server Error endpoints
      '/api/test/test-500',
      '/api/test/test-501', 
      '/api/test/test-502',
      '/api/test/test-503',
      '/api/test/test-504',
      '/api/test/test-505',
      '/api/test/view-500',
      '/api/test/view-501',
      '/api/test/view-502', 
      '/api/test/view-503',
      '/api/test/view-504',
      '/api/test/view-505',
      '/api/test/react-500',
      '/api/test/react-501',
      '/api/test/react-502',
      '/api/test/react-503',
      '/api/test/react-504',
      '/api/test/react-505',
      '/api/test/trigger-error',
      '/api/test/error-pages'
    ]
  });
});

// Test route to trigger 404
router.get('/trigger-404', (req, res) => {
  res.status(404).json({ 
    message: 'This is a test 404 response',
    timestamp: new Date().toISOString()
  });
});

// Test route to trigger error
router.get('/trigger-error', (req, res) => {
  throw new Error('This is a test error');
});

// Test routes for 5xx errors - these return the actual error status codes
router.get('/test-500', (req, res) => {
  res.status(500).json({ 
    message: 'This is a test 500 Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-501', (req, res) => {
  res.status(501).json({ 
    message: 'This is a test 501 Not Implemented',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-502', (req, res) => {
  res.status(502).json({ 
    message: 'This is a test 502 Bad Gateway',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-503', (req, res) => {
  res.status(503).json({ 
    message: 'This is a test 503 Service Unavailable',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-504', (req, res) => {
  res.status(504).json({ 
    message: 'This is a test 504 Gateway Timeout',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-505', (req, res) => {
  res.status(505).json({ 
    message: 'This is a test 505 HTTP Version Not Supported',
    timestamp: new Date().toISOString()
  });
});

// Test routes for 4xx errors - these return the actual error status codes
router.get('/test-400', (req, res) => {
  res.status(400).json({ 
    message: 'This is a test 400 Bad Request',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-401', (req, res) => {
  res.status(401).json({ 
    message: 'This is a test 401 Unauthorized',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-403', (req, res) => {
  res.status(403).json({ 
    message: 'This is a test 403 Forbidden',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-404', (req, res) => {
  res.status(404).json({ 
    message: 'This is a test 404 Not Found',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-405', (req, res) => {
  res.status(405).json({ 
    message: 'This is a test 405 Method Not Allowed',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-408', (req, res) => {
  res.status(408).json({ 
    message: 'This is a test 408 Request Timeout',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-413', (req, res) => {
  res.status(413).json({ 
    message: 'This is a test 413 Payload Too Large',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-422', (req, res) => {
  res.status(422).json({ 
    message: 'This is a test 422 Unprocessable Entity',
    timestamp: new Date().toISOString()
  });
});

router.get('/test-429', (req, res) => {
  res.status(429).json({ 
    message: 'This is a test 429 Too Many Requests',
    timestamp: new Date().toISOString()
  });
});

// Page redirect routes for viewing themed error pages
router.get('/view-500', (req, res) => {
  res.redirect('/error/500');
});

router.get('/view-501', (req, res) => {
  res.redirect('/error/501');
});

router.get('/view-502', (req, res) => {
  res.redirect('/error/502');
});

router.get('/view-503', (req, res) => {
  res.redirect('/error/503');
});

router.get('/view-504', (req, res) => {
  res.redirect('/error/504');
});

router.get('/view-505', (req, res) => {
  res.redirect('/error/505');
});

// Real error simulation routes - these trigger actual error handling
router.get('/simulate-500', (req, res, next) => {
  const error = new Error('Simulated 500 Internal Server Error');
  error.statusCode = 500;
  next(error);
});

router.get('/simulate-501', (req, res, next) => {
  const error = new Error('Simulated 501 Not Implemented');
  error.statusCode = 501;
  next(error);
});

router.get('/simulate-502', (req, res, next) => {
  const error = new Error('Simulated 502 Bad Gateway');
  error.statusCode = 502;
  next(error);
});

router.get('/simulate-503', (req, res, next) => {
  const error = new Error('Simulated 503 Service Unavailable');
  error.statusCode = 503;
  next(error);
});

router.get('/simulate-504', (req, res, next) => {
  const error = new Error('Simulated 504 Gateway Timeout');
  error.statusCode = 504;
  next(error);
});

router.get('/simulate-505', (req, res, next) => {
  const error = new Error('Simulated 505 HTTP Version Not Supported');
  error.statusCode = 505;
  next(error);
});

// React error page routes - these redirect to the React error pages
router.get('/react-500', (req, res) => {
  res.redirect('/500');
});

router.get('/react-501', (req, res) => {
  res.redirect('/501');
});

router.get('/react-502', (req, res) => {
  res.redirect('/502');
});

router.get('/react-503', (req, res) => {
  res.redirect('/503');
});

router.get('/react-504', (req, res) => {
  res.redirect('/504');
});

router.get('/react-505', (req, res) => {
  res.redirect('/505');
});

// React error page routes for 4xx errors - these redirect to the React error pages
router.get('/react-400', (req, res) => {
  res.redirect('/400');
});

router.get('/react-401', (req, res) => {
  res.redirect('/401');
});

router.get('/react-403', (req, res) => {
  res.redirect('/403');
});

router.get('/react-404', (req, res) => {
  res.redirect('/404');
});

router.get('/react-405', (req, res) => {
  res.redirect('/405');
});

router.get('/react-408', (req, res) => {
  res.redirect('/408');
});

router.get('/react-413', (req, res) => {
  res.redirect('/413');
});

router.get('/react-422', (req, res) => {
  res.redirect('/422');
});

router.get('/react-429', (req, res) => {
  res.redirect('/429');
});

// Test route that redirects to error pages
router.get('/error-pages', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Error Pages - Archive of Obselis</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
                color: white;
                padding: 2rem;
                min-height: 100vh;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
            }
            h1 {
                text-align: center;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 2rem;
            }
            .error-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 1rem;
                margin-bottom: 2rem;
            }
            .error-card {
                background: rgba(148, 163, 184, 0.1);
                border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 12px;
                padding: 1.5rem;
                text-align: center;
                transition: all 0.3s ease;
            }
            .error-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
            }
            .error-code {
                font-size: 2rem;
                font-weight: bold;
                margin-bottom: 0.5rem;
            }
            .error-title {
                font-size: 1.1rem;
                margin-bottom: 1rem;
                color: #94a3b8;
            }
            .test-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 0.75rem 1.5rem;
                border-radius: 8px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                transition: all 0.3s ease;
                margin: 0.25rem;
            }
            .test-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .btn-secondary {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            }
            .info {
                background: rgba(16, 185, 129, 0.1);
                border: 1px solid rgba(16, 185, 129, 0.3);
                border-radius: 12px;
                padding: 1.5rem;
                margin-top: 2rem;
            }
            .info h3 {
                color: #34d399;
                margin-bottom: 1rem;
            }
            .info ul {
                color: #cbd5e1;
                line-height: 1.6;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏛️ Archive of Obselis - Error Page Testing</h1>
            
            <div class="error-grid">
                <div class="error-card">
                    <div class="error-code">500</div>
                    <div class="error-title">Internal Server Error</div>
                    <div>
                        <a href="/api/test/test-500" class="test-btn btn-primary">Test API</a>
                        <a href="/api/test/view-500" class="test-btn btn-secondary">View Page</a>
                    </div>
                </div>
                
                <div class="error-card">
                    <div class="error-code">501</div>
                    <div class="error-title">Not Implemented</div>
                    <div>
                        <a href="/api/test/test-501" class="test-btn btn-primary">Test API</a>
                        <a href="/api/test/view-501" class="test-btn btn-secondary">View Page</a>
                    </div>
                </div>
                
                <div class="error-card">
                    <div class="error-code">502</div>
                    <div class="error-title">Bad Gateway</div>
                    <div>
                        <a href="/api/test/test-502" class="test-btn btn-primary">Test API</a>
                        <a href="/api/test/view-502" class="test-btn btn-secondary">View Page</a>
                    </div>
                </div>
                
                <div class="error-card">
                    <div class="error-code">503</div>
                    <div class="error-title">Service Unavailable</div>
                    <div>
                        <a href="/api/test/test-503" class="test-btn btn-primary">Test API</a>
                        <a href="/api/test/view-503" class="test-btn btn-secondary">View Page</a>
                    </div>
                </div>
                
                <div class="error-card">
                    <div class="error-code">504</div>
                    <div class="error-title">Gateway Timeout</div>
                    <div>
                        <a href="/api/test/test-504" class="test-btn btn-primary">Test API</a>
                        <a href="/api/test/view-504" class="test-btn btn-secondary">View Page</a>
                    </div>
                </div>
                
                <div class="error-card">
                    <div class="error-code">505</div>
                    <div class="error-title">HTTP Version Not Supported</div>
                    <div>
                        <a href="/api/test/test-505" class="test-btn btn-primary">Test API</a>
                        <a href="/api/test/view-505" class="test-btn btn-secondary">View Page</a>
                    </div>
                </div>
            </div>
            
            <div class="info">
                <h3>🔍 How to Test Error Pages:</h3>
                <ul>
                    <li><strong>Test API:</strong> Returns JSON with correct error status codes</li>
                    <li><strong>View Page:</strong> Redirects to themed error pages</li>
                    <li><strong>Direct URLs:</strong> Visit <code>/error/500</code>, <code>/error/501</code>, etc.</li>
                    <li><strong>Real Error:</strong> Visit <code>/api/test/trigger-error</code> for actual server errors</li>
                </ul>
            </div>
        </div>
    </body>
    </html>
  `);
});

module.exports = router; 
