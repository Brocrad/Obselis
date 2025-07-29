const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const JobManager = require('./jobManager');
const FileAnalyzer = require('./fileAnalyzer');
const Transcoder = require('./transcoder');
const StorageManager = require('./storageManager');
const ProgressTracker = require('./progressTracker');
const CleanupService = require('./cleanupService');

class TranscodingEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Engine settings
      maxConcurrentJobs: 2,
      enableGPU: true,
      outputDirectory: './uploads/transcoded',
      tempDirectory: './uploads/temp',
      
      // Quality settings
      defaultQualities: ['1080p', '720p'],
      minCompressionPercent: 5,
      preventDataInflation: true,
      
      // Performance settings
      progressUpdateInterval: 1000,
      cleanupInterval: 3600000, // 1 hour
      
      ...config
    };
    
    // Initialize components
    this.jobManager = new JobManager({
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      retryAttempts: 3,
      retryDelay: 5000
    });
    
    this.fileAnalyzer = new FileAnalyzer({
      minFileSizeMB: 100,
      minCompressionPercent: this.config.minCompressionPercent,
      preventDataInflation: this.config.preventDataInflation
    });
    
    this.transcoder = new Transcoder({
      enableGPU: this.config.enableGPU,
      minCompressionPercent: this.config.minCompressionPercent,
      preventDataInflation: this.config.preventDataInflation
    });
    
    this.storageManager = new StorageManager({
      outputDirectory: this.config.outputDirectory,
      tempDirectory: this.config.tempDirectory
    });
    
    this.progressTracker = new ProgressTracker({
      updateInterval: this.config.progressUpdateInterval
    });
    
    this.cleanupService = new CleanupService({
      cleanupInterval: this.config.cleanupInterval
    });
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize the engine
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize storage
      await this.storageManager.initialize();
      
      // Test GPU availability
      const gpuAvailable = await this.transcoder.testGPUAvailability();
      if (!gpuAvailable && this.config.enableGPU) {
        this.transcoder.updateConfig({ enableGPU: false });
      }
      
      // Start cleanup service
      this.cleanupService.start();
      
      // Set up job processing
      this.jobManager.on('processJob', (job) => this.processJob(job));
      
      this.emit('engineReady');
      
    } catch (error) {
      console.error('❌ Failed to initialize Transcoding Engine:', error);
      this.emit('engineError', error);
    }
  }

  setupEventListeners() {
    // Job Manager events
    this.jobManager.on('jobAdded', (job) => {
      this.emit('jobAdded', job);
      this.progressTracker.updateJobStatus(job.id, 'queued');
    });
    
    this.jobManager.on('jobStarted', (job) => {
      this.emit('jobStarted', job);
      this.progressTracker.updateJobStatus(job.id, 'analyzing');
    });
    
    this.jobManager.on('jobStatusUpdated', (update) => {
      this.emit('jobStatusUpdated', update);
      this.progressTracker.updateJobStatus(update.jobId, update.status, update.progress);
    });
    
    // File Analyzer events
    this.fileAnalyzer.on('fileAnalyzed', (analysis) => {
      this.emit('fileAnalyzed', analysis);
    });
    
    this.fileAnalyzer.on('analysisError', (error) => {
      this.emit('analysisError', error);
    });
    
    // Transcoder events
    this.transcoder.on('transcodingStarted', (data) => {
      this.emit('transcodingStarted', data);
      this.progressTracker.updateJobStatus(data.jobId, 'transcoding');
    });
    
    this.transcoder.on('transcodingProgress', (data) => {
      this.emit('transcodingProgress', data);
      this.progressTracker.updateJobProgress(data.jobId, data.progress);
    });
    
    this.transcoder.on('transcodingCompleted', (data) => {
      this.emit('transcodingCompleted', data);
    });
    
    this.transcoder.on('transcodingError', (data) => {
      this.emit('transcodingError', data);
    });
    
    // Progress Tracker events
    this.progressTracker.on('progressUpdate', (update) => {
      this.emit('progressUpdate', update);
    });
  }

  async processJob(job) {
    try {
      // Step 1: Analyze the file
      await this.jobManager.updateJobStatus(job.id, 'analyzing', 10);
      const analysis = await this.fileAnalyzer.analyzeFile(job.inputPath);
      
      if (!analysis.isValid) {
        throw new Error(`File analysis failed: ${analysis.reason}`);
      }
      
      if (!analysis.transcodingAnalysis.needsTranscoding) {
        await this.jobManager.updateJobStatus(job.id, 'completed', 100);
        return;
      }
      
      // Step 2: Prepare output directory
      await this.jobManager.updateJobStatus(job.id, 'transcoding', 20);
      const outputDir = await this.storageManager.prepareOutputDirectory(job.inputPath);
      
      // Step 3: Transcode each quality
      const results = [];
      const qualities = job.qualities.filter(quality => 
        analysis.transcodingAnalysis.recommendedQualities.includes(quality)
      );
      
      for (let i = 0; i < qualities.length; i++) {
        const quality = qualities[i];
        const progress = 20 + (i / qualities.length) * 70; // 20% to 90%
        
        await this.jobManager.updateJobStatus(job.id, 'transcoding', progress);
        
        try {
          const outputPath = await this.storageManager.generateOutputPath(job.inputPath, quality);
          const result = await this.transcoder.transcodeFile(job.inputPath, outputPath, quality, job.id);
          
          // Record the result
          await this.recordTranscodingResult(job.id, result);
          results.push(result);
          
        } catch (error) {
          console.error(`❌ Quality ${quality} failed for job ${job.id}:`, error.message);
          // Continue with other qualities
        }
      }
      
      // Step 4: Complete the job
      if (results.length > 0) {
        await this.jobManager.updateJobStatus(job.id, 'completed', 100);
        
        // Update storage analytics
        await this.storageManager.updateAnalytics();
        
      } else {
        throw new Error('All quality transcodings failed');
      }
      
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      
      // Increment attempt count
      await this.jobManager.incrementJobAttempts(job.id);
      
      // Check if we should retry
      const jobInfo = await this.jobManager.getJob(job.id);
      if (jobInfo.attempts < jobInfo.maxAttempts) {
        await this.jobManager.updateJobStatus(job.id, 'queued', 0, error.message);
      } else {
        await this.jobManager.updateJobStatus(job.id, 'failed', 0, error.message);
      }
    }
  }

  async recordTranscodingResult(jobId, result) {
    try {
      const database = require('../../utils/database');
      
      await database.query(`
        INSERT INTO transcoded_results (
          job_id, quality, original_path, transcoded_path,
          original_size, transcoded_size, compression_ratio,
          space_saved, checksum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        jobId,
        result.quality,
        result.originalPath || 'unknown',
        result.outputPath,
        result.originalSize,
        result.outputSize,
        result.compressionRatio,
        result.spaceSavedBytes || 0,
        await this.calculateChecksum(result.outputPath)
      ]);
      
    } catch (error) {
      console.error('❌ Failed to record transcoding result:', error);
    }
  }

  async calculateChecksum(filePath) {
    try {
      const crypto = require('crypto');
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (error) {
      console.error('❌ Failed to calculate checksum:', error);
      return null;
    }
  }

  // Public API methods

  async addToQueue(inputPath, options = {}) {
    try {
      const jobId = await this.jobManager.addJob(inputPath, {
        qualities: options.qualities || this.config.defaultQualities,
        priority: options.priority || 0,
        settings: {
          enableGPU: options.enableGPU !== undefined ? options.enableGPU : this.config.enableGPU,
          deleteOriginal: options.deleteOriginal || false,
          ...options.settings
        }
      });
      
      return { success: true, jobId };
    } catch (error) {
      console.error('❌ Failed to add job to queue:', error);
      return { success: false, error: error.message };
    }
  }

  async analyzeFile(inputPath) {
    try {
      return await this.fileAnalyzer.analyzeFile(inputPath);
    } catch (error) {
      console.error('❌ File analysis failed:', error);
      throw error;
    }
  }

  async analyzeBatch(files) {
    try {
      return await this.fileAnalyzer.analyzeBatch(files);
    } catch (error) {
      console.error('❌ Batch analysis failed:', error);
      throw error;
    }
  }

  async getJobStatus(jobId) {
    try {
      return await this.jobManager.getJob(jobId);
    } catch (error) {
      console.error('❌ Failed to get job status:', error);
      return null;
    }
  }

  async getQueueStatus() {
    try {
      return await this.jobManager.getQueueStatus();
    } catch (error) {
      console.error('❌ Failed to get queue status:', error);
      return {
        queued: 0,
        active: 0,
        completed: 0,
        failed: 0,
        isProcessing: false,
        maxConcurrentJobs: this.config.maxConcurrentJobs
      };
    }
  }

  async cancelJob(jobId) {
    try {
      // Cancel transcoding process
      await this.transcoder.cancelTranscoding(jobId);
      
      // Cancel job in queue
      await this.jobManager.cancelJob(jobId);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to cancel job:', error);
      return { success: false, error: error.message };
    }
  }

  async retryJob(jobId) {
    try {
      await this.jobManager.retryJob(jobId);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to retry job:', error);
      return { success: false, error: error.message };
    }
  }

  async getSystemInfo() {
    try {
      const [transcoderInfo, storageInfo] = await Promise.all([
        this.transcoder.getSystemInfo(),
        this.storageManager.getStorageInfo()
      ]);
      
      return {
        transcoder: transcoderInfo,
        storage: storageInfo,
        config: this.config
      };
    } catch (error) {
      console.error('❌ Failed to get system info:', error);
      return { transcoder: null, storage: null, config: this.config };
    }
  }

  async getPerformanceStats() {
    try {
      const [transcoderStats, storageStats] = await Promise.all([
        this.transcoder.getPerformanceStats(),
        this.storageManager.getAnalytics()
      ]);
      
      return {
        transcoder: transcoderStats,
        storage: storageStats,
        queue: await this.getQueueStatus()
      };
    } catch (error) {
      console.error('❌ Failed to get performance stats:', error);
      return { transcoder: null, storage: null, queue: null };
    }
  }

  async updateConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      
      // Update component configs
      this.jobManager.config = { ...this.jobManager.config, ...newConfig };
      this.fileAnalyzer.config = { ...this.fileAnalyzer.config, ...newConfig };
      this.transcoder.updateConfig(newConfig);
      
      this.emit('configUpdated', this.config);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to update configuration:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    try {
      
      // Cleanup components
      await Promise.all([
        this.transcoder.cleanup(),
        this.storageManager.cleanup(),
        this.cleanupService.stop()
      ]);
      
      this.emit('cleanupCompleted');
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }

  // Utility methods

  getQualityPresets() {
    return this.transcoder.getQualityPresets();
  }

  async testGPU() {
    return await this.transcoder.testGPUAvailability();
  }

  async forceCleanup() {
    return await this.cleanupService.forceCleanup();
  }

  // Compatibility methods for old API
  async analyzeStorageUsage(mediaDir, forceRefresh = false) {
    try {
      console.log(`🔍 Analyzing storage usage for: ${mediaDir}`);
      const files = await this.storageManager.getDirectoryFiles(mediaDir);
      console.log(`📊 Found ${files.length} files to analyze`);
      const analysis = {
        totalFiles: 0,
        totalSize: 0,
        fileTypes: {},
        allFiles: [],
        largestFiles: [],
        compressionCandidates: [],
        alreadyTranscoded: [],
        skipReasons: {}
      };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (i % 10 === 0) {
          console.log(`📈 Progress: ${i}/${files.length} files analyzed`);
        }
        const filePath = path.join(mediaDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();
          const size = stats.size;
          
          analysis.totalFiles++;
          analysis.totalSize += size;
          
          // Track file types
          analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;
          
          // Track largest files
          const fileInfo = { 
            file, 
            size, 
            path: filePath,
            modifiedAt: stats.mtime
          };
          
          analysis.allFiles.push(fileInfo);
          analysis.largestFiles.push(fileInfo);
          
          // Analyze video files for transcoding potential
          if (['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv'].includes(ext)) {
            try {
              const codec = await this.fileAnalyzer.getFileCodec(filePath);
              const mediaInfo = { videoCodec: codec };
              const transcodingAnalysis = await this.fileAnalyzer.analyzeTranscodingNeeds(filePath, mediaInfo);
              
              if (transcodingAnalysis && transcodingAnalysis.needsTranscoding) {
                analysis.compressionCandidates.push({
                  file,
                  size,
                  path: filePath,
                  codec: codec,
                  estimatedSavings: transcodingAnalysis.estimatedSavings || 0,
                  potentialQualities: transcodingAnalysis.recommendedQualities || []
                });
              } else {
                // Track why it was skipped
                const isAlreadyTranscoded = await this.fileAnalyzer.checkAlreadyTranscoded(filePath, '1080p') || 
                                           await this.fileAnalyzer.checkAlreadyTranscoded(filePath, '720p');
                
                if (isAlreadyTranscoded) {
                  analysis.alreadyTranscoded.push({ file, size, path: filePath });
                } else {
                  let reason = 'unknown';
                  
                  if (codec && (codec.toLowerCase().includes('hevc') || codec.toLowerCase().includes('h265'))) {
                    reason = 'already_h265';
                  } else if (size < 100 * 1024 * 1024) {
                    reason = 'too_small';
                  }
                  
                  analysis.skipReasons[reason] = (analysis.skipReasons[reason] || 0) + 1;
                }
              }
            } catch (error) {
              analysis.skipReasons['analysis_error'] = (analysis.skipReasons['analysis_error'] || 0) + 1;
            }
          }
        }
      }

      // Sort all files by size
      analysis.allFiles.sort((a, b) => b.size - a.size);
      analysis.largestFiles = analysis.allFiles.slice(0, 10);

      // Sort compression candidates by potential savings
      analysis.compressionCandidates.sort((a, b) => b.estimatedSavings - a.estimatedSavings);

      // Add summary statistics
      analysis.summary = {
        totalCandidates: analysis.compressionCandidates.length,
        totalAlreadyTranscoded: analysis.alreadyTranscoded.length,
        estimatedTotalSavings: analysis.compressionCandidates.reduce(
          (sum, candidate) => sum + candidate.estimatedSavings, 0
        )
      };

      return analysis;
    } catch (error) {
      console.error('Storage analysis error:', error);
      return null;
    }
  }

  async getCompressionStats(forceRefresh = false) {
    try {
      const stats = await this.storageManager.getCompressionStats(forceRefresh);
      return {
        totalOriginalSize: stats.totalOriginalSize,
        totalCompressedSize: stats.totalTranscodedSize,
        filesProcessed: stats.filesProcessed,
        spaceSaved: stats.spaceSaved,
        compressionRatio: stats.compressionRatio,
        formattedStats: stats.formattedStats
      };
    } catch (error) {
      console.error('Error getting compression stats:', error);
      return {
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        filesProcessed: 0,
        spaceSaved: 0,
        compressionRatio: '0%',
        formattedStats: {
          totalOriginalSize: '0 B',
          totalCompressedSize: '0 B',
          spaceSaved: '0 B'
        }
      };
    }
  }

  async getCachedStorageAnalytics() {
    return this.storageManager.getCachedStorageAnalytics();
  }

  async updateStorageAnalytics() {
    return this.storageManager.updateStorageAnalytics();
  }

  async clearAnalyticsCache() {
    return this.storageManager.clearAnalyticsCache();
  }

  async autoTranscodeUpload(filePath, options = {}) {
    const defaultOptions = {
      qualities: ['1080p', '720p'],
      deleteOriginal: false,
      priority: 'high',
      includeOpus: false
    };

    return this.addToQueue(filePath, { ...defaultOptions, ...options });
  }

  async clearQueue() {
    try {
      const result = await this.jobManager.clearQueue();
      return result;
    } catch (error) {
      console.error('❌ Failed to clear transcoding queue:', error);
      throw error;
    }
  }
}

module.exports = TranscodingEngine; 
