const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const database = require('../utils/database');
const monthlyBandwidthService = require('../services/monthlyBandwidthService');

// Apply user-based rate limiting to stream routes
const applyUserRateLimit = (req, res, next) => {
  if (req.app.locals.userRateLimit) {
    req.app.locals.userRateLimit(req, res, next);
  } else {
    next();
  }
};

// In-memory storage for active streams (in production, this would be in a database or Redis)
let activeStreams = [];
let streamingStats = {
  totalBandwidth: 0,
  peakConcurrent: 0,
  avgQuality: 'Auto',
  dailyStats: {
    totalStreams: 0,
    totalBandwidthUsed: 0,
    peakConcurrentToday: 0
  }
};

// In-memory storage for streaming settings (in production, this would be in a database)
let streamingSettings = {
  maxResolution: 'auto',
  bitrateLimit: null,
  totalBandwidthLimit: null,
  perUserBandwidthLimit: null
};

// GET /api/streaming/analytics - Get streaming analytics data
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get active sessions from both in-memory and database
    const dbSessions = await database.query(
      'SELECT id, user_id, username, media_id, title, quality, bandwidth, start_time, client_ip FROM streaming_sessions WHERE status = ?',
      ['active']
    );
    
    // Merge in-memory and database sessions, prioritizing database
    const allActiveSessions = [...activeStreams];
    
    // Add database sessions that aren't in memory
    dbSessions.forEach(dbSession => {
      const existsInMemory = allActiveSessions.some(s => s.id === dbSession.id);
      if (!existsInMemory) {
        allActiveSessions.push({
          id: dbSession.id,
          mediaId: dbSession.media_id,
          title: dbSession.title,
          username: dbSession.username,
          quality: dbSession.quality || 'Auto',
          bandwidth: dbSession.bandwidth,
          startTime: dbSession.start_time,
          duration: '0:00',
          clientIP: dbSession.client_ip,
          startTimestamp: new Date(dbSession.start_time).getTime()
        });
      }
    });
    
    // Calculate current stats from all active streams
    const currentBandwidth = allActiveSessions.reduce((total, stream) => {
      return total + (parseFloat(stream.bandwidth) || 0);
    }, 0);

    // Update peak concurrent if current is higher
    if (allActiveSessions.length > streamingStats.peakConcurrent) {
      streamingStats.peakConcurrent = allActiveSessions.length;
      streamingStats.dailyStats.peakConcurrentToday = allActiveSessions.length;
    }

    // Calculate average quality
    const qualityMap = { '480p': 1, '720p': 2, '1080p': 3, '4k': 4, 'Auto': 2.5 };
    const avgQualityScore = allActiveSessions.length > 0 
      ? allActiveSessions.reduce((sum, stream) => sum + (qualityMap[stream.quality] || 2.5), 0) / allActiveSessions.length
      : 2.5;
    
    const avgQuality = Object.keys(qualityMap).find(key => qualityMap[key] === Math.round(avgQualityScore)) || 'Auto';

    // Get monthly bandwidth statistics
    const monthlyBandwidthService = require('../services/monthlyBandwidthService');
    const currentPeriod = monthlyBandwidthService.getCurrentPeriod();
    
    // Get current month's server-wide statistics
    const currentMonthStats = await database.query(
      `SELECT 
         SUM(total_bandwidth_gb) as total_bandwidth_gb,
         SUM(total_streams) as total_streams,
         SUM(total_duration_seconds) as total_duration_seconds,
         COUNT(DISTINCT user_id) as active_users,
         AVG(total_bandwidth_gb) as avg_bandwidth_per_user,
         MAX(total_bandwidth_gb) as max_bandwidth_user
       FROM monthly_bandwidth 
       WHERE period_start = ?`,
      [currentPeriod.start]
    );

    // Get server bandwidth history (last 6 months)
    const serverHistory = await monthlyBandwidthService.getServerBandwidthHistory(6);
    
    // Get top users by bandwidth this month
    const topUsers = await database.query(
      `SELECT 
         username,
         total_bandwidth_gb,
         total_streams,
         total_duration_seconds
       FROM monthly_bandwidth 
       WHERE period_start = ? 
       ORDER BY total_bandwidth_gb DESC 
       LIMIT 10`,
      [currentPeriod.start]
    );

    // Calculate additional statistics
    const currentMonthData = currentMonthStats[0] || {
      total_bandwidth_gb: 0,
      total_streams: 0,
      total_duration_seconds: 0,
      active_users: 0,
      avg_bandwidth_per_user: 0,
      max_bandwidth_user: 0
    };

    // Calculate monthly trends
    const monthlyTrends = serverHistory.length > 1 ? {
      bandwidthGrowth: serverHistory[0]?.total_bandwidth_gb > serverHistory[1]?.total_bandwidth_gb ? 'increasing' : 'decreasing',
      userGrowth: serverHistory[0]?.active_users > serverHistory[1]?.active_users ? 'increasing' : 'decreasing',
      avgSessionLength: currentMonthData.total_duration_seconds / Math.max(currentMonthData.total_streams, 1) / 60 // minutes
    } : {
      bandwidthGrowth: 'stable',
      userGrowth: 'stable',
      avgSessionLength: 0
    };

    const analytics = {
      totalBandwidth: Math.round(currentBandwidth * 100) / 100,
      peakConcurrent: streamingStats.peakConcurrent,
      avgQuality: avgQuality,
      activeStreamCount: allActiveSessions.length,
      dailyStats: streamingStats.dailyStats,
      
      // Monthly Statistics
      monthlyStats: {
        currentPeriod: currentPeriod,
        totalBandwidth: parseFloat(currentMonthData.total_bandwidth_gb || 0).toFixed(2),
        totalStreams: currentMonthData.total_streams || 0,
        totalDuration: currentMonthData.total_duration_seconds || 0,
        activeUsers: currentMonthData.active_users || 0,
        avgBandwidthPerUser: parseFloat(currentMonthData.avg_bandwidth_per_user || 0).toFixed(2),
        maxBandwidthUser: parseFloat(currentMonthData.max_bandwidth_user || 0).toFixed(2),
        avgSessionLength: Math.round(monthlyTrends.avgSessionLength),
        trends: monthlyTrends
      },
      
      // Historical Data
      serverHistory: serverHistory.map(record => ({
        period: record.period_start,
        bandwidth: parseFloat(record.total_bandwidth_gb || 0).toFixed(2),
        streams: record.total_streams || 0,
        duration: record.total_duration_seconds || 0,
        activeUsers: record.active_users || 0
      })),
      
      // Top Users
      topUsers: topUsers.map(user => ({
        username: user.username,
        bandwidth: parseFloat(user.total_bandwidth_gb || 0).toFixed(2),
        streams: user.total_streams || 0,
        duration: user.total_duration_seconds || 0
      }))
    };

    res.json({
      success: true,
      analytics: analytics,
      activeStreams: allActiveSessions.map(stream => ({
        id: stream.id,
        title: stream.title,
        username: stream.username,
        quality: stream.quality,
        bandwidth: stream.bandwidth,
        startTime: stream.startTime,
        duration: stream.duration,
        clientIP: stream.clientIP
      }))
    });
  } catch (error) {
    console.error('Streaming analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get streaming analytics' 
    });
  }
});

