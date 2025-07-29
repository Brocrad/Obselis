const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { formatFileSize } = require('../utils/formatters');
const SETTINGS_PATH = path.join(__dirname, '../../system-settings.json');

// Helper to load/save settings
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) { console.error('Failed to load settings:', e); }
  return { autoTranscodingEnabled: false };
}
function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// Get transcoding service instance (initialized with Socket.IO in server.js)
const getTranscodingService = () => {
  return global.transcodingService;
};

// Get storage analytics
router.get('/analytics', authenticateToken, requireAdmin, (req, res, next) => {
  // Apply special rate limiting for storage analysis
  const storageAnalysisLimiter = req.app.locals.storageAnalysisLimiter;
  if (storageAnalysisLimiter) {
    storageAnalysisLimiter(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  try {
    console.log('🔄 Starting storage analytics...');
    const mediaDir = path.join(__dirname, '../../uploads/media');
    const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
    
    console.log('📁 Media directory:', mediaDir);
    console.log('📁 Transcoded directory:', transcodedDir);
    
    // Analyze both directories with timeout protection
    const transcodingService = getTranscodingService();
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Storage analysis timeout')), 120000); // 2 minutes
    });
    
    const analysisPromise = Promise.all([
      transcodingService.analyzeStorageUsage(mediaDir),
      transcodingService.analyzeStorageUsage(transcodedDir),
      transcodingService.getCompressionStats()
    ]);
    
    console.log('⏳ Starting analysis with timeout protection...');
    const [mediaAnalysis, transcodedAnalysis, compressionStats] = await Promise.race([
      analysisPromise,
      timeoutPromise
    ]);
    console.log('✅ Analysis completed successfully');
    
    // Calculate transcoding compression savings
    let transcodingSavings = 0;
    let candidateCount = 0;
    
    if (mediaAnalysis?.compressionCandidates) {
      // Use the detailed estimated savings from the transcoding analysis
      transcodingSavings = mediaAnalysis.compressionCandidates.reduce((total, candidate) => {
        // Each candidate has estimatedSavings calculated by the transcoding service
        const savings = candidate.estimatedSavings?.bytes || candidate.estimatedSavings || 0;
        return total + savings;
      }, 0);
      candidateCount = mediaAnalysis.compressionCandidates.length;
    }
    
    // Calculate duplicate removal savings by running a lightweight duplicate analysis
    let duplicateSavings = 0;
    let duplicateCount = 0;
    let media = []; // Initialize media array
    
    try {
      // Quick duplicate analysis for potential savings calculation
      const database = require('../utils/database');
      media = await database.query(`
        SELECT id, title, original_filename, file_path, file_size, upload_date, 
               season_number, episode_number, show_title, media_type
        FROM media_content 
        ORDER BY title, upload_date
      `);
      
      // Group by normalized title to find duplicates
      const titleGroups = {};
      media.forEach(m => {
        const baseTitle = m.title
          .toLowerCase()
          .replace(/[._-]/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s]/g, '')
          .trim();
        
        if (!titleGroups[baseTitle]) titleGroups[baseTitle] = [];
        titleGroups[baseTitle].push(m);
      });
      
      // Calculate potential savings from duplicates (keep newest, delete older)
      Object.values(titleGroups).forEach(group => {
        if (group.length > 1) {
          const sorted = group.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
          // Add up the file sizes of the duplicates we would delete (all except the newest)
          const duplicatesToDelete = sorted.slice(1);
          duplicatesToDelete.forEach(item => {
            duplicateSavings += item.file_size || 0;
            duplicateCount++;
          });
        }
      });
    } catch (error) {
      console.error('Error calculating duplicate savings:', error);
      // If database query fails, media will remain an empty array
    }
    
    // Calculate content type breakdown
    const contentBreakdown = {
      movies: {
        count: 0,
        size: 0,
        files: []
      },
      tvShows: {
        count: 0,
        size: 0,
        files: []
      },
      other: {
        count: 0,
        size: 0,
        files: []
      }
    };

    // Categorize media based on database fields
    media.forEach(item => {
      const isTVShow = item.season_number !== null || item.episode_number !== null || item.show_title !== null;
      
      if (isTVShow) {
        contentBreakdown.tvShows.count++;
        contentBreakdown.tvShows.size += item.file_size || 0;
        contentBreakdown.tvShows.files.push({
          id: item.id,
          title: item.title,
          show_title: item.show_title,
          season_number: item.season_number,
          episode_number: item.episode_number,
          file_path: item.file_path,
          file_size: item.file_size
        });
      } else if (item.media_type === 'video') {
        contentBreakdown.movies.count++;
        contentBreakdown.movies.size += item.file_size || 0;
        contentBreakdown.movies.files.push({
          id: item.id,
          title: item.title,
          file_path: item.file_path,
          file_size: item.file_size
        });
      } else {
        contentBreakdown.other.count++;
        contentBreakdown.other.size += item.file_size || 0;
        contentBreakdown.other.files.push({
          id: item.id,
          title: item.title,
          media_type: item.media_type,
          file_path: item.file_path,
          file_size: item.file_size
        });
      }
    });

    // Combine transcoding and duplicate savings
    const totalEstimatedSavings = transcodingSavings + duplicateSavings;

    res.json({
      success: true,
      analytics: {
        original: {
          ...mediaAnalysis,
          formattedTotalSize: formatFileSize(mediaAnalysis?.totalSize || 0),
          // Add files array for frontend compatibility
          files: mediaAnalysis?.allFiles?.map(file => ({
            path: file.path,
            size: file.size,
            codec: file.codec || 'unknown',
            duration: file.duration,
            resolution: file.resolution,
            modifiedAt: file.modifiedAt
          })) || []
        },
        transcoded: {
          ...transcodedAnalysis,
          formattedTotalSize: formatFileSize(transcodedAnalysis?.totalSize || 0)
        },
        compression: compressionStats,
        contentBreakdown: contentBreakdown,
        potentialSavings: {
          totalBytes: totalEstimatedSavings,
          bytes: totalEstimatedSavings, // Updated to use combined total
          formatted: formatFileSize(totalEstimatedSavings),
          breakdown: {
            transcoding: {
              bytes: transcodingSavings,
              formatted: formatFileSize(transcodingSavings),
              candidateCount: candidateCount
            },
            duplicates: {
              bytes: duplicateSavings,
              formatted: formatFileSize(duplicateSavings),
              duplicateCount: duplicateCount
            }
          },
          detailedCandidates: mediaAnalysis?.compressionCandidates?.map(candidate => ({
            file: candidate.file,
            size: candidate.size,
            codec: candidate.codec,
            estimatedSavings: candidate.estimatedSavings,
            potentialQualities: candidate.potentialQualities
          })) || []
        }
      }
    });
  } catch (error) {
    console.error('Storage analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze storage usage' 
    });
  }
});

