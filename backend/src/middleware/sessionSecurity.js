const jwt = require('jsonwebtoken');
const securityLogger = require('./securityLogger');

class SessionSecurity {
  constructor() {
    // In-memory session store (in production, use Redis or database)
    this.activeSessions = new Map();
    this.maxConcurrentSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 3;
    this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) || 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean up expired sessions every hour
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  // Track active session
  trackSession(userId, token, req) {
    const sessionId = this.generateSessionId();
    const sessionData = {
      sessionId,
      userId,
      token,
      createdAt: new Date(),
      lastActivity: new Date(),
      ip: this.getClientIP(req),
      userAgent: req.get('User-Agent') || 'Unknown'
    };

    // Get user's current sessions
    const userSessions = this.getUserSessions(userId);
    
    // Enforce concurrent session limit
    if (userSessions.length >= this.maxConcurrentSessions) {
      // Remove oldest session
      const oldestSession = userSessions.sort((a, b) => a.lastActivity - b.lastActivity)[0];
      this.invalidateSession(oldestSession.sessionId);
      
      securityLogger.logSuspiciousActivity('CONCURRENT_SESSION_LIMIT', {
        userId,
        maxSessions: this.maxConcurrentSessions,
        removedSession: oldestSession.sessionId
      }, req);
    }

    // Store new session
    this.activeSessions.set(sessionId, sessionData);
    
    return sessionId;
  }

  // Update session activity
  updateSessionActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.activeSessions.set(sessionId, session);
    }
  }

  // Get user's active sessions
  getUserSessions(userId) {
    return Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId);
  }

  // Invalidate specific session
  invalidateSession(sessionId) {
    return this.activeSessions.delete(sessionId);
  }

  // Invalidate all user sessions (useful for password change)
  invalidateAllUserSessions(userId, exceptSessionId = null) {
    const userSessions = this.getUserSessions(userId);
    let invalidatedCount = 0;
    
    userSessions.forEach(session => {
      if (session.sessionId !== exceptSessionId) {
        this.invalidateSession(session.sessionId);
        invalidatedCount++;
      }
    });
    
    return invalidatedCount;
  }

  // Check if session is valid
  isSessionValid(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    
    // Check if session has expired
    const now = new Date();
    const sessionAge = now - session.lastActivity;
    
    if (sessionAge > this.sessionTimeout) {
      this.invalidateSession(sessionId);
      return false;
    }
    
    return true;
  }

  // Clean up expired sessions
  cleanupExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      const sessionAge = now - session.lastActivity;
      if (sessionAge > this.sessionTimeout) {
        this.invalidateSession(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
    }
  }

  // Generate unique session ID
  generateSessionId() {
    return require('crypto').randomBytes(32).toString('hex');
  }

  // Get client IP
  getClientIP(req) {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           'Unknown';
  }

  // Middleware to track session activity
  trackActivity() {
    return (req, res, next) => {
      if (req.user && req.sessionId) {
        this.updateSessionActivity(req.sessionId);
      }
      next();
    };
  }

  // Enhanced JWT verification with session tracking
  verifyTokenWithSession() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Extract session ID from token (if present)
        const sessionId = decoded.sessionId;
        
        if (sessionId && !this.isSessionValid(sessionId)) {
          securityLogger.logInvalidToken(token, req);
          return res.status(401).json({ error: 'Session expired or invalid' });
        }
        
        req.user = decoded;
        req.sessionId = sessionId;
        
        // Update session activity
        if (sessionId) {
          this.updateSessionActivity(sessionId);
        }
        
        next();
      } catch (error) {
        securityLogger.logInvalidToken(token, req);
        return res.status(403).json({ error: 'Invalid token' });
      }
    };
  }

  // Get session statistics
  getSessionStats() {
    const now = new Date();
    const stats = {
      totalActiveSessions: this.activeSessions.size,
      sessionsByUser: {},
      recentSessions: [],
      expiringSoon: []
    };

    for (const [sessionId, session] of this.activeSessions.entries()) {
      // Count by user
      stats.sessionsByUser[session.userId] = (stats.sessionsByUser[session.userId] || 0) + 1;
      
      // Recent sessions (last 24 hours)
      const sessionAge = now - session.createdAt;
      if (sessionAge < 24 * 60 * 60 * 1000) {
        stats.recentSessions.push({
          sessionId,
          userId: session.userId,
          createdAt: session.createdAt,
          ip: session.ip
        });
      }
      
      // Sessions expiring soon (within 1 hour)
      const timeUntilExpiry = this.sessionTimeout - (now - session.lastActivity);
      if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
        stats.expiringSoon.push({
          sessionId,
          userId: session.userId,
          expiresIn: Math.round(timeUntilExpiry / 1000 / 60) + ' minutes'
        });
      }
    }

    return stats;
  }
}

const sessionSecurity = new SessionSecurity();
module.exports = sessionSecurity; 