// POST /api/streaming/session/start - Start a streaming session (called by media player)
router.post('/session/start', authenticateToken, applyUserRateLimit, async (req, res) => {
  try {
    const { mediaId, title, quality = 'Auto' } = req.body; // Removed estimatedBandwidth parameter
    const username = req.user?.username || 'Anonymous';
    const userId = req.user?.id || null;
    const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';
    const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    // Check if user already has an active session for this media
    const existingSessions = await database.query(
      'SELECT id FROM streaming_sessions WHERE user_id = ? AND media_id = ? AND status = ?',
      [userId, mediaId, 'active']
    );
    
    if (existingSessions.length > 0) {
      // User already has an active session for this media, return existing sessionId
      res.json({ 
        success: true, 
        sessionId: existingSessions[0].id, 
        message: 'Using existing streaming session' 
      });
      return;
    }
    
    // Save to DB with initial bandwidth of 0 (will be updated in real-time)
    await database.insert(
      `INSERT INTO streaming_sessions (id, user_id, username, media_id, title, quality, bandwidth, start_time, client_ip, status, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, userId, username, mediaId, title, quality, 0, now, clientIP, 'active', JSON.stringify({})]
    );
    
    // Also add to in-memory for fast analytics
    activeStreams.push({
      id: sessionId,
      userId: userId,
      mediaId,
      title,
      username,
      quality,
      bandwidth: 0, // Start with 0, will be updated in real-time
      startTime: now,
      duration: '0:00',
      clientIP,
      startTimestamp: Date.now()
    });
    
    streamingStats.dailyStats.totalStreams++;
    res.json({ success: true, sessionId, message: 'Streaming session started with real-time bandwidth tracking' });
  } catch (error) {
    console.error('Start streaming session error:', error);
    res.status(500).json({ success: false, error: 'Failed to start streaming session' });
  }
});

// POST /api/streaming/session/end - End a streaming session
router.post('/session/end', authenticateToken, applyUserRateLimit, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // First check if session exists in database
    const dbSession = await database.query(
      'SELECT * FROM streaming_sessions WHERE id = ? AND status = ?',
      [sessionId, 'active']
    );
    
    if (dbSession.length === 0) {
      return res.status(404).json({ success: false, error: 'Streaming session not found or not active' });
    }
    
    const sessionData = dbSession[0];
    const sessionIndex = activeStreams.findIndex(stream => stream.id === sessionId);
    let session = null;
    let duration = 0;
    let bandwidthUsed = sessionData.bandwidth || 0;
    
    if (sessionIndex !== -1) {
      // Session exists in memory
      session = activeStreams[sessionIndex];
      duration = Math.floor((Date.now() - session.startTimestamp) / 1000);
      activeStreams.splice(sessionIndex, 1);
    } else {
      // Session exists in database but not in memory (server restart)
      session = {
        username: sessionData.username,
        title: sessionData.title,
        userId: sessionData.user_id
      };
      
      // Calculate duration from database start time
      const startTime = new Date(sessionData.start_time);
      duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
      
    }
    
    const now = new Date().toISOString();
    
    // Update DB
    await database.update(
      `UPDATE streaming_sessions SET end_time = ?, status = 'ended', duration = ? WHERE id = ?`,
      [now, duration, sessionId]
    );
    
    streamingStats.dailyStats.totalBandwidthUsed += bandwidthUsed; // Use actual tracked bandwidth
    
    // Track monthly bandwidth usage
    if (session.userId && session.username) {
      await monthlyBandwidthService.addBandwidthUsage(
        session.userId, 
        session.username, 
        bandwidthUsed, 
        duration
      );
    }
    
    res.json({ success: true, message: 'Streaming session ended' });
  } catch (error) {
    console.error('End streaming session error:', error);
    res.status(500).json({ success: false, error: 'Failed to end streaming session' });
  }
});

// POST /api/streaming/session/terminate - Terminate a streaming session (admin only)
router.post('/session/terminate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // First check if session exists in database
    const dbSession = await database.query(
      'SELECT * FROM streaming_sessions WHERE id = ? AND status = ?',
      [sessionId, 'active']
    );
    
    if (dbSession.length === 0) {
      return res.status(404).json({ success: false, error: 'Streaming session not found or not active' });
    }
    
    const sessionData = dbSession[0];
    const sessionIndex = activeStreams.findIndex(stream => stream.id === sessionId);
    let session = null;
    let duration = 0;
    let bandwidthUsed = sessionData.bandwidth || 0;
    
    if (sessionIndex !== -1) {
      // Session exists in memory
      session = activeStreams[sessionIndex];
      duration = Math.floor((Date.now() - session.startTimestamp) / 1000);
      activeStreams.splice(sessionIndex, 1);
    } else {
      // Session exists in database but not in memory (server restart)
      session = {
        username: sessionData.username,
        title: sessionData.title,
        userId: sessionData.user_id
      };
      
      // Calculate duration from database start time
      const startTime = new Date(sessionData.start_time);
      duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
    }
    
    // Update DB
    await database.update(
      `UPDATE streaming_sessions SET end_time = ?, status = 'terminated', duration = ? WHERE id = ?`,
      [new Date().toISOString(), duration, sessionId]
    );
    
    // Track monthly bandwidth usage
    if (session.userId && session.username) {
      await monthlyBandwidthService.addBandwidthUsage(
        session.userId, 
        session.username, 
        bandwidthUsed, 
        duration
      );
    }
    
    res.json({ success: true, message: 'Streaming session terminated by admin' });
  } catch (error) {
    console.error('Terminate streaming session error:', error);
    res.status(500).json({ success: false, error: 'Failed to terminate streaming session' });
  }
});

// POST /api/streaming/session/update-bandwidth - Update bandwidth usage for a session
router.post('/session/update-bandwidth', authenticateToken, applyUserRateLimit, async (req, res) => {
  try {
    const { sessionId, bytesTransferred } = req.body;
    
    if (!sessionId || !bytesTransferred) {
      return res.status(400).json({ success: false, error: 'Session ID and bytes transferred required' });
    }
    
    // Convert bytes to GB for bandwidth tracking
    const gbTransferred = bytesTransferred / (1024 * 1024 * 1024);
    
    // Update the session's bandwidth usage in the database
    await database.update(
      `UPDATE streaming_sessions SET bandwidth = bandwidth + ? WHERE id = ? AND status = ?`,
      [gbTransferred, sessionId, 'active']
    );
    
    // Also update in-memory tracking
    const streamIndex = activeStreams.findIndex(stream => stream.id === sessionId);
    if (streamIndex !== -1) {
      activeStreams[streamIndex].bandwidth += gbTransferred;
    }
    
    res.json({ 
      success: true, 
      message: 'Bandwidth updated',
      gbTransferred: gbTransferred
    });
  } catch (error) {
    console.error('Update bandwidth error:', error);
    res.status(500).json({ success: false, error: 'Failed to update bandwidth' });
  }
});

// GET /api/streaming/settings - Get current streaming settings
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await database.query('SELECT * FROM streaming_settings ORDER BY id DESC LIMIT 1');
    const currentSettings = settings.length > 0 ? settings[0] : {
      max_resolution: '1080p',
      bitrate_limit: '20',
      total_bandwidth_limit: '150',
      per_user_bandwidth_limit: '25'
    };
    
    res.json({
      success: true,
      settings: {
        maxResolution: currentSettings.max_resolution,
        bitrateLimit: currentSettings.bitrate_limit,
        totalBandwidthLimit: currentSettings.total_bandwidth_limit,
        perUserBandwidthLimit: currentSettings.per_user_bandwidth_limit
      }
    });
  } catch (error) {
    console.error('Get streaming settings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get streaming settings' 
    });
  }
});

// POST /api/streaming/settings - Save streaming settings
router.post('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { maxResolution, bitrateLimit, totalBandwidthLimit, perUserBandwidthLimit } = req.body;
    
    // Check if settings already exist
    const existingSettings = await database.query('SELECT * FROM streaming_settings ORDER BY id DESC LIMIT 1');
    
    if (existingSettings.length > 0) {
      // Update existing settings
      await database.update(
        `UPDATE streaming_settings SET max_resolution = ?, bitrate_limit = ?, total_bandwidth_limit = ?, per_user_bandwidth_limit = ?, updated_at = ? WHERE id = ?`,
        [maxResolution, bitrateLimit, totalBandwidthLimit, perUserBandwidthLimit, new Date().toISOString(), existingSettings[0].id]
      );
    } else {
      // Insert new settings record
      await database.insert(
        `INSERT INTO streaming_settings (max_resolution, bitrate_limit, total_bandwidth_limit, per_user_bandwidth_limit, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [maxResolution, bitrateLimit, totalBandwidthLimit, perUserBandwidthLimit, new Date().toISOString()]
      );
    }
    
    // Also update in-memory for fast access
    streamingSettings = {
      maxResolution: maxResolution || streamingSettings.maxResolution,
      bitrateLimit: bitrateLimit || streamingSettings.bitrateLimit,
      totalBandwidthLimit: totalBandwidthLimit || streamingSettings.totalBandwidthLimit,
      perUserBandwidthLimit: perUserBandwidthLimit || streamingSettings.perUserBandwidthLimit
    };
    
    res.json({
      success: true,
      message: 'Streaming settings saved successfully',
      settings: streamingSettings
    });
  } catch (error) {
    console.error('Save streaming settings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save streaming settings' 
    });
  }
});