// Get cached storage analytics (faster for real-time dashboard)
router.get('/analytics/cached', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const cachedAnalytics = await transcodingService.getCachedStorageAnalytics();
    
    if (cachedAnalytics) {
      res.json({
        success: true,
        analytics: cachedAnalytics,
        cached: true
      });
    } else {
      // Fallback to regular analytics if cache is empty
      res.redirect('/api/storage/analytics');
    }
  } catch (error) {
    console.error('Cached analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get cached analytics' 
    });
  }
});

// Force refresh analytics (clears cache and recalculates)
router.post('/analytics/refresh', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    
    // Clear any cached analytics
    await transcodingService.clearAnalyticsCache();
    
    // Force recalculation of storage analytics
    const mediaDir = path.join(__dirname, '../../uploads/media');
    const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
    
    // Analyze both directories with force refresh
    const [mediaAnalysis, transcodedAnalysis, compressionStats] = await Promise.all([
      transcodingService.analyzeStorageUsage(mediaDir, true), // Force refresh
      transcodingService.analyzeStorageUsage(transcodedDir, true), // Force refresh
      transcodingService.getCompressionStats(true) // Force refresh
    ]);
    
    // Update storage analytics in database
    await transcodingService.updateStorageAnalytics();
    
    // Calculate potential savings
    const potentialSavings = mediaAnalysis?.compressionCandidates.reduce((total, file) => {
      return total + (file.size * 0.4); // Estimate 40% compression
    }, 0) || 0;

    const refreshedAnalytics = {
      original: {
        ...mediaAnalysis,
        formattedTotalSize: formatFileSize(mediaAnalysis?.totalSize || 0)
      },
      transcoded: {
        ...transcodedAnalysis,
        formattedTotalSize: formatFileSize(transcodedAnalysis?.totalSize || 0)
      },
      compression: compressionStats,
      potentialSavings: {
        bytes: potentialSavings,
        formatted: formatFileSize(potentialSavings),
        candidateCount: mediaAnalysis?.compressionCandidates.length || 0
      }
    };
    
    res.json({
      success: true,
      message: 'Analytics refreshed successfully',
      analytics: refreshedAnalytics,
      refreshed: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Refresh analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh analytics' 
    });
  }
});

