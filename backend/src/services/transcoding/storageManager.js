const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { formatFileSize } = require('../../utils/formatters');

class StorageManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      outputDirectory: './uploads/transcoded',
      tempDirectory: './uploads/temp',
      organizeByDate: true,
      maxStorageGB: 1000, // 1TB default
      cleanupThreshold: 0.9, // 90% usage triggers cleanup
      ...config
    };
    
    // Storage analytics cache
    this.analyticsCache = null;
    this.lastAnalyticsUpdate = null;
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
  }

  async initialize() {
    try {
      // Create necessary directories
      await this.ensureDirectories();
      
      // Initialize storage analytics
      await this.updateAnalytics();
      
      this.emit('storageManagerReady');
      
    } catch (error) {
      console.error('❌ Failed to initialize Storage Manager:', error);
      throw error;
    }
  }

  async ensureDirectories() {
    const directories = [
      this.config.outputDirectory,
      this.config.tempDirectory,
      path.join(this.config.outputDirectory, '1080p'),
      path.join(this.config.outputDirectory, '720p'),
      path.join(this.config.outputDirectory, '480p'),
      path.join(this.config.outputDirectory, 'vp9')
    ];
    
    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.error(`❌ Failed to create directory ${dir}:`, error);
        }
      }
    }
  }

  async prepareOutputDirectory(inputPath) {
    try {
      const inputDir = path.dirname(inputPath);
      const relativePath = path.relative(path.resolve('./uploads/media'), inputDir);
      
      let outputDir;
      if (this.config.organizeByDate) {
        const date = new Date();
        const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        outputDir = path.join(this.config.outputDirectory, datePath);
      } else {
        outputDir = path.join(this.config.outputDirectory, relativePath);
      }
      
      await fs.mkdir(outputDir, { recursive: true });
      return outputDir;
      
    } catch (error) {
      console.error('❌ Failed to prepare output directory:', error);
      // Fallback to base output directory
      return this.config.outputDirectory;
    }
  }

  async generateOutputPath(inputPath, quality) {
    try {
      const outputDir = await this.prepareOutputDirectory(inputPath);
      const originalBaseName = path.parse(inputPath).name;
      const extension = this.getOutputExtension(quality);
      
      // Create a shorter filename to avoid Windows path length limits
      let baseName;
      if (originalBaseName.length > 60) {
        // Extract meaningful parts and add hash for uniqueness
        const movieTitle = originalBaseName.split('.')[0] || 'video';
        const hash = require('crypto').createHash('md5').update(originalBaseName).digest('hex').substring(0, 8);
        baseName = `${movieTitle.substring(0, 30)}-${hash}`;
      } else {
        baseName = originalBaseName;
      }
      
      const outputPath = path.join(outputDir, `${baseName}_${quality}${extension}`);
      
      // Ensure unique filename
      return await this.ensureUniqueFilename(outputPath);
      
    } catch (error) {
      console.error('❌ Failed to generate output path:', error);
      throw error;
    }
  }

  getOutputExtension(quality) {
    if (quality.includes('vp9')) {
      return '.webm';
    }
    return '.mp4';
  }

  async ensureUniqueFilename(filePath) {
    let counter = 1;
    let uniquePath = filePath;
    
    while (await this.fileExists(uniquePath)) {
      const ext = path.extname(filePath);
      const base = filePath.slice(0, -ext.length);
      uniquePath = `${base}_${counter}${ext}`;
      counter++;
    }
    
    return uniquePath;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async moveFile(sourcePath, destinationPath) {
    try {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.rename(sourcePath, destinationPath);
      
      this.emit('fileMoved', { sourcePath, destinationPath });
      
      return destinationPath;
    } catch (error) {
      console.error('❌ Failed to move file:', error);
      throw error;
    }
  }

  async copyFile(sourcePath, destinationPath) {
    try {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
      
      this.emit('fileCopied', { sourcePath, destinationPath });
      
      return destinationPath;
    } catch (error) {
      console.error('❌ Failed to copy file:', error);
      throw error;
    }
  }

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      this.emit('fileDeleted', { filePath });
      
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true;
      }
      console.error('❌ Failed to delete file:', error);
      throw error;
    }
  }

  async calculateFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        formatted: formatFileSize(stats.size),
        modifiedAt: stats.mtime
      };
    } catch (error) {
      console.error('❌ Failed to calculate file size:', error);
      return { size: 0, formatted: '0 B', modifiedAt: null };
    }
  }

  async calculateDirectorySize(directoryPath) {
    try {
      let totalSize = 0;
      let fileCount = 0;
      
      const processDirectory = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await processDirectory(fullPath);
          } else if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              totalSize += stats.size;
              fileCount++;
            } catch (error) {
              // Could not stat file
            }
          }
        }
      };
      
      await processDirectory(directoryPath);
      
      return {
        size: totalSize,
        formatted: formatFileSize(totalSize),
        fileCount
      };
    } catch (error) {
      console.error('❌ Failed to calculate directory size:', error);
      return { size: 0, formatted: '0 B', fileCount: 0 };
    }
  }

  async updateAnalytics() {
    try {
      const now = Date.now();
      
      // Check if cache is still valid
      if (this.analyticsCache && this.lastAnalyticsUpdate && 
          (now - this.lastAnalyticsUpdate) < this.cacheExpiry) {
        return this.analyticsCache;
      }
      
      
      // Calculate storage metrics
      const outputDirSize = await this.calculateDirectorySize(this.config.outputDirectory);
      const tempDirSize = await this.calculateDirectorySize(this.config.tempDirectory);
      
      // Get transcoded files from database
      const database = require('../../utils/database');
      const transcodedFiles = await database.query(
        'SELECT * FROM transcoded_results'
      );
      
      let totalOriginalSize = 0;
      let totalTranscodedSize = 0;
      let totalSpaceSaved = 0;
      let activeFiles = 0;
      
      // Verify files still exist and calculate real stats
      for (const file of transcodedFiles) {
        try {
          const stats = await fs.stat(file.transcoded_path);
          if (stats.size > 1024) { // Only count files larger than 1KB
            totalOriginalSize += file.original_size;
            totalTranscodedSize += file.transcoded_size;
            totalSpaceSaved += (file.original_size - file.transcoded_size);
            activeFiles++;
          }
        } catch (statError) {
          // File missing, will be cleaned up later
          continue;
        }
      }
      
      const compressionRatio = totalOriginalSize > 0 
        ? ((totalSpaceSaved / totalOriginalSize) * 100).toFixed(1)
        : 0;
      
      // Calculate storage usage
      const totalStorageUsed = outputDirSize.size + tempDirSize.size;
      const storageUsagePercent = (totalStorageUsed / (this.config.maxStorageGB * 1024 * 1024 * 1024)) * 100;
      
      const analytics = {
        totalFiles: activeFiles,
        totalOriginalSize,
        totalTranscodedSize,
        totalSpaceSaved,
        compressionRatio: `${compressionRatio}%`,
        storageUsage: {
          used: totalStorageUsed,
          usedFormatted: formatFileSize(totalStorageUsed),
          max: this.config.maxStorageGB * 1024 * 1024 * 1024,
          maxFormatted: formatFileSize(this.config.maxStorageGB * 1024 * 1024 * 1024),
          percent: storageUsagePercent.toFixed(1)
        },
        directories: {
          output: outputDirSize,
          temp: tempDirSize
        },
        lastUpdated: new Date().toISOString(),
        formattedStats: {
          totalOriginalSize: formatFileSize(totalOriginalSize),
          totalTranscodedSize: formatFileSize(totalTranscodedSize),
          totalSpaceSaved: formatFileSize(totalSpaceSaved)
        }
      };
      
      // Cache the analytics
      this.analyticsCache = analytics;
      this.lastAnalyticsUpdate = now;
      
      // Store in database for persistence
      await this.storeAnalyticsInDatabase(analytics);
      
      this.emit('analyticsUpdated', analytics);
      
      return analytics;
      
    } catch (error) {
      console.error('❌ Failed to update storage analytics:', error);
      return null;
    }
  }

  async storeAnalyticsInDatabase(analytics) {
    try {
      const database = require('../../utils/database');
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15); // Cache for 15 minutes
      
      await database.knex('storage_analytics')
        .insert({
          metric_name: 'storage_stats',
          metric_value: JSON.stringify(analytics),
          expires_at: expiresAt.toISOString()
        })
        .onConflict('metric_name')
        .merge(['metric_value', 'expires_at']);
    } catch (error) {
      console.error('❌ Failed to store analytics in database:', error);
    }
  }

  async getAnalytics() {
    try {
      // Try to get from cache first
      if (this.analyticsCache && this.lastAnalyticsUpdate) {
        const now = Date.now();
        if ((now - this.lastAnalyticsUpdate) < this.cacheExpiry) {
          return this.analyticsCache;
        }
      }
      
      // Try to get from database
      const database = require('../../utils/database');
      const result = await database.query(
        `SELECT metric_value FROM storage_analytics 
         WHERE metric_name = 'storage_stats' 
         AND (expires_at IS NULL OR expires_at > NOW())`
      );
      
      if (result.length > 0) {
        const analytics = JSON.parse(result[0].metric_value);
        this.analyticsCache = analytics;
        this.lastAnalyticsUpdate = Date.now();
        return analytics;
      }
      
      // Calculate fresh analytics
      return await this.updateAnalytics();
      
    } catch (error) {
      console.error('❌ Failed to get analytics:', error);
      return null;
    }
  }

  async getStorageInfo() {
    try {
      const [outputInfo, tempInfo, analytics] = await Promise.all([
        this.calculateDirectorySize(this.config.outputDirectory),
        this.calculateDirectorySize(this.config.tempDirectory),
        this.getAnalytics()
      ]);
      
      return {
        outputDirectory: {
          path: this.config.outputDirectory,
          size: outputInfo,
          exists: await this.fileExists(this.config.outputDirectory)
        },
        tempDirectory: {
          path: this.config.tempDirectory,
          size: tempInfo,
          exists: await this.fileExists(this.config.tempDirectory)
        },
        analytics,
        config: {
          maxStorageGB: this.config.maxStorageGB,
          organizeByDate: this.config.organizeByDate,
          cleanupThreshold: this.config.cleanupThreshold
        }
      };
    } catch (error) {
      console.error('❌ Failed to get storage info:', error);
      return null;
    }
  }

  async checkStorageSpace() {
    try {
      const analytics = await this.getAnalytics();
      if (!analytics) return { needsCleanup: false, reason: 'Analytics unavailable' };
      
      const usagePercent = parseFloat(analytics.storageUsage.percent);
      const needsCleanup = usagePercent > (this.config.cleanupThreshold * 100);
      
      return {
        needsCleanup,
        usagePercent,
        threshold: this.config.cleanupThreshold * 100,
        reason: needsCleanup 
          ? `Storage usage (${usagePercent.toFixed(1)}%) exceeds threshold (${(this.config.cleanupThreshold * 100).toFixed(1)}%)`
          : 'Storage usage within acceptable limits'
      };
    } catch (error) {
      console.error('❌ Failed to check storage space:', error);
      return { needsCleanup: false, reason: 'Check failed' };
    }
  }

  async cleanupTempFiles() {
    try {
      const tempFiles = await this.scanDirectory(this.config.tempDirectory);
      let cleanedCount = 0;
      let cleanedSize = 0;
      
      for (const file of tempFiles) {
        try {
          const stats = await fs.stat(file);
          const age = Date.now() - stats.mtime.getTime();
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (age > maxAge) {
            await fs.unlink(file);
            cleanedCount++;
            cleanedSize += stats.size;
          }
        } catch (error) {
          // Could not clean up temp file
        }
      }
      
      this.emit('tempCleanupCompleted', { cleanedCount, cleanedSize });
      
      return { cleanedCount, cleanedSize };
    } catch (error) {
      console.error('❌ Failed to cleanup temp files:', error);
      throw error;
    }
  }

  async scanDirectory(directoryPath) {
    try {
      const files = [];
      
      const scanRecursive = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanRecursive(fullPath);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      };
      
      await scanRecursive(directoryPath);
      return files;
    } catch (error) {
      console.error('❌ Failed to scan directory:', error);
      return [];
    }
  }

  async cleanup() {
    try {
      // Clean up temp files
      await this.cleanupTempFiles();
      
      // Update analytics
      await this.updateAnalytics();
      
      this.emit('cleanupCompleted');
      
    } catch (error) {
      console.error('❌ Storage Manager cleanup failed:', error);
      throw error;
    }
  }

  // Compatibility methods for old API
  async getDirectoryFiles(directoryPath) {
    try {
      const files = await fs.readdir(directoryPath);
      return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
      });
    } catch (error) {
      console.error('❌ Failed to get directory files:', error);
      return [];
    }
  }

  async getCompressionStats(forceRefresh = false) {
    try {
      const analytics = await this.getAnalytics();
      
      return {
        totalOriginalSize: analytics.totalOriginalSize || 0,
        totalTranscodedSize: analytics.totalTranscodedSize || 0,
        filesProcessed: analytics.filesProcessed || 0,
        spaceSaved: analytics.spaceSaved || 0,
        compressionRatio: analytics.compressionRatio || '0%',
        formattedStats: {
          totalOriginalSize: formatFileSize(analytics.totalOriginalSize || 0),
          totalTranscodedSize: formatFileSize(analytics.totalTranscodedSize || 0),
          spaceSaved: formatFileSize(analytics.spaceSaved || 0)
        }
      };
    } catch (error) {
      console.error('❌ Failed to get compression stats:', error);
      return {
        totalOriginalSize: 0,
        totalTranscodedSize: 0,
        filesProcessed: 0,
        spaceSaved: 0,
        compressionRatio: '0%',
        formattedStats: {
          totalOriginalSize: '0 B',
          totalTranscodedSize: '0 B',
          spaceSaved: '0 B'
        }
      };
    }
  }

  async getCachedStorageAnalytics() {
    try {
      if (this.analyticsCache && this.lastAnalyticsUpdate) {
        const now = Date.now();
        if (now - this.lastAnalyticsUpdate < this.cacheExpiry) {
          return this.analyticsCache;
        }
      }
      
      // Update cache if expired or missing
      await this.updateAnalytics();
      return this.analyticsCache;
      
    } catch (error) {
      console.error('❌ Failed to get cached analytics:', error);
      return null;
    }
  }

  async updateStorageAnalytics() {
    return this.updateAnalytics();
  }

  async clearAnalyticsCache() {
    this.analyticsCache = null;
    this.lastAnalyticsUpdate = null;
  }
}

module.exports = StorageManager; 
