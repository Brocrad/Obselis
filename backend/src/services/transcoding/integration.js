const TranscodingEngine = require('./transcodingEngine');
const { createTranscodingTables } = require('./databaseSchema');
const path = require('path');

// Global transcoding engine instance
let transcodingEngine = null;

async function initializeTranscodingEngine(io = null) {
  try {
    
    // Create database tables
    await createTranscodingTables();
    
    // Use absolute paths to ensure FFmpeg can resolve them correctly
    // From backend/src/services/transcoding/, go up 3 levels to reach backend/
    const outputDirectory = path.resolve(__dirname, '../../../uploads/transcoded');
    const tempDirectory = path.resolve(__dirname, '../../../uploads/temp');
    
    
    // Initialize the engine
    transcodingEngine = new TranscodingEngine({
      maxConcurrentJobs: 2,
      enableGPU: true, // Re-enable GPU for better performance
      outputDirectory: outputDirectory,
      tempDirectory: tempDirectory,
      defaultQualities: ['1080p', '720p'],
      minCompressionPercent: 5,
      preventDataInflation: true,
      progressUpdateInterval: 1000,
      cleanupInterval: 3600000 // 1 hour
    });
    
    // Connect Socket.IO if available
    if (io) {
      transcodingEngine.progressTracker.setSocketIO(io);
      transcodingEngine.progressTracker.startPeriodicUpdates();
    }
    
    // Set up event listeners for logging
    transcodingEngine.on('engineReady', () => {
    });
    
    transcodingEngine.on('jobAdded', (job) => {
    });
    
    transcodingEngine.on('jobStarted', (job) => {
    });
    
    transcodingEngine.on('jobStatusUpdated', (update) => {
    });
    
    transcodingEngine.on('transcodingProgress', (data) => {
    });
    
    transcodingEngine.on('cleanupCompleted', (summary) => {
    });
    
    return transcodingEngine;
    
  } catch (error) {
    console.error('❌ Failed to initialize Transcoding Engine:', error);
    throw error;
  }
}

function getTranscodingEngine() {
  if (!transcodingEngine) {
    throw new Error('Transcoding Engine not initialized. Call initializeTranscodingEngine() first.');
  }
  return transcodingEngine;
}

// Create compatibility adapter for old API methods
function createCompatibilityAdapter(engine) {
  return {
    // Queue management
    addToQueue: async (inputPath, options = {}) => {
      const result = await engine.addToQueue(inputPath, options);
      return result.jobId;
    },
    
    addToQueueWithOpus: async (inputPath, options = {}) => {
      const opusOptions = { ...options, includeOpus: true };
      const result = await engine.addToQueue(inputPath, opusOptions);
      return result.jobId;
    },
    
    getQueueStatus: () => {
      const status = engine.getQueueStatus();
      return {
        queueLength: status.queued,
        isProcessing: status.active > 0,
        activeJobs: status.active,
        queuedJobs: status.queuedJobs || []
      };
    },
    
    removeFromQueue: (jobId) => {
      return engine.cancelJob(jobId);
    },
    
    clearQueue: () => {
      return engine.clearQueue();
    },
    
    stopAllJobs: async () => {
      return engine.stopAllJobs();
    },
    
    // Storage analytics
    getCompressionStats: async (forceRefresh = false) => {
      const stats = await engine.getCompressionStats(forceRefresh);
      return {
        totalOriginalSize: stats.totalOriginalSize,
        totalCompressedSize: stats.totalTranscodedSize,
        filesProcessed: stats.filesProcessed,
        spaceSaved: stats.spaceSaved,
        compressionRatio: stats.compressionRatio,
        formattedStats: stats.formattedStats
      };
    },
    
    getCachedStorageAnalytics: async () => {
      return engine.getCachedStorageAnalytics();
    },
    
    updateStorageAnalytics: async () => {
      return engine.updateStorageAnalytics();
    },
    
    clearAnalyticsCache: async () => {
      return engine.clearAnalyticsCache();
    },
    
    // File analysis
    analyzeStorageUsage: async (mediaDir, forceRefresh = false) => {
      return engine.analyzeStorageUsage(mediaDir, forceRefresh);
    },
    
    // Configuration
    setSpeedMode: (mode) => {
      return engine.setSpeedMode(mode);
    },
    
    getConfig: () => {
      return engine.getConfig();
    },
    
    updateConfig: (config) => {
      return engine.updateConfig(config);
    },
    
    // Cleanup
    cleanupCorruptedFiles: async (forceCleanup = false) => {
      return engine.cleanupCorruptedFiles(forceCleanup);
    },
    
    // GPU testing
    testGPUAvailability: async () => {
      return engine.testGPUAvailability();
    },
    
    // Auto transcoding
    autoTranscodeUpload: async (filePath, options = {}) => {
      return engine.autoTranscodeUpload(filePath, options);
    }
  };
}