// Get transcoded files list
router.get('/transcoded', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const database = require('../utils/database');
    const transcodedFiles = await database.query(`
      SELECT tr.*, 
             CASE WHEN tr.original_path IS NOT NULL THEN 1 ELSE 0 END as original_exists
      FROM transcoded_results tr 
      ORDER BY tr.created_at DESC
    `);
    
    // Add formatted sizes
    const formattedFiles = transcodedFiles.map(file => ({
      ...file,
      original_size_formatted: formatFileSize(file.original_size),
      transcoded_size_formatted: formatFileSize(file.transcoded_size),
      space_saved_formatted: formatFileSize(file.original_size - file.transcoded_size)
    }));
    
    res.json({
      success: true,
      files: formattedFiles,
      count: formattedFiles.length
    });
  } catch (error) {
    console.error('Get transcoded files error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get transcoded files' 
    });
  }
});

// Get transcoding queue status
router.get('/transcoding/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const status = transcodingService.getQueueStatus();
    const stats = await transcodingService.getCompressionStats();
    
    res.json({
      success: true,
      queue: status,
      stats: stats
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get queue status' 
    });
  }
});

// Add file to transcoding queue
router.post('/transcoding/add', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { filePath, qualities, deleteOriginal } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: 'File path is required' 
      });
    }

    // Validate file exists
    const fullPath = path.join(__dirname, '../../uploads/media', path.basename(filePath));
    try {
      await fsPromises.access(fullPath);
    } catch {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }

    const transcodingService = getTranscodingService();
    const jobId = await transcodingService.addToQueue(fullPath, {
      qualities: qualities || ['1080p', '720p'],
      deleteOriginal: deleteOriginal || false,
      priority: 'normal'
    });

    res.json({
      success: true,
      message: 'File added to transcoding queue',
      jobId: jobId
    });
  } catch (error) {
    console.error('Add to queue error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add file to queue' 
    });
  }
});

// Add file to Opus transcoding queue (NEW: Opus-specific endpoint)
router.post('/transcoding/add-opus', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { filePath, qualities, deleteOriginal } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: 'File path is required' 
      });
    }

    // Validate file exists
    const fullPath = path.join(__dirname, '../../uploads/media', path.basename(filePath));
    try {
      await fsPromises.access(fullPath);
    } catch {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }

    const transcodingService = getTranscodingService();
    
    // Use Opus-specific qualities if not provided
    const opusQualities = qualities || ['720p_opus', '480p_opus'];
    
    const jobId = await transcodingService.addToQueueWithOpus(fullPath, {
      qualities: opusQualities,
      deleteOriginal: deleteOriginal || false,
      priority: 'normal'
    });

    if (jobId) {
      res.json({
        success: true,
        message: `File queued for Opus encoding (VP9+Opus WebM)`,
        jobId: jobId,
        qualities: opusQualities,
        codec: 'VP9 + Opus',
        container: 'WebM',
        expectedBenefits: {
          audioCompression: '20-30% better than AAC',
          openSource: true,
          browserSupport: 'Chrome, Firefox, Edge'
        }
      });
    } else {
      res.json({
        success: false,
        message: 'File not queued (may already be transcoded or too small)',
        reason: 'File already processed or below minimum size threshold'
      });
    }
  } catch (error) {
    console.error('Add to Opus queue error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add file to Opus queue',
      details: error.message
    });
  }
});

