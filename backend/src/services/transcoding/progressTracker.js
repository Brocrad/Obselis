const EventEmitter = require('events');

class ProgressTracker extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      updateInterval: 1000, // Progress update interval in ms
      maxHistorySize: 100,  // Maximum number of progress updates to keep in history
      ...config
    };
    
    // Job progress tracking
    this.jobProgress = new Map();
    
    // Progress history for analytics
    this.progressHistory = [];
    
    // Socket.IO instance (will be set by the engine)
    this.io = null;
    
    // Update timer
    this.updateTimer = null;
    
    // Performance metrics
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
  }

  setSocketIO(io) {
    this.io = io;
  }

  updateJobStatus(jobId, status, progress = 0, error = null) {
    const timestamp = Date.now();
    
    // Get or create job progress entry
    let jobData = this.jobProgress.get(jobId);
    if (!jobData) {
      jobData = {
        id: jobId,
        status: 'unknown',
        progress: 0,
        startTime: timestamp,
        lastUpdate: timestamp,
        history: [],
        error: null
      };
      this.jobProgress.set(jobId, jobData);
      this.metrics.totalJobs++;
    }
    
    // Update job data
    const previousStatus = jobData.status;
    jobData.status = status;
    jobData.progress = Math.max(0, Math.min(100, progress));
    jobData.lastUpdate = timestamp;
    
    if (error) {
      jobData.error = error;
    }
    
    // Add to history
    jobData.history.push({
      timestamp,
      status,
      progress: jobData.progress,
      error
    });
    
    // Limit history size
    if (jobData.history.length > this.config.maxHistorySize) {
      jobData.history = jobData.history.slice(-this.config.maxHistorySize);
    }
    
    // Update metrics
    this.updateMetrics(jobId, status, previousStatus);
    
    // Emit progress update
    this.emit('progressUpdate', {
      jobId,
      status,
      progress: jobData.progress,
      error,
      timestamp
    });
    
    // Broadcast via Socket.IO if available
    if (this.io) {
      this.io.emit('transcoding-progress', {
        jobId,
        status,
        progress: jobData.progress,
        error,
        timestamp
      });
    }
    
  }

  updateJobProgress(jobId, progress, phase = 'transcoding') {
    const jobData = this.jobProgress.get(jobId);
    if (!jobData) {
      return;
    }
    
    // Calculate phase-adjusted progress
    let adjustedProgress = progress;
    if (phase === 'analyzing') {
      adjustedProgress = progress * 0.1; // Analyzing is 10% of total
    } else if (phase === 'transcoding') {
      adjustedProgress = 10 + (progress * 0.8); // Transcoding is 80% of total
    } else if (phase === 'finalizing') {
      adjustedProgress = 90 + (progress * 0.1); // Finalizing is 10% of total
    }
    
    this.updateJobStatus(jobId, jobData.status, adjustedProgress);
  }

  updateMetrics(jobId, currentStatus, previousStatus) {
    const jobData = this.jobProgress.get(jobId);
    if (!jobData) return;
    
    // Track completed jobs
    if (currentStatus === 'completed' && previousStatus !== 'completed') {
      this.metrics.completedJobs++;
      
      // Calculate processing time
      const processingTime = jobData.lastUpdate - jobData.startTime;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.averageProcessingTime = 
        this.metrics.totalProcessingTime / this.metrics.completedJobs;
    }
    
    // Track failed jobs
    if (currentStatus === 'failed' && previousStatus !== 'failed') {
      this.metrics.failedJobs++;
    }
  }

  getJobProgress(jobId) {
    return this.jobProgress.get(jobId) || null;
  }

  getAllProgress() {
    const progress = {};
    for (const [jobId, jobData] of this.jobProgress) {
      progress[jobId] = {
        id: jobData.id,
        status: jobData.status,
        progress: jobData.progress,
        startTime: jobData.startTime,
        lastUpdate: jobData.lastUpdate,
        error: jobData.error,
        processingTime: jobData.lastUpdate - jobData.startTime
      };
    }
    return progress;
  }

  getActiveJobs() {
    const activeJobs = [];
    for (const [jobId, jobData] of this.jobProgress) {
      if (['queued', 'analyzing', 'transcoding', 'finalizing'].includes(jobData.status)) {
        activeJobs.push({
          id: jobData.id,
          status: jobData.status,
          progress: jobData.progress,
          startTime: jobData.startTime,
          processingTime: jobData.lastUpdate - jobData.startTime
        });
      }
    }
    return activeJobs;
  }

  getCompletedJobs(limit = 10) {
    const completedJobs = [];
    for (const [jobId, jobData] of this.jobProgress) {
      if (jobData.status === 'completed') {
        completedJobs.push({
          id: jobData.id,
          status: jobData.status,
          progress: jobData.progress,
          startTime: jobData.startTime,
          lastUpdate: jobData.lastUpdate,
          processingTime: jobData.lastUpdate - jobData.startTime
        });
      }
    }
    
    // Sort by completion time (most recent first)
    completedJobs.sort((a, b) => b.lastUpdate - a.lastUpdate);
    return completedJobs.slice(0, limit);
  }

  getFailedJobs(limit = 10) {
    const failedJobs = [];
    for (const [jobId, jobData] of this.jobProgress) {
      if (jobData.status === 'failed') {
        failedJobs.push({
          id: jobData.id,
          status: jobData.status,
          error: jobData.error,
          startTime: jobData.startTime,
          lastUpdate: jobData.lastUpdate,
          processingTime: jobData.lastUpdate - jobData.startTime
        });
      }
    }
    
    // Sort by failure time (most recent first)
    failedJobs.sort((a, b) => b.lastUpdate - a.lastUpdate);
    return failedJobs.slice(0, limit);
  }

  getMetrics() {
    const successRate = this.metrics.totalJobs > 0 
      ? (this.metrics.completedJobs / this.metrics.totalJobs * 100).toFixed(1)
      : 0;
    
    return {
      ...this.metrics,
      successRate: `${successRate}%`,
      averageProcessingTimeFormatted: `${(this.metrics.averageProcessingTime / 1000).toFixed(1)}s`,
      activeJobs: this.getActiveJobs().length,
      completedJobs: this.getCompletedJobs().length,
      failedJobs: this.getFailedJobs().length
    };
  }

  getProgressHistory(jobId = null, limit = 50) {
    if (jobId) {
      const jobData = this.jobProgress.get(jobId);
      return jobData ? jobData.history.slice(-limit) : [];
    }
    
    // Return global progress history
    return this.progressHistory.slice(-limit);
  }

  // Start periodic progress updates
  startPeriodicUpdates() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    this.updateTimer = setInterval(() => {
      const activeJobs = this.getActiveJobs();
      if (activeJobs.length > 0) {
        // Broadcast overall progress
        const overallProgress = {
          activeJobs: activeJobs.length,
          totalProgress: activeJobs.reduce((sum, job) => sum + job.progress, 0) / activeJobs.length,
          jobs: activeJobs,
          timestamp: Date.now()
        };
        
        this.emit('overallProgress', overallProgress);
        
        if (this.io) {
          this.io.emit('overall-transcoding-progress', overallProgress);
        }
      }
    }, this.config.updateInterval);
    
  }

  // Stop periodic updates
  stopPeriodicUpdates() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // Clean up old job data
  cleanupOldJobs(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoffTime = Date.now() - maxAge;
    const jobsToRemove = [];
    
    for (const [jobId, jobData] of this.jobProgress) {
      if (jobData.lastUpdate < cutoffTime && 
          ['completed', 'failed', 'cancelled'].includes(jobData.status)) {
        jobsToRemove.push(jobId);
      }
    }
    
    for (const jobId of jobsToRemove) {
      this.jobProgress.delete(jobId);
    }
    
    if (jobsToRemove.length > 0) {
    }
    
    return jobsToRemove.length;
  }

  // Reset all progress data
  reset() {
    this.jobProgress.clear();
    this.progressHistory = [];
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
    
    this.emit('progressReset');
  }

  // Get summary statistics
  getSummary() {
    const activeJobs = this.getActiveJobs();
    const completedJobs = this.getCompletedJobs();
    const failedJobs = this.getFailedJobs();
    
    return {
      totalJobs: this.metrics.totalJobs,
      activeJobs: activeJobs.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      successRate: this.getMetrics().successRate,
      averageProcessingTime: this.getMetrics().averageProcessingTimeFormatted,
      recentActivity: {
        lastCompleted: completedJobs[0] || null,
        lastFailed: failedJobs[0] || null,
        currentlyProcessing: activeJobs.length
      }
    };
  }

  // Export progress data for backup/analysis
  exportData() {
    return {
      jobProgress: Array.from(this.jobProgress.entries()),
      progressHistory: this.progressHistory,
      metrics: this.metrics,
      config: this.config,
      exportTime: new Date().toISOString()
    };
  }

  // Import progress data
  importData(data) {
    if (data.jobProgress) {
      this.jobProgress = new Map(data.jobProgress);
    }
    if (data.progressHistory) {
      this.progressHistory = data.progressHistory;
    }
    if (data.metrics) {
      this.metrics = data.metrics;
    }
    
    this.emit('dataImported');
  }
}

module.exports = ProgressTracker; 
