const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authenticateToken, requireContentManagement, requireAdmin } = require('../middleware/auth');
const mediaService = require('../services/mediaService');
const database = require('../utils/database');
const errorCodeTracker = require('../utils/errorCodeTracker');

// Apply streaming rate limiting to content routes
const applyStreamingLimiter = (req, res, next) => {
  if (req.app.locals.streamingLimiter) {
    req.app.locals.streamingLimiter(req, res, next);
  } else {
    next();
  }
};

// Apply user-based rate limiting to content routes
const applyUserRateLimit = (req, res, next) => {
  if (req.app.locals.userRateLimit) {
    req.app.locals.userRateLimit(req, res, next);
  } else {
    next();
  }
};

// Bandwidth tracking middleware for streaming
const trackBandwidthUsage = (sessionId, chunkSize) => {
  if (!sessionId || chunkSize < 1024 * 1024) return; // Only track chunks > 1MB
  
  // Convert bytes to GB
  const gbTransferred = chunkSize / (1024 * 1024 * 1024);
  
  // Update bandwidth in database asynchronously (don't block streaming)
  setImmediate(async () => {
    try {
      await database.update(
        `UPDATE streaming_sessions SET bandwidth = bandwidth + ? WHERE id = ? AND status = ?`,
        [gbTransferred, sessionId, 'active']
      );
      
    } catch (error) {
      console.error('Failed to update bandwidth tracking:', error);
    }
  });
};

// Configure multer for media uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/media');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueFilename = mediaService.generateUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 75 * 1024 * 1024 * 1024, // 75GB limit for 4K videos
    fieldSize: 100 * 1024 * 1024, // 100MB for form fields
    fields: 20, // Max number of non-file fields
    files: 1, // Max number of files
    parts: 1000, // Max number of parts (multipart)
    headerPairs: 2000 // Max number of header key-value pairs
  },
  fileFilter: (req, file, cb) => {
    // Check file type - Only allow video files for movies and TV shows
    const allowedTypes = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ogv|ts|mts|m2ts)$/i;
    const allowedMimeTypes = [
      // Video formats including 4K formats
      'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv', 
      'video/x-flv', 'video/webm', 'video/x-matroska', 'video/x-m4v',
      'video/3gpp', 'video/ogg', 'video/mp2t', 'video/x-ms-asf'
    ];

    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed (MP4, MKV, AVI, MOV, WMV, FLV, WebM, TS, etc.)'));
    }
  }
});

// Content management routes - require manager or admin role

// Get all content (managers and admins can see all, users see only published)
router.get('/', authenticateToken, applyUserRateLimit, async (req, res) => {
  try {
    const { search, mediaType, limit, category } = req.query;
    const filters = { search, mediaType, limit, category };
    
    const content = await mediaService.getMediaList(req.user.id, req.user.role, filters);
    
    res.json({
      success: true,
      content,
      user_role: req.user.role,
      can_manage_content: req.user.role === 'admin' || req.user.role === 'manager'
    });
  } catch (error) {
    console.error('Get content error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      query: req.query,
      user: req.user ? { id: req.user.id, role: req.user.role } : 'no user'
    });
    
    // Log error with error code tracker
    const errorCode = `ERR-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
    errorCodeTracker.logError(errorCode, {
      source: 'content_route',
      message: error.message,
      query: req.query,
      user: req.user ? { id: req.user.id, role: req.user.role } : 'no user',
      url: req.originalUrl,
      method: req.method
    }, 'error');
    
    res.status(500).json({ 
      error: error.message,
      errorCode: errorCode 
    });
  }
});

// Get TV shows organized by seasons
router.get('/tv-shows', authenticateToken, async (req, res) => {
  try {
    const tvShows = await mediaService.getTVShowsOrganized(req.user.id, req.user.role);
    
    res.json({
      success: true,
      tvShows,
      user_role: req.user.role,
      can_manage_content: req.user.role === 'admin' || req.user.role === 'manager'
    });
  } catch (error) {
    console.error('Get TV shows error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get episodes for a specific TV show and season
router.get('/tv-shows/:showTitle/season/:seasonNumber', authenticateToken, async (req, res) => {
  try {
    const { showTitle, seasonNumber } = req.params;
    const episodes = await mediaService.getTVShowEpisodes(showTitle, parseInt(seasonNumber), req.user.id, req.user.role);
    
    res.json({
      success: true,
      episodes,
      showTitle,
      seasonNumber: parseInt(seasonNumber)
    });
  } catch (error) {
    console.error('Get TV show episodes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get content statistics (admins only) - must come before /:contentId route
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await mediaService.getStatistics();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get content statistics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get watch history - must come before /:contentId route
router.get('/watch-history', authenticateToken, applyUserRateLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;
    
    const history = await database.query(`
      SELECT wh.*, mc.title, mc.thumbnail_path, mc.media_type, mc.file_size
      FROM watch_history wh
      LEFT JOIN media_content mc ON wh.media_id = mc.id
      WHERE wh.user_id = $1
      ORDER BY wh.last_watched DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), parseInt(offset)]);
    
    res.json({ 
      success: true, 
      history: history.map(item => ({
        id: item.id,
        mediaId: item.media_id,
        title: item.title,
        currentTime: item.current_time,
        duration: item.duration,
        progressPercentage: item.progress_percentage,
        completed: item.completed,
        lastWatched: item.last_watched,
        thumbnailPath: item.thumbnail_path,
        mediaType: item.media_type,
        fileSize: item.file_size
      }))
    });
  } catch (error) {
    console.error('Get watch history error:', error);
    res.status(500).json({ error: 'Failed to get watch history' });
  }
});