// Bulk add files to transcoding queue
router.post('/transcoding/bulk-add', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Handle both formats: new (filesWithSettings) and legacy (files + qualities)
    let filesWithSettings = req.body.filesWithSettings;
    
    // Legacy format conversion (from EnhancedTranscodingManager)
    if (!filesWithSettings && req.body.files) {
      filesWithSettings = req.body.files.map(filePath => ({
        file: path.basename(filePath), // Extract filename from path/blob
        settings: {
          qualities: req.body.qualities || ['1080p', '720p'],
          deleteOriginal: false
        }
      }));
    }
    
    if (!filesWithSettings || !Array.isArray(filesWithSettings)) {
      return res.status(400).json({ 
        success: false, 
        error: 'filesWithSettings array is required' 
      });
    }

    const mediaDir = path.join(__dirname, '../../uploads/media');
    const transcodingService = getTranscodingService();
    const jobIds = [];
    const errors = [];

    for (const entry of filesWithSettings) {
      const fileName = entry.file;
      const settings = entry.settings || {};
      try {
        const fullPath = path.join(mediaDir, fileName);
        await fsPromises.access(fullPath);
        
        // Pass all settings to the transcoding service
        const transcodingOptions = {
          qualities: settings.qualities || ['1080p', '720p'],
          deleteOriginal: settings.deleteOriginal === true || settings.deleteOriginals === true,
          priority: settings.priorityLevel || 'normal',
          // Hardware acceleration and codec settings
          enableHardwareAcceleration: settings.enableHardwareAcceleration !== undefined ? settings.enableHardwareAcceleration : true,
          codec: settings.codec || 'h265',
          preset: settings.preset || 'balanced',
          crf: settings.crf || 23,
          audioCodec: settings.audioCodec || 'aac',
          audioBitrate: settings.audioBitrate || 128,
          enableTwoPass: settings.enableTwoPass || false,
          enableDeinterlace: settings.enableDeinterlace || false,
          enableSubtitleBurn: settings.enableSubtitleBurn || false,
          enableMetadataCopy: settings.enableMetadataCopy !== undefined ? settings.enableMetadataCopy : true,
          enableThumbnailGeneration: settings.enableThumbnailGeneration !== undefined ? settings.enableThumbnailGeneration : true,
          maxConcurrentJobs: settings.maxConcurrentJobs || 2
        };
        
        const jobId = await transcodingService.addToQueue(fullPath, transcodingOptions);
        
        if (jobId) {
          jobIds.push({ file: fileName, jobId });
        } else {
          errors.push({ file: fileName, error: 'File skipped - no transcoding needed or file too small' });
        }
      } catch (error) {
        console.error(`❌ Error processing ${fileName}:`, error.message);
        errors.push({ file: fileName, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Added ${jobIds.length} files to transcoding queue`,
      jobs: jobIds,
      errors: errors
    });
  } catch (error) {
    console.error('Bulk add error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add files to queue' 
    });
  }
});

// Set transcoding speed mode
router.post('/transcoding/speed-mode', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['speed', 'balanced', 'quality'].includes(mode)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mode must be "speed", "balanced", or "quality"' 
      });
    }

    const transcodingService = getTranscodingService();
    transcodingService.setSpeedMode(mode);
    
    res.json({
      success: true,
      message: `Transcoding speed mode set to: ${mode}`,
      config: transcodingService.getConfig()
    });
  } catch (error) {
    console.error('Speed mode error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to set speed mode' 
    });
  }
});

// Get transcoding speed mode
router.get('/transcoding/speed-mode', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const config = transcodingService.getConfig();
    
    res.json({
      success: true,
      speedMode: config.speedMode,
      gpuPreset: config.gpuPreset,
      vp9Speed: config.vp9Speed,
      minCompressionPercent: config.minCompressionPercent
    });
  } catch (error) {
    console.error('Get speed mode error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get speed mode' 
    });
  }
});

// Auto-optimize storage (compress large files)
router.post('/optimize', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      minFileSize = 500 * 1024 * 1024, // 500MB default
      qualities = ['1080p', '720p'],
      deleteOriginals = false,
      maxFiles = 10
    } = req.body;

    const mediaDir = path.join(__dirname, '../../uploads/media');
    const transcodingService = getTranscodingService();
    const analysis = await transcodingService.analyzeStorageUsage(mediaDir);
    
    if (!analysis) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to analyze storage' 
      });
    }

    // Filter candidates by size and ensure they're not already transcoded
    const candidates = analysis.compressionCandidates
      .filter(file => {
        // Size check
        if (file.size < minFileSize) return false;
        
        // Double-check that file isn't already transcoded
        const alreadyTranscodedFile = analysis.alreadyTranscoded.find(
          transcoded => transcoded.file === file.file
        );
        
        if (alreadyTranscodedFile) {
          return false;
        }
        
        return true;
      })
      .slice(0, maxFiles);

    if (candidates.length === 0) {
      const alreadyTranscodedCount = analysis.alreadyTranscoded.length;
      const message = alreadyTranscodedCount > 0 
        ? `No new files to optimize. ${alreadyTranscodedCount} files already transcoded.`
        : 'No files found that meet optimization criteria';
        
      return res.json({
        success: true,
        message,
        candidates: [],
        alreadyTranscodedCount
      });
    }

    // Add candidates to transcoding queue with quality filtering
    const jobIds = [];
    for (const candidate of candidates) {
      try {
        // Only add qualities that actually need transcoding
        const filteredQualities = qualities.filter(quality => 
          candidate.potentialQualities.includes(quality)
        );
        
        if (filteredQualities.length === 0) {
          continue;
        }
        
        const jobId = await transcodingService.addToQueue(candidate.path, {
          qualities: filteredQualities,
          deleteOriginal: deleteOriginals,
          priority: 'high'
        });
        jobIds.push({ 
          file: candidate.file, 
          jobId, 
          qualities: filteredQualities 
        });
      } catch (error) {
        console.error(`Failed to queue ${candidate.file}:`, error);
      }
    }

    const estimatedSavings = candidates.reduce((total, file) => 
      total + (file.estimatedSavings || file.size * 0.4), 0
    );

    res.json({
      success: true,
      message: `Added ${jobIds.length} files to transcoding queue`,
      jobs: jobIds,
      skippedAlreadyTranscoded: analysis.alreadyTranscoded.length,
      estimatedSavings: {
        bytes: estimatedSavings,
        formatted: formatFileSize(estimatedSavings)
      }
    });
  } catch (error) {
    console.error('Auto-optimize error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to auto-optimize storage' 
    });
  }
});

// Clean up old/duplicate files
router.post('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      removeEmptyFiles = true,
      removeDuplicates = false,
      dryRun = true 
    } = req.body;

    const mediaDir = path.join(__dirname, '../../uploads/media');
    const files = await fsPromises.readdir(mediaDir);
    const cleanupResults = {
      emptyFiles: [],
      duplicates: [],
      totalSpaceSaved: 0
    };

    // Find empty files
    if (removeEmptyFiles) {
      for (const file of files) {
        const filePath = path.join(mediaDir, file);
        const stats = await fsPromises.stat(filePath);
        
        if (stats.isFile() && stats.size === 0) {
          cleanupResults.emptyFiles.push({ file, path: filePath });
          
          if (!dryRun) {
            await fsPromises.unlink(filePath);
          }
        }
      }
    }

    // This would involve comparing file hashes

    res.json({
      success: true,
      message: dryRun ? 'Cleanup analysis completed (dry run)' : 'Cleanup completed',
      results: cleanupResults,
      dryRun
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to perform cleanup' 
    });
  }
});

// Force cleanup corrupted files (aggressive cleanup)
router.post('/cleanup/force', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const result = await transcodingService.cleanupCorruptedFiles(true); // Force cleanup
    
    res.json({
      success: true,
      message: 'Force cleanup completed',
      ...result
    });
  } catch (error) {
    console.error('Force cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to perform force cleanup' 
    });
  }
});

// Remove job from transcoding queue
router.delete('/transcoding/remove/:jobId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Job ID is required' 
      });
    }

    const transcodingService = getTranscodingService();
    const result = transcodingService.removeFromQueue(jobId);
    
    if (result) {
      res.json({
        success: true,
        message: 'Job removed from queue'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Job not found in queue'
      });
    }
  } catch (error) {
    console.error('Remove job error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to remove job from queue' 
    });
  }
});

// Clear transcoding queue
router.delete('/transcoding/clear', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const result = transcodingService.clearQueue();
    
    res.json({
      success: true,
      message: `Cleared ${result.clearedCount} jobs from queue`
    });
  } catch (error) {
    console.error('Clear queue error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear queue' 
    });
  }
});

// Stop all transcoding jobs (active and queued)
router.delete('/transcoding/stop-all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const result = await transcodingService.stopAllJobs();
    
    res.json({
      success: true,
      message: `Stopped ${result.stoppedActiveJobs} active jobs and cleared ${result.clearedQueuedJobs} queued jobs`,
      stoppedActiveJobs: result.stoppedActiveJobs,
      clearedQueuedJobs: result.clearedQueuedJobs
    });
  } catch (error) {
    console.error('Stop all jobs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stop all jobs' 
    });
  }
});

// Test GPU availability
router.get('/transcoding/gpu-test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const isGPUAvailable = await transcodingService.testGPUAvailability();
    
    res.json({
      success: true,
      gpuAvailable: isGPUAvailable,
      message: isGPUAvailable ? 'GPU encoding is available' : 'GPU encoding not available, will use CPU fallback'
    });
  } catch (error) {
    console.error('GPU test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test GPU availability' 
    });
  }
});

// Get storage recommendations
router.get('/recommendations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const mediaDir = path.join(__dirname, '../../uploads/media');
    const transcodingService = getTranscodingService();
    const analysis = await transcodingService.analyzeStorageUsage(mediaDir);
    
    if (!analysis) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to analyze storage' 
      });
    }

    const recommendations = [];
    
    // Large file compression recommendations
    const largeFiles = analysis.compressionCandidates
      .filter(file => file.size > 1024 * 1024 * 1024) // > 1GB
      .slice(0, 5);
    
    if (largeFiles.length > 0) {
      const estimatedSavings = largeFiles.reduce((total, file) => total + (file.size * 0.4), 0);
      recommendations.push({
        type: 'compression',
        priority: 'high',
        title: 'Compress Large Video Files',
        description: `${largeFiles.length} large video files detected`,
        impact: `Potential savings: ${formatFileSize(estimatedSavings)}`,
        action: 'compress_large_files',
        files: largeFiles.map(f => f.file)
      });
    }

    // Duplicate file detection (basic)
    const duplicates = (analysis.largestFiles || []).filter((file, index, arr) => 
      arr.findIndex(f => f.size === file.size) !== index
    );
    
    if (duplicates.length > 0) {
      recommendations.push({
        type: 'cleanup',
        priority: 'medium',
        title: 'Potential Duplicate Files',
        description: `${duplicates.length} files with identical sizes found`,
        impact: 'Manual review recommended',
        action: 'review_duplicates',
        files: duplicates.map(f => f.file)
      });
    }

    // Storage usage warning
    if (analysis.totalSize > 10 * 1024 * 1024 * 1024) { // > 10GB
      recommendations.push({
        type: 'warning',
        priority: 'low',
        title: 'High Storage Usage',
        description: `Total storage: ${formatFileSize(analysis.totalSize)}`,
        impact: 'Consider regular cleanup and compression',
        action: 'monitor_usage'
      });
    }

    res.json({
      success: true,
      recommendations,
      summary: {
        totalFiles: analysis.totalFiles,
        totalSize: formatFileSize(analysis.totalSize),
        compressionCandidates: analysis.compressionCandidates.length
      }
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate recommendations' 
    });
  }
});

// Schedule content for deletion (when removed from archive)
router.post('/schedule-deletion', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { filePath, mediaId, reason = 'content_removed', delayHours = 24 } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: 'File path is required' 
      });
    }
    
    const database = require('../utils/database');
    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + delayHours);
    
    // Schedule main file for deletion
    await database.insert(
      `INSERT INTO deletion_schedule 
       (file_path, file_type, media_id, scheduled_for, reason) 
       VALUES (?, ?, ?, ?, ?)`,
      [filePath, 'original', mediaId, scheduledFor.toISOString(), reason]
    );
    
    // Also schedule any associated transcoded files
    const transcodedFiles = await database.query(
              'SELECT transcoded_path FROM transcoded_results WHERE original_path = ?',
      [filePath]
    );
    
    for (const transcoded of transcodedFiles) {
      await database.insert(
        `INSERT INTO deletion_schedule 
         (file_path, file_type, media_id, scheduled_for, reason) 
         VALUES (?, ?, ?, ?, ?)`,
        [transcoded.transcoded_path, 'transcoded', mediaId, scheduledFor.toISOString(), reason]
      );
    }
    
    // Mark transcoded files as inactive
    await database.update(
              'DELETE FROM transcoded_results WHERE original_path = ?',
      [filePath]
    );
    
    res.json({
      success: true,
      message: `Scheduled ${1 + transcodedFiles.length} files for deletion in ${delayHours} hours`,
      scheduledFor: scheduledFor.toISOString()
    });
  } catch (error) {
    console.error('Schedule deletion error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to schedule deletion' 
    });
  }
});

// Get deletion schedule
router.get('/deletion-schedule', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const database = require('../utils/database');
    const schedule = await database.query(`
      SELECT ds.*, 
             CASE 
               WHEN ds.scheduled_for <= NOW() THEN 'overdue'
               WHEN ds.scheduled_for <= NOW() + INTERVAL '1 hour' THEN 'soon'
               ELSE 'scheduled'
             END as urgency
      FROM deletion_schedule ds 
      WHERE ds.status IN ('pending', 'processing')
      ORDER BY ds.scheduled_for ASC
    `);
    
    const transcodingService = getTranscodingService();
    const formattedSchedule = schedule.map(item => ({
      ...item,
      scheduled_for_formatted: new Date(item.scheduled_for).toLocaleString(),
      file_name: require('path').basename(item.file_path)
    }));
    
    res.json({
      success: true,
      schedule: formattedSchedule,
      count: formattedSchedule.length
    });
  } catch (error) {
    console.error('Get deletion schedule error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get deletion schedule' 
    });
  }
});

// Cancel scheduled deletion
router.delete('/deletion-schedule/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const database = require('../utils/database');
    
    const result = await database.update(
      'UPDATE deletion_schedule SET status = ? WHERE id = ? AND status = ?',
      ['cancelled', id, 'pending']
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Deletion not found or cannot be cancelled' 
      });
    }
    
    res.json({
      success: true,
      message: 'Deletion cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel deletion error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cancel deletion' 
    });
  }
});

// Cleanup corrupted transcoded files
router.post('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodingService = getTranscodingService();
    const cleanedCount = await transcodingService.cleanupCorruptedFiles();
    
    // Update analytics after cleanup
    await transcodingService.updateStorageAnalytics();
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} corrupted files and updated analytics`,
      cleanedCount
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cleanup corrupted files' 
    });
  }
});

