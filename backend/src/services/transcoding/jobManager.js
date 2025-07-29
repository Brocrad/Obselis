const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const database = require('../../utils/database');

class JobManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentJobs: 2,
      maxQueueSize: 100,
      retryAttempts: 3,
      retryDelay: 5000,
      ...config
    };
    
    this.activeJobs = new Map();
    this.isProcessing = false;
    this.workerPool = [];
    
    // Initialize database tables
    this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      // Create jobs table
      await database.query(`
        CREATE TABLE IF NOT EXISTS transcoding_jobs (
          id TEXT PRIMARY KEY,
          input_path TEXT NOT NULL,
          output_path TEXT,
          qualities TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          priority INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          completed_at DATETIME,
          error_message TEXT,
          progress REAL DEFAULT 0,
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          settings TEXT
        )
      `);

      // Create results table
      await database.query(`
        CREATE TABLE IF NOT EXISTS transcoding_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          quality TEXT NOT NULL,
          original_path TEXT NOT NULL,
          transcoded_path TEXT NOT NULL,
          original_size INTEGER NOT NULL,
          transcoded_size INTEGER NOT NULL,
          compression_ratio REAL NOT NULL,
          space_saved INTEGER NOT NULL,
          checksum TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES transcoding_jobs(id)
        )
      `);

    } catch (error) {
      console.error('❌ Failed to initialize Job Manager database:', error);
      throw error;
    }
  }

  async addJob(inputPath, options = {}) {
    try {
      const jobId = uuidv4();
      const job = {
        id: jobId,
        inputPath,
        qualities: options.qualities || ['1080p', '720p'],
        priority: options.priority || 0,
        settings: {
          enableGPU: options.enableGPU !== undefined ? options.enableGPU : true,
          deleteOriginal: options.deleteOriginal || false,
          ...options.settings
        },
        status: 'queued',
        progress: 0,
        attempts: 0,
        maxAttempts: this.config.retryAttempts,
        createdAt: new Date()
      };

      // Check if job already exists for this file
      const existingJob = await this.getJobByInputPath(inputPath);
      if (existingJob && existingJob.status !== 'failed') {
        return existingJob.id;
      }

      // Insert job into database
      await database.query(`
        INSERT INTO transcoding_jobs (
          id, input_path, qualities, status, priority, 
          attempts, max_attempts, settings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        job.id,
        job.inputPath,
        JSON.stringify(job.qualities),
        job.status,
        job.priority,
        job.attempts,
        job.maxAttempts,
        JSON.stringify(job.settings)
      ]);

      
      // Emit job added event
      this.emit('jobAdded', job);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }

      return job.id;
    } catch (error) {
      console.error('❌ Failed to add job:', error);
      throw error;
    }
  }

  async getJob(jobId) {
    try {
      const result = await database.query(
        'SELECT * FROM transcoding_jobs WHERE id = ?',
        [jobId]
      );
      
      if (result.length === 0) {
        return null;
      }

      const job = result[0];
      return {
        ...job,
        inputPath: job.input_path, // Map database column to expected property
        qualities: JSON.parse(job.qualities),
        settings: JSON.parse(job.settings || '{}')
      };
    } catch (error) {
      console.error('❌ Failed to get job:', error);
      return null;
    }
  }

  async getJobByInputPath(inputPath) {
    try {
      const result = await database.query(
        'SELECT * FROM transcoding_jobs WHERE input_path = ? ORDER BY created_at DESC LIMIT 1',
        [inputPath]
      );
      
      if (result.length === 0) {
        return null;
      }

      const job = result[0];
      return {
        ...job,
        qualities: JSON.parse(job.qualities),
        settings: JSON.parse(job.settings || '{}')
      };
    } catch (error) {
      console.error('❌ Failed to get job by input path:', error);
      return null;
    }
  }

  async updateJobStatus(jobId, status, progress = null, errorMessage = null) {
    try {
      const updates = ['status = ?'];
      const params = [status];

      if (progress !== null) {
        updates.push('progress = ?');
        params.push(progress);
      }

      if (errorMessage !== null) {
        updates.push('error_message = ?');
        params.push(errorMessage);
      }

      if (status === 'transcoding') {
        updates.push('started_at = ?');
        params.push(new Date().toISOString());
      } else if (status === 'completed' || status === 'failed') {
        updates.push('completed_at = ?');
        params.push(new Date().toISOString());
      }

      params.push(jobId);

      await database.query(
        `UPDATE transcoding_jobs SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      // Emit status update event
      this.emit('jobStatusUpdated', { jobId, status, progress, errorMessage });
    } catch (error) {
      console.error('❌ Failed to update job status:', error);
    }
  }

  async incrementJobAttempts(jobId) {
    try {
      await database.query(
        'UPDATE transcoding_jobs SET attempts = attempts + 1 WHERE id = ?',
        [jobId]
      );
    } catch (error) {
      console.error('❌ Failed to increment job attempts:', error);
    }
  }

  async getQueuedJobs() {
    try {
      const result = await database.query(`
        SELECT * FROM transcoding_jobs 
        WHERE status = 'queued' 
        ORDER BY priority DESC, created_at ASC
        LIMIT ?
      `, [this.config.maxQueueSize]);

      return result.map(job => ({
        ...job,
        inputPath: job.input_path, // Map database column to expected property
        qualities: JSON.parse(job.qualities),
        settings: JSON.parse(job.settings || '{}')
      }));
    } catch (error) {
      console.error('❌ Failed to get queued jobs:', error);
      return [];
    }
  }

  async getActiveJobs() {
    try {
      const result = await database.query(`
        SELECT * FROM transcoding_jobs 
        WHERE status IN ('analyzing', 'transcoding')
        ORDER BY started_at ASC
      `);

      return result.map(job => ({
        ...job,
        qualities: JSON.parse(job.qualities),
        settings: JSON.parse(job.settings || '{}')
      }));
    } catch (error) {
      console.error('❌ Failed to get active jobs:', error);
      return [];
    }
  }

  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (true) {
      try {
        // Check if we can process more jobs
        const activeJobs = await this.getActiveJobs();
        if (activeJobs.length >= this.config.maxConcurrentJobs) {
          await this.sleep(1000);
          continue;
        }

        // Get next job from queue
        const queuedJobs = await this.getQueuedJobs();
        if (queuedJobs.length === 0) {
          break;
        }

        const job = queuedJobs[0];

        // Start job processing
        this.activeJobs.set(job.id, job);
        await this.updateJobStatus(job.id, 'analyzing', 0);

        // Emit job started event
        this.emit('jobStarted', job);

        // Process job (this will be handled by the main transcoding engine)
        this.emit('processJob', job);

      } catch (error) {
        console.error('❌ Error in queue processing:', error);
        await this.sleep(5000);
      }
    }

    this.isProcessing = false;
  }

  async cancelJob(jobId) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status === 'completed' || job.status === 'failed') {
        throw new Error('Cannot cancel completed or failed job');
      }

      await this.updateJobStatus(jobId, 'cancelled');
      
      // Remove from active jobs
      this.activeJobs.delete(jobId);
      
      this.emit('jobCancelled', jobId);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to cancel job:', error);
      throw error;
    }
  }

  async retryJob(jobId) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.attempts >= job.maxAttempts) {
        throw new Error('Job has exceeded maximum retry attempts');
      }

      // Reset job status
      await database.query(`
        UPDATE transcoding_jobs 
        SET status = 'queued', progress = 0, error_message = NULL
        WHERE id = ?
      `, [jobId]);

      this.emit('jobRetried', jobId);

      // Restart queue processing if needed
      if (!this.isProcessing) {
        this.processQueue();
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to retry job:', error);
      throw error;
    }
  }

  async getQueueStatus() {
    try {
      const [queuedJobs, activeJobs, completedJobs, failedJobs] = await Promise.all([
        database.query("SELECT COUNT(*) as count FROM transcoding_jobs WHERE status = 'queued'"),
        database.query("SELECT COUNT(*) as count FROM transcoding_jobs WHERE status IN ('analyzing', 'transcoding')"),
        database.query("SELECT COUNT(*) as count FROM transcoding_jobs WHERE status = 'completed'"),
        database.query("SELECT COUNT(*) as count FROM transcoding_jobs WHERE status = 'failed'")
      ]);

      return {
        queued: queuedJobs[0].count,
        active: activeJobs[0].count,
        completed: completedJobs[0].count,
        failed: failedJobs[0].count,
        isProcessing: this.isProcessing,
        maxConcurrentJobs: this.config.maxConcurrentJobs
      };
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

  async clearCompletedJobs(olderThanDays = 7) {
    try {
      const result = await database.query(`
        DELETE FROM transcoding_jobs 
        WHERE status IN ('completed', 'failed', 'cancelled')
        AND created_at < NOW() - INTERVAL '${olderThanDays} days'
      `);

      return result.changes;
    } catch (error) {
      console.error('❌ Failed to clear completed jobs:', error);
      return 0;
    }
  }

  async clearQueue() {
    try {
      // Cancel all active jobs
      for (const [jobId, job] of this.activeJobs) {
        await this.cancelJob(jobId);
      }

      // Clear all queued jobs from database
      const result = await database.query(`
        DELETE FROM transcoding_jobs 
        WHERE status IN ('queued', 'pending')
      `);

      return result.changes || 0;
    } catch (error) {
      console.error('❌ Failed to clear queue:', error);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = JobManager; 
