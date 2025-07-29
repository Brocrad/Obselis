const database = require('../utils/database');
const crypto = require('crypto');

class SessionService {
  // Parse user agent to extract device and browser info
  parseUserAgent(userAgent) {
    if (!userAgent) return { device: 'Unknown', browser: 'Unknown' };

    // Simple user agent parsing
    let device = 'Desktop';
    let browser = 'Unknown';

    // Detect mobile devices
    if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
      device = 'Mobile';
      if (/iPhone|iPad|iPod/i.test(userAgent)) device = 'iOS Device';
      if (/Android/i.test(userAgent)) device = 'Android Device';
    }

    // Detect browsers
    if (/Chrome/i.test(userAgent) && !/Edge|Edg/i.test(userAgent)) browser = 'Chrome';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';
    else if (/Edge|Edg/i.test(userAgent)) browser = 'Edge';
    else if (/Opera|OPR/i.test(userAgent)) browser = 'Opera';

    return { device, browser };
  }

  // Get client IP address
  getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           req.ip || 
           'Unknown';
  }

  // Create a new session or reuse existing one
  async createSession(userId, req) {
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = this.getClientIP(req);
    const { device, browser } = this.parseUserAgent(userAgent);
    
    // Check for existing active session from same device/browser/IP using Knex query builder
    const existingSessions = await database.knex('user_sessions')
      .select('session_id')
      .where('user_id', userId)
      .where('device_info', device)
      .where('browser_info', browser)
      .where('ip_address', ipAddress)
      .where('is_active', 1)
      .where('expires_at', '>', database.knex.fn.now())
      .orderBy('last_activity', 'desc')
      .limit(1);
    
    if (existingSessions.length > 0) {
      // Reuse existing session and update its activity
      const existingSessionId = existingSessions[0].session_id;
      await this.updateSessionActivity(existingSessionId);
      
      // Extend session expiry
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);
      
      await database.knex('user_sessions')
        .where('session_id', existingSessionId)
        .update({
          expires_at: newExpiresAt.toISOString(),
          last_activity: database.knex.fn.now()
        });
      
      return existingSessionId;
    }
    
    // Create new session if none exists
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await database.knex('user_sessions').insert({
      user_id: userId,
      session_id: sessionId,
      device_info: device,
      browser_info: browser,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAt.toISOString()
    });

    return sessionId;
  }

  // Update session activity
  async updateSessionActivity(sessionId) {
    if (!sessionId) return;

    await database.knex('user_sessions')
      .where('session_id', sessionId)
      .where('is_active', 1)
      .update({
        last_activity: database.knex.fn.now()
      });
  }

  // Get active sessions for a user
  async getUserSessions(userId, currentSessionId = null) {
    const sessions = await database.knex('user_sessions')
      .select([
        'id',
        'session_id',
        'device_info',
        'browser_info',
        'ip_address',
        'location',
        'last_activity',
        'created_at',
        'expires_at',
        database.knex.raw('CASE WHEN session_id = ? THEN 1 ELSE 0 END as is_current_session', [currentSessionId])
      ])
      .where('user_id', userId)
      .where('is_active', 1)
      .where('expires_at', '>', database.knex.fn.now())
      .orderByRaw('is_current_session DESC, last_activity DESC');
    
    return sessions.map(session => ({
      ...session,
      last_activity: new Date(session.last_activity),
      created_at: new Date(session.created_at),
      expires_at: new Date(session.expires_at),
      is_current_session: Boolean(session.is_current_session)
    }));
  }

  // Deactivate a specific session
  async deactivateSession(sessionId, userId) {
    const result = await database.knex('user_sessions')
      .where('session_id', sessionId)
      .where('user_id', userId)
      .update({ is_active: 0 });
    return result > 0;
  }

  // Deactivate all sessions for a user (except current one)
  async deactivateAllUserSessions(userId, exceptSessionId = null) {
    let query = database.knex('user_sessions')
      .where('user_id', userId)
      .update({ is_active: 0 });
    
    if (exceptSessionId) {
      query = query.whereNot('session_id', exceptSessionId);
    }

    const result = await query;
    return result;
  }

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    const result = await database.knex('user_sessions')
      .where('expires_at', '<=', database.knex.fn.now())
      .orWhere('last_activity', '<=', database.knex.raw('NOW() - INTERVAL \'30 days\''))
      .update({ is_active: 0 });

    if (result > 0) {
    }
    return result;
  }

  // Get session by session ID
  async getSessionById(sessionId) {
    const sessions = await database.knex('user_sessions')
      .select('*')
      .where('session_id', sessionId)
      .where('is_active', 1)
      .where('expires_at', '>', database.knex.fn.now());
    return sessions[0] || null;
  }

  // Start cleanup job
  startCleanupJob() {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        console.error('Session cleanup error:', error);
      });
    }, 60 * 60 * 1000); // 1 hour

  }
}

module.exports = new SessionService(); 
