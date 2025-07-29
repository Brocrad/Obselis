# Custom Error Controller

This custom error controller provides Obselis-branded error handling for the Archive of Obselis media server.

## Features

### 1. Custom 404 Page
- **Obselis-branded design** with mystical theme
- **Responsive layout** that works on all devices
- **Interactive elements** including search functionality
- **Animated background** with floating particles
- **Navigation options** to help users find content

### 2. Smart Error Handling
- **Content-type detection** - serves HTML for browsers, JSON for API requests
- **Development mode support** - shows detailed error information in development
- **Structured error responses** with consistent format
- **Multiple error types** supported (validation, authentication, authorization)

## File Structure

```
backend/src/
├── middleware/
│   ├── errorController.js          # Main error controller
│   └── ERROR_CONTROLLER_README.md  # This documentation
└── public/
    └── 404.html                    # Custom 404 page
```

## Usage

### Basic Setup

The error controller is automatically integrated into the server:

```javascript
// In server.js
const ErrorController = require('./middleware/errorController');

// Error handling middleware
app.use(ErrorController.handleError);

// 404 handler - must be last
app.use('*', ErrorController.handle404);
```

### Error Response Format

#### HTML Response (Browser)
- Serves the custom 404.html page for browser requests
- Includes search functionality and navigation options
- Fully responsive with Obselis branding

#### JSON Response (API)
```json
{
  "error": "Route not found",
  "message": "The requested endpoint does not exist",
  "code": "ROUTE_NOT_FOUND"
}
```

### Error Types

1. **404 Not Found**
   - Handles missing routes and pages
   - Serves custom HTML page for browsers
   - Returns JSON for API requests

2. **500 Internal Server Error**
   - Handles unexpected server errors
   - Shows detailed error in development mode
   - Generic message in production

3. **400 Validation Error**
   - Handles input validation failures
   - Includes validation details

4. **401 Authentication Error**
   - Handles authentication failures
   - Clear error messages for login issues

5. **403 Authorization Error**
   - Handles permission denied errors
   - Explains access restrictions

## Customization

### Modifying the 404 Page

Edit `backend/src/public/404.html` to customize:
- Colors and styling
- Text content
- Animations and effects
- Navigation options

### Adding New Error Types

Extend the ErrorController class:

```javascript
static handleCustomError(err, req, res, next) {
  res.status(418).json({
    error: 'Custom error',
    message: err.message,
    code: 'CUSTOM_ERROR'
  });
}
```

## Testing

### Development Routes

In development mode, test routes are available:

- `GET /api/test/trigger-404` - Test 404 handling
- `GET /api/test/trigger-error` - Test error handling

### Manual Testing

1. **Test 404 page**: Visit any non-existent route
2. **Test API errors**: Make invalid API requests
3. **Test search**: Use the search box on the 404 page
4. **Test navigation**: Click the navigation buttons

## Browser Support

The 404 page includes:
- **Modern CSS features** (gradients, animations, backdrop-filter)
- **Fallback styles** for older browsers
- **Responsive design** for all screen sizes
- **Touch-friendly** interface for mobile devices

## Performance

- **Lightweight** - Minimal JavaScript and CSS
- **Fast loading** - Optimized assets and minimal dependencies
- **Cached** - Static HTML file served efficiently
- **SEO friendly** - Proper meta tags and structure

## Security

- **No sensitive information** exposed in error messages
- **Sanitized output** to prevent XSS attacks
- **Rate limiting** applied to error endpoints
- **Logging** of errors for monitoring and debugging 