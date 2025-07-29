const fs = require('fs');
const path = require('path');

class SecurityLogger {
  constructor() {
    this.logDir = process.env.LOG_DIR || './logs';
    this.securityLogFile = path.join(this.logDir, 'security.log');
    this.accessLogFile = path.join(this.logDir, 'access.log');
    
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatLogEntry(level, event, details, req) {
    const timestamp = new Date().toISOString();
    const ip = this.getClientIP(req);
    const userAgent = req?.get('User-Agent') || 'Unknown';
    const userId = req?.user?.id || 'Anonymous';
    
    return JSON.stringify({
      timestamp,
      level,
      event,
      ip,
      userId,
      userAgent,
      url: req?.url,
      method: req?.method,
      details
    }) + '\n';
  }

  getClientIP(req) {
    if (!req) return 'Unknown';
    
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           'Unknown';
  }

  writeLog(logFile, entry) {
    try {
      fs.appendFileSync(logFile, entry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  // Security event logging methods
  logFailedLogin(email, ip, req) {
    const entry = this.formatLogEntry('WARN', 'FAILED_LOGIN', {
      email,
      reason: 'Invalid credentials'
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logSuccessfulLogin(userId, email, req) {
    const entry = this.formatLogEntry('INFO', 'SUCCESSFUL_LOGIN', {
      userId,
      email
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logRateLimitViolation(endpoint, req) {
    const entry = this.formatLogEntry('WARN', 'RATE_LIMIT_EXCEEDED', {
      endpoint,
      limit: 'Authentication rate limit'
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logSuspiciousActivity(activity, details, req) {
    const entry = this.formatLogEntry('ERROR', 'SUSPICIOUS_ACTIVITY', {
      activity,
      ...details
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
    console.error(`🚨 Suspicious activity detected: ${activity} from ${this.getClientIP(req)}`);
  }

  logPasswordChange(userId, req) {
    const entry = this.formatLogEntry('INFO', 'PASSWORD_CHANGED', {
      userId
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logPasswordChangeInitiated(userId, req) {
    const entry = this.formatLogEntry('INFO', 'PASSWORD_CHANGE_INITIATED', {
      userId
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logFailedPasswordChange(userId, reason, req) {
    const entry = this.formatLogEntry('WARN', 'PASSWORD_CHANGE_FAILED', {
      userId,
      reason
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logProfileUpdate(userId, fields, req) {
    const entry = this.formatLogEntry('INFO', 'PROFILE_UPDATED', {
      userId,
      updatedFields: fields
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logPasswordResetRequest(email, req) {
    const entry = this.formatLogEntry('INFO', 'PASSWORD_RESET_REQUESTED', {
      email
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logPasswordReset(token, req) {
    const entry = this.formatLogEntry('INFO', 'PASSWORD_RESET_COMPLETED', {
      token: token.substring(0, 8) + '...' // Only log first 8 chars for security
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logFailedPasswordReset(token, reason, req) {
    const entry = this.formatLogEntry('WARN', 'PASSWORD_RESET_FAILED', {
      token: token ? token.substring(0, 8) + '...' : 'null',
      reason
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logAccountCreation(userId, email, req) {
    const entry = this.formatLogEntry('INFO', 'ACCOUNT_CREATED', {
      userId,
      email
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logAccountDeletion(userId, deletedBy, req, deletionType = 'admin') {
    const entry = this.formatLogEntry('WARN', 'ACCOUNT_DELETED', {
      userId,
      deletedBy,
      deletionType
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logPrivilegeEscalation(userId, newRole, changedBy, req) {
    const entry = this.formatLogEntry('WARN', 'PRIVILEGE_CHANGE', {
      userId,
      newRole,
      changedBy
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logInvalidToken(token, req) {
    const entry = this.formatLogEntry('WARN', 'INVALID_TOKEN', {
      tokenPrefix: token?.substring(0, 10) + '...',
      reason: 'Token validation failed'
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logEmailVerificationAttempt(email, success, req) {
    const entry = this.formatLogEntry(success ? 'INFO' : 'WARN', 'EMAIL_VERIFICATION', {
      email,
      success,
      reason: success ? 'Valid code' : 'Invalid or expired code'
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logLogoutAllDevices(userId, req) {
    const entry = this.formatLogEntry('WARN', 'LOGOUT_ALL_DEVICES', {
      userId,
      reason: 'User initiated logout from all devices'
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  logSessionLogout(userId, sessionId, req) {
    const entry = this.formatLogEntry('INFO', 'SESSION_LOGOUT', {
      userId,
      sessionId: sessionId.substring(0, 8) + '...',
      reason: 'User logged out specific session'
    }, req);
    
    this.writeLog(this.securityLogFile, entry);
  }

  // Middleware for automatic logging
  logRequest() {
    return (req, res, next) => {
      const start = Date.now();
      
      // Log the request
      res.on('finish', () => {
        const duration = Date.now() - start;
        const entry = this.formatLogEntry('INFO', 'HTTP_REQUEST', {
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          contentLength: res.get('content-length') || 0
        }, req);
        
        this.writeLog(this.accessLogFile, entry);
      });
      
      next();
    };
  }

  // Enhanced rate limit logging
  enhancedRateLimitLogger() {
    return (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Check if this is a rate limit response
        if (res.statusCode === 429) {
          securityLogger.logRateLimitViolation(req.path, req);
        }
        
        return originalSend.call(this, data);
      };
      
      next();
    };
  }

  // Get security statistics
  getSecurityStats(days = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const logContent = fs.readFileSync(this.securityLogFile, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      const stats = {
        totalEvents: 0,
        failedLogins: 0,
        rateLimitViolations: 0,
        suspiciousActivities: 0,
        accountCreations: 0,
        privilegeChanges: 0,
        topIPs: {},
        recentEvents: []
      };

      lines.forEach(line => {
        try {
          const event = JSON.parse(line);
          const eventDate = new Date(event.timestamp);
          
          if (eventDate >= cutoffDate) {
            stats.totalEvents++;
            
            // Count by event type
            switch (event.event) {
              case 'FAILED_LOGIN':
                stats.failedLogins++;
                break;
              case 'RATE_LIMIT_EXCEEDED':
                stats.rateLimitViolations++;
                break;
              case 'SUSPICIOUS_ACTIVITY':
                stats.suspiciousActivities++;
                break;
              case 'ACCOUNT_CREATED':
                stats.accountCreations++;
                break;
              case 'PRIVILEGE_CHANGE':
                stats.privilegeChanges++;
                break;
            }
            
            // Track IPs
            if (event.ip && event.ip !== 'Unknown') {
              stats.topIPs[event.ip] = (stats.topIPs[event.ip] || 0) + 1;
            }
            
            // Keep recent events
            if (stats.recentEvents.length < 50) {
              stats.recentEvents.push(event);
            }
          }
        } catch (parseError) {
          // Skip malformed log entries
        }
      });

      // Sort top IPs
      stats.topIPs = Object.entries(stats.topIPs)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .reduce((obj, [ip, count]) => ({ ...obj, [ip]: count }), {});

      return stats;
    } catch (error) {
      console.error('Failed to generate security stats:', error);
      return null;
    }
  }
}

const securityLogger = new SecurityLogger();
module.exports = securityLogger; 
