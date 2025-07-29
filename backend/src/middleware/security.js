const validator = require('validator');
const xss = require('xss');

// Sanitize string input to prevent XSS
const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  
  // First escape HTML entities, then apply XSS filter
  const escaped = validator.escape(input);
  return xss(escaped, {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });
};

// Sanitize object recursively
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
};

// Middleware to sanitize request body
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

// Enhanced email validation
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  // Basic format check
  if (!validator.isEmail(email)) return false;
  
  // Additional security checks
  if (email.length > 254) return false; // RFC 5321 limit
  if (email.includes('..')) return false; // Consecutive dots
  if (email.startsWith('.') || email.endsWith('.')) return false;
  
  return true;
};

// Enhanced username validation
const isValidUsername = (username) => {
  if (!username || typeof username !== 'string') return false;
  
  // Length check
  if (username.length < 3 || username.length > 30) return false;
  
  // Only allow alphanumeric characters, underscores, and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return false;
  
  // Must start with alphanumeric character
  if (!/^[a-zA-Z0-9]/.test(username)) return false;
  
  return true;
};

// Password strength validation
const isStrongPassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  
  // Minimum length
  if (password.length < 8) return false;
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) return false;
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) return false;
  
  // Check for at least one number
  if (!/\d/.test(password)) return false;
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;
  
  return true;
};

module.exports = {
  sanitizeInput,
  sanitizeString,
  sanitizeObject,
  isValidEmail,
  isValidUsername,
  isStrongPassword
}; 