// Force cleanup all 0-byte files in transcoded directory
router.post('/cleanup/force', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
    const files = await fsPromises.readdir(transcodedDir);
    let cleanedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(transcodedDir, file);
      try {
        const stats = await fsPromises.stat(filePath);
        if (stats.isFile() && stats.size === 0) {
          await fsPromises.unlink(filePath);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error processing ${file}:`, error.message);
      }
    }
    
    // Clean up database entries for deleted files
    const database = require('../utils/database');
    await database.query(
              'DELETE FROM transcoded_results WHERE transcoded_size = 0 OR transcoded_size IS NULL'
    );
    
    // Update analytics
    const transcodingService = getTranscodingService();
    await transcodingService.updateStorageAnalytics();
    
    res.json({
      success: true,
      message: `Force cleaned ${cleanedCount} corrupted files and updated database`,
      cleanedCount
    });
  } catch (error) {
    console.error('Force cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to force cleanup corrupted files' 
    });
  }
});

// GET system transcoding settings
router.get('/settings', authenticateToken, requireAdmin, (req, res) => {
  const settings = loadSettings();
  res.json({ success: true, settings });
});

// POST update system transcoding settings
router.post('/settings', authenticateToken, requireAdmin, (req, res) => {
  const { autoTranscodingEnabled } = req.body;
  const settings = loadSettings();
  if (typeof autoTranscodingEnabled === 'boolean') {
    settings.autoTranscodingEnabled = autoTranscodingEnabled;
  }
  saveSettings(settings);
  res.json({ success: true, settings });
});

module.exports = router; 
