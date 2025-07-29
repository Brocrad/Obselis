const authService = require('../services/authService');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    // For SSE requests, also check query parameter
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    // Verify token and check if it's still valid (not invalidated by logout all devices)
    const decoded = await authService.verifyTokenWithUser(token);
    
    // Get user data
    const userData = await authService.findUserById(decoded.id);
    if (!userData) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!userData.is_active) {
      return res.status(401).json({ 
        error: 'Account is disabled',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // Add user to request object
    req.user = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      role: userData.role || 'user',
      is_admin: userData.is_admin,
      is_active: userData.is_active
    };

    // Add session ID to request object if available in token
    req.sessionId = decoded.sessionId || null;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({ 
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!req.user.is_admin && req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

// Middleware to check if user is manager or higher
const requireManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const allowedRoles = ['admin', 'manager'];
  if (!allowedRoles.includes(req.user.role) && !req.user.is_admin) {
    return res.status(403).json({ 
      error: 'Manager access or higher required',
      code: 'MANAGER_REQUIRED'
    });
  }

  next();
};

// Middleware to check if user has specific role or higher
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const roleHierarchy = {
      'user': 1,
      'manager': 2,
      'admin': 3
    };

    const userLevel = roleHierarchy[req.user.role] || (req.user.is_admin ? 3 : 1);
    const requiredLevel = roleHierarchy[requiredRole] || 1;

    if (userLevel < requiredLevel) {
      return res.status(403).json({ 
        error: `${requiredRole.charAt(0).toUpperCase() + requiredRole.slice(1)} access or higher required`,
        code: 'INSUFFICIENT_ROLE'
      });
    }

    next();
  };
};

// Middleware to check if user can manage other users (admin only)
const requireUserManagement = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role !== 'admin' && !req.user.is_admin) {
    return res.status(403).json({ 
      error: 'User management requires admin privileges',
      code: 'USER_MANAGEMENT_REQUIRED'
    });
  }

  next();
};

// Middleware to check if user can manage content (manager or admin)
const requireContentManagement = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const allowedRoles = ['admin', 'manager'];
  if (!allowedRoles.includes(req.user.role) && !req.user.is_admin) {
    return res.status(403).json({ 
      error: 'Content management requires manager privileges or higher',
      code: 'CONTENT_MANAGEMENT_REQUIRED'
    });
  }

  next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = await authService.verifyTokenWithUser(token);
      const userData = await authService.findUserById(decoded.id);
      
      if (userData && userData.is_active) {
        req.user = {
          id: userData.id,
          username: userData.username,
          email: userData.email,
          role: userData.role || 'user',
          is_admin: userData.is_admin,
          is_active: userData.is_active
        };
        
        // Add session ID to request object if available in token
        req.sessionId = decoded.sessionId || null;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireManager,
  requireRole,
  requireUserManagement,
  requireContentManagement,
  optionalAuth
}; 