// API Route Handlers
async function handleAddToQueue(req, res) {
  try {
    const { inputPath, qualities, priority, settings } = req.body;
    
    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }
    
    const engine = getTranscodingEngine();
    const result = await engine.addToQueue(inputPath, {
      qualities,
      priority,
      settings
    });
    
    if (result.success) {
      res.json({ success: true, jobId: result.jobId });
    } else {
      res.status(400).json({ error: result.error });
    }
    
  } catch (error) {
    console.error('❌ Add to queue error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleGetQueueStatus(req, res) {
  try {
    const engine = getTranscodingEngine();
    const status = await engine.getQueueStatus();
    res.json(status);
  } catch (error) {
    console.error('❌ Get queue status error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleGetJobStatus(req, res) {
  try {
    const { jobId } = req.params;
    const engine = getTranscodingEngine();
    const job = await engine.getJobStatus(jobId);
    
    if (job) {
      res.json(job);
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (error) {
    console.error('❌ Get job status error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleCancelJob(req, res) {
  try {
    const { jobId } = req.params;
    const engine = getTranscodingEngine();
    const result = await engine.cancelJob(jobId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ Cancel job error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleRetryJob(req, res) {
  try {
    const { jobId } = req.params;
    const engine = getTranscodingEngine();
    const result = await engine.retryJob(jobId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ Retry job error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleAnalyzeFile(req, res) {
  try {
    const { inputPath } = req.body;
    
    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }
    
    const engine = getTranscodingEngine();
    const analysis = await engine.analyzeFile(inputPath);
    res.json(analysis);
    
  } catch (error) {
    console.error('❌ File analysis error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleAnalyzeBatch(req, res) {
  try {
    const { files } = req.body;
    
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' });
    }
    
    const engine = getTranscodingEngine();
    const analyses = await engine.analyzeBatch(files);
    const summary = engine.fileAnalyzer.getAnalysisSummary(analyses);
    
    res.json({ analyses, summary });
    
  } catch (error) {
    console.error('❌ Batch analysis error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleGetSystemInfo(req, res) {
  try {
    const engine = getTranscodingEngine();
    const info = await engine.getSystemInfo();
    res.json(info);
  } catch (error) {
    console.error('❌ Get system info error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleGetPerformanceStats(req, res) {
  try {
    const engine = getTranscodingEngine();
    const stats = await engine.getPerformanceStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Get performance stats error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleUpdateConfig(req, res) {
  try {
    const config = req.body;
    const engine = getTranscodingEngine();
    const result = await engine.updateConfig(config);
    
    if (result.success) {
      res.json({ success: true, config: engine.config });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ Update config error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleForceCleanup(req, res) {
  try {
    const engine = getTranscodingEngine();
    const result = await engine.forceCleanup();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Force cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Socket.IO Event Handlers
function setupSocketIOHandlers(io) {
  io.on('connection', (socket) => {
    
    // Send initial status
    if (transcodingEngine) {
      const status = transcodingEngine.getQueueStatus();
      socket.emit('transcoding-status', status);
    }
    
    // Handle client requests
    socket.on('get-queue-status', async () => {
      try {
        const status = await transcodingEngine.getQueueStatus();
        socket.emit('queue-status', status);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
    
    socket.on('get-job-progress', async (jobId) => {
      try {
        const progress = transcodingEngine.progressTracker.getJobProgress(jobId);
        socket.emit('job-progress', { jobId, progress });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
    
    socket.on('disconnect', () => {
    });
  });
}

// Migration helper
async function migrateFromOldSystem() {
  try {
    
    const engine = getTranscodingEngine();
    
    // The database migration is handled in databaseSchema.js
    // Here we can add any additional migration logic
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Cleanup on shutdown
async function cleanup() {
  try {
    if (transcodingEngine) {
      await transcodingEngine.cleanup();
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

module.exports = {
  initializeTranscodingEngine,
  getTranscodingEngine,
  createCompatibilityAdapter,
  handleAddToQueue,
  handleGetQueueStatus,
  handleGetJobStatus,
  handleCancelJob,
  handleRetryJob,
  handleAnalyzeFile,
  handleAnalyzeBatch,
  handleGetSystemInfo,
  handleGetPerformanceStats,
  handleUpdateConfig,
  handleForceCleanup,
  setupSocketIOHandlers,
  migrateFromOldSystem,
  cleanup
}; 