// Regenerate thumbnails (admins only)
router.post('/regenerate-thumbnails', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const results = await mediaService.regenerateThumbnails();
    
    res.json({
      success: true,
      message: `Thumbnail regeneration complete: ${results.regenerated} successful, ${results.failed} failed`,
      results
    });
  } catch (error) {
    console.error('Regenerate thumbnails error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch enhanced metadata for existing content (admins only)
router.post('/fetch-metadata', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const results = await mediaService.fetchMetadataForExistingContent();
    
    res.json({
      success: true,
      message: `Metadata fetch complete: ${results.updated} updated, ${results.failed} failed`,
      results
    });
  } catch (error) {
    console.error('Fetch metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Normalize TV show titles (admins only)
router.post('/normalize-tv-shows', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const results = await mediaService.normalizeExistingTVShows();
    
    res.json({
      success: true,
      message: `TV show normalization complete: ${results.updated} episodes updated out of ${results.total} total`,
      results
    });
  } catch (error) {
    console.error('Normalize TV shows error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch metadata for specific content item (admins only)
router.post('/:contentId/fetch-metadata', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { contentId } = req.params;
    
    const result = await mediaService.fetchMetadataForContent(contentId);
    
    if (!result) {
      return res.status(404).json({ error: 'Content not found' });
    }
    
    res.json({
      success: true,
      message: result.updated ? 'Metadata updated successfully' : 'No metadata updates available',
      content: result.content,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Fetch content metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve media files (with access control) - MUST come before /:contentId route
router.get('/:contentId/stream', applyStreamingLimiter, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { sessionId } = req.query; // Get sessionId from query parameter
    
    // Handle token from query parameter or header
    let token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify token manually
    let user;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = decoded;
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // ENFORCEMENT: Require valid sessionId
    if (!sessionId) {
      return res.status(403).json({ error: 'Valid streaming session required' });
    }

    // ENFORCEMENT: Validate active streaming session
    const sessions = await database.query(
      'SELECT * FROM streaming_sessions WHERE id = ? AND status = ?',
      [sessionId, 'active']
    );
    
    if (sessions.length === 0) {
      return res.status(403).json({ error: 'Invalid or inactive streaming session' });
    }

    const session = sessions[0];
    
    // ENFORCEMENT: Get streaming settings
    const settings = await database.query('SELECT * FROM streaming_settings ORDER BY id DESC LIMIT 1');
    const streamingSettings = settings.length > 0 ? settings[0] : {
      max_resolution: '1080p',
      bitrate_limit: '20',
      total_bandwidth_limit: '150',
      per_user_bandwidth_limit: '25'
    };

    // SMART BANDWIDTH TRACKING: Only check limits for actual video streaming, not user interactions
    const range = req.headers.range;
    const isRangeRequest = !!range;
    
    // Only enforce bandwidth limits for actual video data requests (not metadata, thumbnails, etc.)
    if (isRangeRequest) {
      // Parse range to determine if this is a significant video chunk
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : 0;
      const chunkSize = (end - start) + 1;
      
      // Only enforce limits for chunks larger than 1MB (actual video data)
      // Small chunks are likely seeking, buffering, or metadata requests
      const isSignificantChunk = chunkSize > 1024 * 1024; // 1MB threshold
      
      if (isSignificantChunk) {
        // ENFORCEMENT: Check per-user bandwidth limit only for significant video chunks
        const userSessions = await database.query(
          'SELECT SUM(bandwidth) as total_bandwidth FROM streaming_sessions WHERE user_id = $1 AND status = $2',
          [user.id, 'active']
        );
        const currentUserBandwidth = userSessions[0]?.total_bandwidth || 0;
        
        if (currentUserBandwidth > parseFloat(streamingSettings.per_user_bandwidth_limit)) {
          return res.status(403).json({ error: 'Bandwidth limit exceeded' });
        }
      } else {
        // Log small chunk requests for debugging (seeking, buffering, etc.)
      }
    }

    const content = await mediaService.getMediaById(contentId, user.id, user.role);
    
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    
    // Get the best available file for streaming (prefers transcoded versions)
    let streamingFile = await mediaService.getBestStreamingFile(contentId, content.file_path);
    
    // ENFORCEMENT: Check quality/bitrate limits
    const qualityMap = { '480p': 1, '720p': 2, '1080p': 3, '4k': 4 };
    const requestedQuality = qualityMap[streamingFile.quality] || 2;
    const maxQuality = qualityMap[streamingSettings.max_resolution] || 3;
    
    if (requestedQuality > maxQuality) {
      // Try to get a lower quality version
      const lowerQualityFile = await mediaService.getLowerQualityFile(contentId, content.file_path, streamingSettings.max_resolution);
      if (lowerQualityFile) {
        streamingFile = lowerQualityFile;
      } else {
        return res.status(403).json({ error: 'Quality limit exceeded and no suitable version available' });
      }
    }

    // Use the selected file for streaming
    const filePath = streamingFile.filePath;
    const fileSize = streamingFile.fileSize;
    
    // Log streaming info with enforcement details
    if (streamingFile.isTranscoded) {
      if (streamingFile.compressionInfo) {
      }
    } else {
    }
    
    // Only log bandwidth info for significant chunks
    if (isRangeRequest) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      
      if (chunkSize > 1024 * 1024) {
        const userSessions = await database.query(
          'SELECT SUM(bandwidth) as total_bandwidth FROM streaming_sessions WHERE user_id = $1 AND status = $2',
          [user.id, 'active']
        );
        const currentUserBandwidth = userSessions[0]?.total_bandwidth || 0;
      }
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (fileError) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (range) {
      // Support for range requests (streaming)
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      // REAL-TIME BANDWIDTH TRACKING: Track actual bytes transferred
      if (chunksize > 1024 * 1024) { // Only track significant chunks
        trackBandwidthUsage(sessionId, chunksize);
      }
      
      const startTime = Date.now();
      const file = require('fs').createReadStream(filePath, { start, end });
      file.on('open', () => {
      });
      file.on('data', (chunk) => {
        if (!file._firstChunkSent) {
          file._firstChunkSent = true;
        }
      });
      file.on('end', () => {
        const elapsed = Date.now() - startTime;
      });
      file.on('error', (err) => {
        console.error(`[STREAM] File stream error: ${filePath}`, err);
      });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': streamingFile.isTranscoded ? 'video/mp4' : content.mime_type, // Use MP4 for transcoded files
        'Cache-Control': 'public, max-age=3600',
        'X-Transcoded': streamingFile.isTranscoded ? 'true' : 'false', // Header to indicate if transcoded
        'X-Quality': streamingFile.quality, // Header to indicate quality level
        'X-Session-Id': sessionId, // Header to track session
        'X-Chunk-Size': chunksize.toString(), // Header to track chunk size
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Full file
      // REAL-TIME BANDWIDTH TRACKING: Track actual bytes transferred for full file requests
      trackBandwidthUsage(sessionId, fileSize);
      
      const startTime = Date.now();
      const file = require('fs').createReadStream(filePath);
      file.on('open', () => {
      });
      file.on('data', (chunk) => {
        if (!file._firstChunkSent) {
          file._firstChunkSent = true;
        }
      });
      file.on('end', () => {
        const elapsed = Date.now() - startTime;
      });
      file.on('error', (err) => {
        console.error(`[STREAM] File stream error: ${filePath}`, err);
      });
      const head = {
        'Content-Length': fileSize,
        'Content-Type': streamingFile.isTranscoded ? 'video/mp4' : content.mime_type, // Use MP4 for transcoded files
        'Cache-Control': 'public, max-age=3600',
        'X-Transcoded': streamingFile.isTranscoded ? 'true' : 'false', // Header to indicate if transcoded
        'X-Quality': streamingFile.quality, // Header to indicate quality level
        'X-Session-Id': sessionId, // Header to track session
        'X-Chunk-Size': fileSize.toString(), // Header to track chunk size
      };
      
      res.writeHead(200, head);
      file.pipe(res);
    }
  } catch (error) {
    console.error('Stream content error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single content item
router.get('/:contentId', authenticateToken, async (req, res) => {
  try {
    const { contentId } = req.params;
    const content = await mediaService.getMediaById(contentId, req.user.id, req.user.role);
    
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    
    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Get content by ID error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload new content (managers and admins only)
router.post('/upload', authenticateToken, requireContentManagement, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const { title, description, category, tags, published } = req.body;
    
    // Validate category
    const validCategories = ['movie', 'tv-show'];
    if (!category || !validCategories.includes(category)) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({ 
        error: 'Category is required and must be either "movie" or "tv-show"' 
      });
    }
    
    // Save media to database and process
    const mediaResult = await mediaService.saveMedia(req.file, req.user.id);
    
    // Update with additional metadata if provided
    const updates = {};
    if (title && title.trim()) updates.title = title.trim();
    if (description && description.trim()) updates.description = description.trim();
    
    // Combine category with additional tags
    let allTags = category;
    if (tags && tags.trim()) {
      allTags += ',' + tags.trim();
    }
    updates.tags = allTags;
    
    if (published !== undefined) updates.published = published === 'true' || published === true;
    
    if (Object.keys(updates).length > 0) {
      await mediaService.updateMedia(mediaResult.id, updates, req.user.id, req.user.role);
    }
    
    res.json({
      success: true,
      message: 'Video uploaded successfully',
      media: {
        ...mediaResult,
        category,
        tags: allTags
      },
      user_role: req.user.role
    });
  } catch (error) {
    console.error('Upload content error:', error);
    
    // Clean up uploaded file if processing failed
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up failed upload:', cleanupError);
      }
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Update content (managers and admins only)
router.put('/:contentId', authenticateToken, requireContentManagement, async (req, res) => {
  try {
    const { contentId } = req.params;
    const updates = req.body;
    
    await mediaService.updateMedia(contentId, updates, req.user.id, req.user.role);
    
    res.json({
      success: true,
      message: 'Content updated successfully',
      user_role: req.user.role
    });
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete content (managers and admins only)
router.delete('/:contentId', authenticateToken, requireContentManagement, async (req, res) => {
  try {
    const { contentId } = req.params;
    
    const result = await mediaService.deleteMedia(contentId, req.user.id, req.user.role);
    
    res.json({
      success: true,
      message: result.message || 'Content deleted successfully',
      cleaned: result.cleaned,
      user_role: req.user.role
    });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Comprehensive cleanup endpoint - removes ALL traces of media
router.post('/:contentId/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { contentId } = req.params;
    
    const result = await mediaService.comprehensiveCleanup(contentId, req.user.role);
    
    res.json({
      success: true,
      message: result.message,
      cleaned: result.cleaned,
      details: {
        original: result.cleaned.original,
        transcoded: result.cleaned.transcoded,
        thumbnail: result.cleaned.thumbnail,
        database: result.cleaned.database
      },
      user_role: req.user.role
    });
  } catch (error) {
    console.error('Comprehensive cleanup error:', error);
    res.status(404).json({ 
      error: error.message === 'Media not found' ? 'Content not found' : error.message 
    });
  }
});


// Publish/unpublish content (managers and admins only)
router.patch('/:contentId/publish', authenticateToken, requireContentManagement, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { published } = req.body;
    
    await mediaService.updateMedia(contentId, { published }, req.user.id, req.user.role);
    
    res.json({
      success: true,
      message: `Content ${published ? 'published' : 'unpublished'} successfully`,
      user_role: req.user.role
    });
  } catch (error) {
    console.error('Publish content error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate thumbnails for all videos (admin only)
router.post('/regenerate-thumbnails', authenticateToken, requireAdmin, async (req, res) => {
  try {
    
    // Start thumbnail regeneration in background
    const result = await mediaService.regenerateThumbnails();
    
    res.json({
      success: true,
      message: 'Thumbnail regeneration completed',
      result
    });
  } catch (error) {
    console.error('Error regenerating thumbnails:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:contentId/transcoded', authenticateToken, async (req, res) => {
  try {
    const { contentId } = req.params;
    const userId = req.user.id;
    
    // Get the content to verify access
    const content = await mediaService.getMediaById(contentId, userId, req.user.role);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    
    // Get transcoded versions
    const transcoded = await database.query(`
      SELECT tr.*, 
             tr.space_saved,
             ROUND((tr.compression_ratio * 100), 1) as compression_ratio_percent
      FROM transcoded_results tr
      WHERE tr.original_path = ?
      ORDER BY 
        CASE tr.quality
          WHEN '4k' THEN 1
          WHEN '1080p' THEN 2
          WHEN '720p' THEN 3
          WHEN '480p' THEN 4
          ELSE 5
        END
    `, [content.file_path]);
    
    res.json({ 
      success: true, 
      transcoded: transcoded.map(file => ({
        id: file.id,
        qualityLevel: file.quality,
        transcodedPath: file.transcoded_path,
        originalSize: file.original_size,
        transcodedSize: file.transcoded_size,
        spaceSaved: file.space_saved,
        compressionRatio: file.compression_ratio_percent,
        createdAt: file.created_at
      }))
    });
  } catch (error) {
    console.error('Get transcoded files error:', error);
    res.status(500).json({ error: 'Failed to get transcoded files' });
  }
});

// Watch History Routes
router.post('/:contentId/watch-progress', authenticateToken, applyUserRateLimit, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { currentTime, duration, completed = false } = req.body;
    const userId = req.user.id;
    
    // Convert to numbers and validate
    const currentTimeNum = parseFloat(currentTime);
    const durationNum = parseFloat(duration);
    
    if (isNaN(currentTimeNum) || isNaN(durationNum) || currentTimeNum < 0 || durationNum <= 0) {
      return res.status(400).json({ error: 'Current time and duration must be valid positive numbers' });
    }
    
    const progressPercentage = Math.min((currentTimeNum / durationNum) * 100, 100);
    
    // Get content title
    const content = await mediaService.getMediaById(contentId, userId, req.user.role);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    
    // Upsert watch history using PostgreSQL syntax
    await database.query(`
      INSERT INTO watch_history (user_id, media_id, title, current_time, duration, progress_percentage, completed, last_watched, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (user_id, media_id) DO UPDATE SET 
        current_time = EXCLUDED.current_time,
        duration = EXCLUDED.duration,
        progress_percentage = EXCLUDED.progress_percentage,
        completed = EXCLUDED.completed,
        last_watched = EXCLUDED.last_watched,
        updated_at = EXCLUDED.updated_at
    `, [userId, contentId, content.title, currentTimeNum, durationNum, progressPercentage, completed]);
    
    
    res.json({ 
      success: true, 
      message: 'Watch progress saved',
      progress: {
        currentTime: currentTimeNum,
        duration: durationNum,
        progressPercentage,
        completed
      }
    });
  } catch (error) {
    console.error('Save watch progress error:', error);
    res.status(500).json({ error: 'Failed to save watch progress' });
  }
});

router.get('/:contentId/watch-progress', authenticateToken, async (req, res) => {
  try {
    const { contentId } = req.params;
    const userId = req.user.id;
    
    const history = await database.query(
      'SELECT * FROM watch_history WHERE user_id = $1 AND media_id = $2',
      [userId, contentId]
    );
    
    if (history.length === 0) {
      return res.json({ 
        success: true, 
        hasProgress: false,
        progress: null 
      });
    }
    
    const progress = history[0];
    res.json({ 
      success: true, 
      hasProgress: true,
      progress: {
        currentTime: progress.current_time,
        duration: progress.duration,
        progressPercentage: progress.progress_percentage,
        completed: progress.completed,
        lastWatched: progress.last_watched
      }
    });
  } catch (error) {
    console.error('Get watch progress error:', error);
    res.status(500).json({ error: 'Failed to get watch progress' });
  }
});



router.delete('/:contentId/watch-progress', authenticateToken, async (req, res) => {
  try {
    const { contentId } = req.params;
    const userId = req.user.id;
    
    await database.query(
      'DELETE FROM watch_history WHERE user_id = $1 AND media_id = $2',
      [userId, contentId]
    );
    
    
    res.json({ success: true, message: 'Watch progress deleted' });
  } catch (error) {
    console.error('Delete watch progress error:', error);
    res.status(500).json({ error: 'Failed to delete watch progress' });
  }
});

module.exports = router; 