// GET /api/streaming/session/check/:sessionId - Check if a session is active
router.get('/session/check/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check if session exists and is active in database
    const sessions = await database.query(
      'SELECT id, status FROM streaming_sessions WHERE id = ?',
      [sessionId]
    );
    
    if (sessions.length === 0) {
      return res.json({ 
        success: true, 
        isActive: false, 
        message: 'Session not found' 
      });
    }
    
    const isActive = sessions[0].status === 'active';
    
    res.json({ 
      success: true, 
      isActive: isActive,
      message: isActive ? 'Session is active' : 'Session is not active'
    });
  } catch (error) {
    console.error('Check session error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check session status' 
    });
  }
});

// GET /api/streaming/session/bandwidth/:sessionId - Get current bandwidth usage for a session
router.get('/session/bandwidth/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get the session's current bandwidth usage
    const sessions = await database.query(
      'SELECT bandwidth FROM streaming_sessions WHERE id = ? AND status = ?',
      [sessionId, 'active']
    );
    
    if (sessions.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found or inactive' });
    }
    
    const bandwidth = sessions[0].bandwidth || 0;
    
    res.json({
      success: true,
      bandwidth: bandwidth,
      message: 'Current bandwidth usage retrieved'
    });
  } catch (error) {
    console.error('Get session bandwidth error:', error);
    res.status(500).json({ success: false, error: 'Failed to get session bandwidth' });
  }
});

