const path = require('path');
const fs = require('fs').promises;
const ErrorPageGenerator = require('../utils/errorPageGenerator');

class ErrorController {
  // Handle 400 Bad Request
  static async handle400(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(400);
        res.status(400).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'The request could not be understood by the server',
          code: 'BAD_REQUEST'
        });
      }
    } else {
      res.status(400).json({
        error: 'Bad Request',
        message: 'The request could not be understood by the server',
        code: 'BAD_REQUEST'
      });
    }
  }

  // Handle 401 Unauthorized
  static async handle401(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(401);
        res.status(401).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication is required to access this resource',
          code: 'UNAUTHORIZED'
        });
      }
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication is required to access this resource',
        code: 'UNAUTHORIZED'
      });
    }
  }

  // Handle 403 Forbidden
  static async handle403(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(403);
        res.status(403).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource',
          code: 'FORBIDDEN'
        });
      }
    } else {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
        code: 'FORBIDDEN'
      });
    }
  }

  // Handle 404 errors with custom Obselis-branded page
  static async handle404(req, res) {
    // Check if the request accepts HTML (browser request)
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(404);
        res.status(404).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        // Fallback to JSON if HTML file not found
        console.error('Error serving 404 page:', error);
        res.status(404).json({
          error: 'Page not found',
          message: 'The requested page could not be found in the Archive of Obselis',
          code: 'PAGE_NOT_FOUND'
        });
      }
    } else {
      // API request - return JSON
      res.status(404).json({
        error: 'Route not found',
        message: 'The requested endpoint does not exist',
        code: 'ROUTE_NOT_FOUND'
      });
    }
  }

  // Handle 405 Method Not Allowed
  static async handle405(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(405);
        res.status(405).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(405).json({
          error: 'Method Not Allowed',
          message: 'The HTTP method is not supported for this resource',
          code: 'METHOD_NOT_ALLOWED'
        });
      }
    } else {
      res.status(405).json({
        error: 'Method Not Allowed',
        message: 'The HTTP method is not supported for this resource',
        code: 'METHOD_NOT_ALLOWED'
      });
    }
  }

  // Handle 408 Request Timeout
  static async handle408(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(408);
        res.status(408).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(408).json({
          error: 'Request Timeout',
          message: 'The request timed out',
          code: 'REQUEST_TIMEOUT'
        });
      }
    } else {
      res.status(408).json({
        error: 'Request Timeout',
        message: 'The request timed out',
        code: 'REQUEST_TIMEOUT'
      });
    }
  }

  // Handle 413 Payload Too Large
  static async handle413(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(413);
        res.status(413).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(413).json({
          error: 'Payload Too Large',
          message: 'The uploaded file is too large',
          code: 'PAYLOAD_TOO_LARGE'
        });
      }
    } else {
      res.status(413).json({
        error: 'Payload Too Large',
        message: 'The uploaded file is too large',
        code: 'PAYLOAD_TOO_LARGE'
      });
    }
  }

    // Handle 429 Too Many Requests
  static async handle429(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(429);
        res.status(429).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'You have exceeded the rate limit. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
    } else {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'You have exceeded the rate limit. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
        });
    }
  }

  // Handle 422 Unprocessable Entity
  static async handle422(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(422);
        res.status(422).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'The request was well-formed but contains semantic errors.',
          code: 'UNPROCESSABLE_ENTITY'
        });
      }
    } else {
      res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'The request was well-formed but contains semantic errors.',
        code: 'UNPROCESSABLE_ENTITY'
      });
    }
  }

  // Handle 500 Internal Server Error
  static async handle500(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        console.log('Generating dynamic 500 error page...');
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(500);
        console.log('Dynamic 500 error page generated successfully');
        res.status(500).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        console.error('Error generating dynamic 500 page:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Something went wrong on our end. Please try again later.',
          code: 'INTERNAL_ERROR'
        });
      }
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Something went wrong on our end. Please try again later.',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Handle 502 Bad Gateway
  static async handle502(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(502);
        res.status(502).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'The server received an invalid response from an upstream server',
          code: 'BAD_GATEWAY'
        });
      }
    } else {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'The server received an invalid response from an upstream server',
        code: 'BAD_GATEWAY'
      });
    }
  }

  // Handle 503 Service Unavailable
  static async handle503(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(503);
        res.status(503).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'The service is temporarily unavailable. Please try again later.',
          code: 'SERVICE_UNAVAILABLE'
        });
      }
    } else {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'The service is temporarily unavailable. Please try again later.',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
  }

  // Handle 504 Gateway Timeout
  static async handle504(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(504);
        res.status(504).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'The gateway timed out while waiting for a response',
          code: 'GATEWAY_TIMEOUT'
        });
      }
    } else {
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'The gateway timed out while waiting for a response',
        code: 'GATEWAY_TIMEOUT'
      });
    }
  }

  // Handle 501 Not Implemented
  static async handle501(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(501);
        res.status(501).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(501).json({
          error: 'Not Implemented',
          message: 'The server does not support the requested functionality',
          code: 'NOT_IMPLEMENTED'
        });
      }
    } else {
      res.status(501).json({
        error: 'Not Implemented',
        message: 'The server does not support the requested functionality',
        code: 'NOT_IMPLEMENTED'
      });
    }
  }

  // Handle 505 HTTP Version Not Supported
  static async handle505(req, res) {
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        // Generate dynamic error page with rich features
        const html = ErrorPageGenerator.generateErrorPage(505);
        res.status(505).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        res.status(505).json({
          error: 'HTTP Version Not Supported',
          message: 'The server does not support the HTTP protocol version used in the request',
          code: 'HTTP_VERSION_NOT_SUPPORTED'
        });
      }
    } else {
      res.status(505).json({
        error: 'HTTP Version Not Supported',
        message: 'The server does not support the HTTP protocol version used in the request',
        code: 'HTTP_VERSION_NOT_SUPPORTED'
      });
    }
  }

  // Handle general errors
  static handleError(err, req, res, next) {
    console.error('Error occurred:', err);
    
    // Check if the request accepts HTML
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      // For HTML requests, redirect to appropriate error page
      const statusCode = err.statusCode || 500;
      res.status(statusCode).redirect(`/error/${statusCode}`);
    } else {
      // For API requests, return JSON error
      const statusCode = err.statusCode || 500;
      const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
      
      res.status(statusCode).json({
        error: 'Something went wrong!',
        message: message,
        code: err.code || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    }
  }

  // Handle specific error types
  static handleValidationError(err, req, res, next) {
    res.status(400).json({
      error: 'Validation failed',
      message: err.message,
      code: 'VALIDATION_ERROR',
      details: err.details || []
    });
  }

  static handleAuthenticationError(err, req, res, next) {
    res.status(401).json({
      error: 'Authentication failed',
      message: err.message || 'Invalid credentials',
      code: 'AUTHENTICATION_ERROR'
    });
  }

  static handleAuthorizationError(err, req, res, next) {
    res.status(403).json({
      error: 'Access denied',
      message: err.message || 'You do not have permission to access this resource',
      code: 'AUTHORIZATION_ERROR'
    });
  }

  static handleNotFoundError(err, req, res, next) {
    this.handle404(req, res);
  }

  // Generic error page handler
  static async handleGenericError(req, res) {
    const { statusCode } = req.params;
    const acceptsHtml = req.accepts('html');
    
    if (acceptsHtml) {
      try {
        const htmlPath = path.join(__dirname, `../public/${statusCode}.html`);
        const html = await fs.readFile(htmlPath, 'utf8');
        res.status(parseInt(statusCode)).set('Content-Type', 'text/html').send(html);
      } catch (error) {
        // Fallback to 500 page
        try {
          const htmlPath = path.join(__dirname, '../public/500.html');
          const html = await fs.readFile(htmlPath, 'utf8');
          res.status(parseInt(statusCode)).set('Content-Type', 'text/html').send(html);
        } catch (fallbackError) {
          res.status(parseInt(statusCode)).json({
            error: `Error ${statusCode}`,
            message: 'An error occurred',
            code: `ERROR_${statusCode}`
          });
        }
      }
    } else {
      res.status(parseInt(statusCode)).json({
        error: `Error ${statusCode}`,
        message: 'An error occurred',
        code: `ERROR_${statusCode}`
      });
    }
  }
}

module.exports = ErrorController; 
