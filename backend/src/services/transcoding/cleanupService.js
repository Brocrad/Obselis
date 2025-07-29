const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { formatFileSize } = require('../../utils/formatters');

class CleanupService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      cleanupInterval: 3600000, // 1 hour default
      maxFileAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      minFileSize: 1024 * 1024, // 1MB minimum
      corruptedFileThreshold: 1024, // 1KB - files smaller than this are considered corrupted
      tempFileAge: 60 * 60 * 1000, // 1 hour for temp files
      ...config
    };
    
    // Cleanup timer
    this.cleanupTimer = null;
    
    // Statistics
    this.stats = {
      totalCleanups: 0,
      filesCleaned: 0,
      spaceFreed: 0,
      lastCleanup: null,
      errors: 0
    };
    
    // Database instance
    this.database = require('../../utils/database');
  }

  start() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
    
    this.emit('cleanupServiceStarted');
  }

  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.emit('cleanupServiceStopped');
    }
  }

  async performCleanup() {
    const startTime = Date.now();
    
    try {
      const results = await Promise.allSettled([
        this.cleanupCorruptedFiles(),
        this.cleanupOrphanedFiles(),
        this.cleanupTempFiles(),
        this.cleanupDatabaseInconsistencies(),
        this.cleanupOldJobData()
      ]);
      
      // Aggregate results
      const summary = {
        corruptedFiles: results[0].status === 'fulfilled' ? results[0].value : { cleaned: 0, spaceFreed: 0 },
        orphanedFiles: results[1].status === 'fulfilled' ? results[1].value : { cleaned: 0, spaceFreed: 0 },
        tempFiles: results[2].status === 'fulfilled' ? results[2].value : { cleaned: 0, spaceFreed: 0 },
        databaseCleanup: results[3].status === 'fulfilled' ? results[3].value : { recordsCleaned: 0 },
        oldJobData: results[4].status === 'fulfilled' ? results[4].value : { recordsCleaned: 0 },
        errors: results.filter(r => r.status === 'rejected').length
      };
      
      // Calculate totals
      const totalFilesCleaned = summary.corruptedFiles.cleaned + 
                               summary.orphanedFiles.cleaned + 
                               summary.tempFiles.cleaned;
      const totalSpaceFreed = summary.corruptedFiles.spaceFreed + 
                             summary.orphanedFiles.spaceFreed + 
                             summary.tempFiles.spaceFreed;
      
      // Update stats
      this.stats.totalCleanups++;
      this.stats.filesCleaned += totalFilesCleaned;
      this.stats.spaceFreed += totalSpaceFreed;
      this.stats.lastCleanup = new Date().toISOString();
      this.stats.errors += summary.errors;
      
      const cleanupTime = Date.now() - startTime;
      
      
      this.emit('cleanupCompleted', {
        summary,
        totalFilesCleaned,
        totalSpaceFreed,
        cleanupTime,
        errors: summary.errors
      });
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      this.stats.errors++;
      this.emit('cleanupError', error);
    }
  }

  async cleanupCorruptedFiles() {
    const results = {
      cleaned: 0,
      spaceFreed: 0,
      files: []
    };
    
    try {
      const transcodedDir = path.join(__dirname, '../../../uploads/transcoded');
      
      // Check if directory exists
      try {
        await fs.access(transcodedDir);
      } catch {
        return results;
      }
      
      const files = await fs.readdir(transcodedDir);
      
      for (const file of files) {
        const filePath = path.join(transcodedDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          // Check if file is too small (likely corrupted)
          if (stats.size < this.config.corruptedFileThreshold) {
            await fs.unlink(filePath);
            results.cleaned++;
            results.spaceFreed += stats.size;
            results.files.push({ file, reason: 'too_small', size: stats.size });
            continue;
          }
          
          // Check if file is unreadable by ffprobe
          try {
            await execAsync(`ffprobe -v quiet -show_format "${filePath}"`);
          } catch (probeError) {
            await fs.unlink(filePath);
            results.cleaned++;
            results.spaceFreed += stats.size;
            results.files.push({ file, reason: 'unreadable', size: stats.size });
          }
          
        } catch (error) {
          // File might have been deleted or is inaccessible
        }
      }
      
    } catch (error) {
      console.error('❌ Corrupted file cleanup failed:', error);
      throw error;
    }
    
    return results;
  }

  async cleanupOrphanedFiles() {
    const results = {
      cleaned: 0,
      spaceFreed: 0,
      files: []
    };
    
    try {
      const transcodedDir = path.join(__dirname, '../../../uploads/transcoded');
      
      // Get all transcoded files from database
      const dbFiles = await this.database.query(
        'SELECT transcoded_path FROM transcoded_results WHERE transcoded_path IS NOT NULL'
      );
      
      const dbFilePaths = new Set(dbFiles.map(row => row.transcoded_path));
      
      // Get all files in transcoded directory
      const files = await fs.readdir(transcodedDir);
      
      for (const file of files) {
        const filePath = path.join(transcodedDir, file);
        const relativePath = path.relative(process.cwd(), filePath);
        
        // Check if file exists in database
        if (!dbFilePaths.has(relativePath)) {
          try {
            const stats = await fs.stat(filePath);
            await fs.unlink(filePath);
            results.cleaned++;
            results.spaceFreed += stats.size;
            results.files.push({ file, reason: 'orphaned', size: stats.size });
          } catch (error) {
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Orphaned file cleanup failed:', error);
      throw error;
    }
    
    return results;
  }

  async cleanupTempFiles() {
    const results = {
      cleaned: 0,
      spaceFreed: 0,
      files: []
    };
    
    try {
      const tempDir = path.join(__dirname, '../../../uploads/temp');
      const chunksDir = path.join(__dirname, '../../../uploads/chunks');
      
      const dirs = [tempDir, chunksDir];
      
      for (const dir of dirs) {
        try {
          await fs.access(dir);
        } catch {
          continue; // Directory doesn't exist
        }
        
        const files = await fs.readdir(dir);
        const cutoffTime = Date.now() - this.config.tempFileAge;
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          
          try {
            const stats = await fs.stat(filePath);
            
            // Check if file is older than threshold
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(filePath);
              results.cleaned++;
              results.spaceFreed += stats.size;
              results.files.push({ file, reason: 'old_temp', size: stats.size, age: Date.now() - stats.mtime.getTime() });
            }
          } catch (error) {
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Temp file cleanup failed:', error);
      throw error;
    }
    
    return results;
  }

  async cleanupDatabaseInconsistencies() {
    const results = {
      recordsCleaned: 0,
      inconsistencies: []
    };
    
    try {
      // Clean up transcoded_results entries where files don't exist
      const dbFiles = await this.database.query(
        'SELECT id, transcoded_path FROM transcoded_results WHERE transcoded_path IS NOT NULL'
      );
      
      for (const dbFile of dbFiles) {
        try {
          await fs.access(dbFile.transcoded_path);
        } catch {
          // File doesn't exist, remove from database
          await this.database.query(
            'DELETE FROM transcoded_results WHERE id = ?',
            [dbFile.id]
          );
          results.recordsCleaned++;
          results.inconsistencies.push({
            type: 'missing_file',
            path: dbFile.transcoded_path,
            recordId: dbFile.id
          });
        }
      }
      
      // Clean up transcoding_jobs entries that are too old
      const cutoffTime = new Date(Date.now() - this.config.maxFileAge);
      const oldJobs = await this.database.query(
        'SELECT id, input_path, created_at FROM transcoding_jobs WHERE created_at < ? AND status IN (\'completed\', \'failed\', \'cancelled\')',
        [cutoffTime.toISOString()]
      );
      
      for (const job of oldJobs) {
        await this.database.query(
          'DELETE FROM transcoding_jobs WHERE id = ?',
          [job.id]
        );
        results.recordsCleaned++;
        results.inconsistencies.push({
          type: 'old_job',
          jobId: job.id,
          inputPath: job.input_path,
          createdAt: job.created_at
        });
      }
      
    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
      throw error;
    }
    
    return results;
  }

  async cleanupOldJobData() {
    const results = {
      recordsCleaned: 0
    };
    
    try {
      // Clean up old job data from progress tracking (if available)
      // This would be handled by the ProgressTracker component
      
      // Clean up old analytics data
      const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
      const deletedAnalytics = await this.database.query(
        'DELETE FROM storage_analytics WHERE created_at < ?',
        [cutoffTime.toISOString()]
      );
      
      results.recordsCleaned += deletedAnalytics.changes || 0;
      
      if (deletedAnalytics.changes > 0) {
      }
      
    } catch (error) {
      console.error('❌ Old job data cleanup failed:', error);
      throw error;
    }
    
    return results;
  }

  async forceCleanup() {
    await this.performCleanup();
  }

  async getStorageInfo() {
    try {
      const transcodedDir = path.join(__dirname, '../../../uploads/transcoded');
      const tempDir = path.join(__dirname, '../../../uploads/temp');
      const chunksDir = path.join(__dirname, '../../../uploads/chunks');
      
      const dirs = [
        { name: 'transcoded', path: transcodedDir },
        { name: 'temp', path: tempDir },
        { name: 'chunks', path: chunksDir }
      ];
      
      const storageInfo = {};
      
      for (const dir of dirs) {
        try {
          const stats = await fs.stat(dir.path);
          const files = await fs.readdir(dir.path);
          
          let totalSize = 0;
          let fileCount = 0;
          
          for (const file of files) {
            try {
              const fileStats = await fs.stat(path.join(dir.path, file));
              totalSize += fileStats.size;
              fileCount++;
            } catch {
              // Ignore files we can't stat
            }
          }
          
          storageInfo[dir.name] = {
            exists: true,
            fileCount,
            totalSize,
            totalSizeFormatted: formatFileSize(totalSize),
            lastModified: stats.mtime
          };
        } catch {
          storageInfo[dir.name] = {
            exists: false,
            fileCount: 0,
            totalSize: 0,
            totalSizeFormatted: '0 B',
            lastModified: null
          };
        }
      }
      
      return storageInfo;
      
    } catch (error) {
      console.error('❌ Failed to get storage info:', error);
      return null;
    }
  }

  getStats() {
    return {
      ...this.stats,
      spaceFreedFormatted: formatFileSize(this.stats.spaceFreed),
      config: this.config
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  async resetStats() {
    this.stats = {
      totalCleanups: 0,
      filesCleaned: 0,
      spaceFreed: 0,
      lastCleanup: null,
      errors: 0
    };
  }
}

module.exports = CleanupService; 