// Update stream duration every 30 seconds
setInterval(() => {
  activeStreams.forEach(stream => {
    const duration = Math.floor((Date.now() - stream.startTimestamp) / 1000);
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    stream.duration = hours > 0 
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}`
      : `${minutes}:${(duration % 60).toString().padStart(2, '0')}`;
  });
}, 30000);



// GET /api/streaming/monthly-bandwidth - Get monthly bandwidth analytics
router.get('/monthly-bandwidth', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const currentPeriodData = await monthlyBandwidthService.getCurrentPeriodBandwidth();
    const serverHistory = await monthlyBandwidthService.getServerBandwidthHistory(6);
    
    res.json({
      success: true,
      currentPeriod: currentPeriodData,
      serverHistory: serverHistory,
      formatted: {
        currentPeriod: {
          totalBandwidth: monthlyBandwidthService.formatBandwidth(currentPeriodData.totalBandwidth),
          totalDuration: monthlyBandwidthService.formatDuration(currentPeriodData.totalDuration),
          daysRemaining: currentPeriodData.daysRemaining
        },
        serverHistory: serverHistory.map(period => ({
          ...period,
          totalBandwidth: monthlyBandwidthService.formatBandwidth(period.total_bandwidth_gb),
          totalDuration: monthlyBandwidthService.formatDuration(period.total_duration_seconds)
        }))
      }
    });
  } catch (error) {
    console.error('Monthly bandwidth analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get monthly bandwidth analytics' 
    });
  }
});

// GET /api/streaming/user-bandwidth/:userId - Get user's bandwidth history (admin only)
router.get('/user-bandwidth/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const userHistory = await monthlyBandwidthService.getUserBandwidthHistory(userId, 6);
    
    res.json({
      success: true,
      userHistory: userHistory,
      formatted: userHistory.map(period => ({
        ...period,
        totalBandwidth: monthlyBandwidthService.formatBandwidth(period.total_bandwidth_gb),
        totalDuration: monthlyBandwidthService.formatDuration(period.total_duration_seconds)
      }))
    });
  } catch (error) {
    console.error('User bandwidth history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user bandwidth history' 
    });
  }
});

// GET /api/streaming/my-bandwidth - Get current user's bandwidth history
router.get('/my-bandwidth', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userHistory = await monthlyBandwidthService.getUserBandwidthHistory(userId, 6);

    res.json({
      success: true,
      userHistory: userHistory,
      formatted: userHistory.map(period => ({
        ...period,
        totalBandwidth: monthlyBandwidthService.formatBandwidth(period.total_bandwidth_gb),
        totalDuration: monthlyBandwidthService.formatDuration(period.total_duration_seconds)
      }))
    });
  } catch (error) {
    console.error('My bandwidth history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get bandwidth history' 
    });
  }
});

// GET /api/streaming/bandwidth-investigation - Get detailed bandwidth investigation data (admin only)
router.get('/bandwidth-investigation', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, periodType, period, periodEnd, limit = 50 } = req.query;
    
    let investigationData = {};
    
    // Get detailed session breakdown
    let sessionQuery = `
      SELECT 
        id, user_id, username, title, quality, bandwidth, 
        start_time, end_time, duration, status, client_ip
      FROM streaming_sessions 
      WHERE bandwidth > 0
    `;
    let sessionParams = [];
    
    if (userId) {
      // Check if userId is numeric (actual user ID) or string (username)
      if (!isNaN(userId)) {
        sessionQuery += ' AND user_id = ?';
        sessionParams.push(parseInt(userId));
      } else {
        sessionQuery += ' AND username = ?';
        sessionParams.push(userId);
      }
    }
    
    // Handle different period types
    if (periodType && periodType !== 'all' && period) {
      if (periodType === 'month') {
        // Single month (YYYY-MM format)
        const startDate = new Date(period + '-01T00:00:00');
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
        sessionQuery += ' AND start_time >= ? AND start_time <= ?';
        sessionParams.push(startDate.toISOString(), endDate.toISOString());
      } else if (periodType === 'monthRange') {
        // Month range (YYYY-MM to YYYY-MM)
        const startDate = new Date(period + '-01T00:00:00');
        const endDate = new Date(periodEnd + '-01T00:00:00');
        const endOfEndMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0, 23, 59, 59);
        sessionQuery += ' AND start_time >= ? AND start_time <= ?';
        sessionParams.push(startDate.toISOString(), endOfEndMonth.toISOString());
      } else if (periodType === 'dayRange') {
        // Day range (YYYY-MM-DD to YYYY-MM-DD)
        const startDate = new Date(period + 'T00:00:00');
        const endDate = new Date(periodEnd + 'T23:59:59');
        sessionQuery += ' AND start_time >= ? AND start_time <= ?';
        sessionParams.push(startDate.toISOString(), endDate.toISOString());
      }
    }
    
    sessionQuery += ' ORDER BY start_time DESC LIMIT ?';
    sessionParams.push(parseInt(limit));
    
    const sessions = await database.query(sessionQuery, sessionParams);
    
    // Build the same WHERE clause for other queries
    let whereClause = 'WHERE bandwidth > 0';
    let otherParams = [];
    
    if (userId) {
      // Check if userId is numeric (actual user ID) or string (username)
      if (!isNaN(userId)) {
        whereClause += ' AND user_id = ?';
        otherParams.push(parseInt(userId));
      } else {
        whereClause += ' AND username = ?';
        otherParams.push(userId);
      }
    }
    
    // Apply the same period filtering to other queries
    if (periodType && periodType !== 'all' && period) {
      if (periodType === 'month') {
        const startDate = new Date(period + '-01T00:00:00');
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
        whereClause += ' AND start_time >= ? AND start_time <= ?';
        otherParams.push(startDate.toISOString(), endDate.toISOString());
      } else if (periodType === 'monthRange') {
        const startDate = new Date(period + '-01T00:00:00');
        const endDate = new Date(periodEnd + '-01T00:00:00');
        const endOfEndMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0, 23, 59, 59);
        whereClause += ' AND start_time >= ? AND start_time <= ?';
        otherParams.push(startDate.toISOString(), endOfEndMonth.toISOString());
      } else if (periodType === 'dayRange') {
        const startDate = new Date(period + 'T00:00:00');
        const endDate = new Date(periodEnd + 'T23:59:59');
        whereClause += ' AND start_time >= ? AND start_time <= ?';
        otherParams.push(startDate.toISOString(), endDate.toISOString());
      }
    }
    
    // Get user breakdown with same filters
    const userBreakdown = await database.query(`
      SELECT 
        user_id, username,
        COUNT(*) as session_count,
        SUM(bandwidth) as total_bandwidth,
        SUM(duration) as total_duration,
        AVG(bandwidth) as avg_bandwidth_per_session,
        MIN(start_time) as first_session,
        MAX(start_time) as last_session
      FROM streaming_sessions 
      ${whereClause}
      GROUP BY user_id, username
      ORDER BY total_bandwidth DESC
    `, otherParams);
    
    // Get content breakdown with same filters
    const contentBreakdown = await database.query(`
      SELECT 
        title,
        COUNT(*) as session_count,
        SUM(bandwidth) as total_bandwidth,
        SUM(duration) as total_duration,
        AVG(bandwidth) as avg_bandwidth_per_session
      FROM streaming_sessions 
      ${whereClause}
      GROUP BY title
      ORDER BY total_bandwidth DESC
      LIMIT 20
    `, otherParams);
    
    // Get daily breakdown with same filters
    const dailyBreakdown = await database.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as session_count,
        SUM(bandwidth) as total_bandwidth,
        SUM(duration) as total_duration
      FROM streaming_sessions 
      ${whereClause}
      GROUP BY DATE(start_time)
      ORDER BY date DESC
      LIMIT 30
    `, otherParams);
    
    // Get quality breakdown with same filters
    const qualityBreakdown = await database.query(`
      SELECT 
        quality,
        COUNT(*) as session_count,
        SUM(bandwidth) as total_bandwidth,
        AVG(bandwidth) as avg_bandwidth_per_session
      FROM streaming_sessions 
      ${whereClause} AND quality IS NOT NULL
      GROUP BY quality
      ORDER BY total_bandwidth DESC
    `, otherParams);
    
    investigationData = {
      sessions: sessions,
      userBreakdown: userBreakdown,
      contentBreakdown: contentBreakdown,
      dailyBreakdown: dailyBreakdown,
      qualityBreakdown: qualityBreakdown,
      summary: {
        totalSessions: sessions.length,
        totalUsers: userBreakdown.length,
        totalContent: contentBreakdown.length,
        totalBandwidth: userBreakdown.reduce((sum, user) => sum + user.total_bandwidth, 0),
        totalDuration: userBreakdown.reduce((sum, user) => sum + user.total_duration, 0)
      }
    };
    

    
    res.json({
      success: true,
      data: investigationData
    });
  } catch (error) {
    console.error('Bandwidth investigation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get bandwidth investigation data' 
    });
  }
});

// GET /api/streaming/user-sessions/:userId - Get detailed sessions for a specific user (admin only)
router.get('/user-sessions/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100 } = req.query;
    
    const sessions = await database.query(`
      SELECT 
        id, title, quality, bandwidth, 
        start_time, end_time, duration, status, client_ip
      FROM streaming_sessions 
      WHERE user_id = ? AND bandwidth > 0
      ORDER BY start_time DESC
      LIMIT ?
    `, [userId, parseInt(limit)]);
    
    // Get user info
    const userInfo = await database.query('SELECT username, email FROM users WHERE id = ?', [userId]);
    
    res.json({
      success: true,
      user: userInfo[0] || null,
      sessions: sessions,
      summary: {
        totalSessions: sessions.length,
        totalBandwidth: sessions.reduce((sum, session) => sum + session.bandwidth, 0),
        totalDuration: sessions.reduce((sum, session) => sum + (session.duration || 0), 0),
        avgBandwidthPerSession: sessions.length > 0 ? 
          sessions.reduce((sum, session) => sum + session.bandwidth, 0) / sessions.length : 0
      }
    });
  } catch (error) {
    console.error('User sessions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user sessions' 
    });
  }
});

module.exports = router; 
