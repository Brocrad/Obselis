const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { formatFileSize } = require('../../utils/formatters');

class FileAnalyzer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      minFileSizeMB: 100,
      minCompressionPercent: 5,
      preventDataInflation: true,
      codecErrorCache: new Set(),
      ...config
    };
    
    // Supported video formats
    this.supportedFormats = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
    
    // Codec mapping for better detection
    this.codecMap = {
      'h264': 'h264',
      'h.264': 'h264',
      'avc': 'h264',
      'h265': 'h265',
      'h.265': 'h265',
      'hevc': 'h265',
      'mpeg4': 'mpeg4',
      'xvid': 'mpeg4',
      'divx': 'mpeg4',
      'av1': 'av1',
      'vp9': 'vp9',
      'vp8': 'vp8'
    };
  }

  async analyzeFile(filePath) {
    try {
      
      // Basic file validation
      const fileInfo = await this.validateFile(filePath);
      if (!fileInfo.isValid) {
        return {
          isValid: false,
          reason: fileInfo.reason,
          filePath
        };
      }

      // Get detailed media information
      const mediaInfo = await this.getMediaInfo(filePath);
      
      // Determine if transcoding is needed
      const transcodingAnalysis = await this.analyzeTranscodingNeeds(filePath, mediaInfo);
      
      const analysis = {
        isValid: true,
        filePath,
        fileInfo,
        mediaInfo,
        transcodingAnalysis,
        analyzedAt: new Date().toISOString()
      };

      this.emit('fileAnalyzed', analysis);
      
      return analysis;
    } catch (error) {
      console.error(`❌ Analysis failed for ${path.basename(filePath)}:`, error.message);
      this.emit('analysisError', { filePath, error: error.message });
      
      return {
        isValid: false,
        reason: `Analysis failed: ${error.message}`,
        filePath
      };
    }
  }

  async validateFile(filePath) {
    try {
      // Check if file exists
      const stats = await fs.stat(filePath);
      
      // Check file size
      const minSizeBytes = this.config.minFileSizeMB * 1024 * 1024;
      if (stats.size < minSizeBytes) {
        return {
          isValid: false,
          reason: `File too small (${formatFileSize(stats.size)}, minimum: ${formatFileSize(minSizeBytes)})`,
          size: stats.size
        };
      }

      // Check file extension
      const ext = path.extname(filePath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          isValid: false,
          reason: `Unsupported format: ${ext}`,
          extension: ext
        };
      }

      return {
        isValid: true,
        size: stats.size,
        extension: ext,
        modifiedAt: stats.mtime
      };
    } catch (error) {
      return {
        isValid: false,
        reason: `File access error: ${error.message}`
      };
    }
  }

  async getMediaInfo(filePath) {
    try {
      // Get detailed media information using ffprobe
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      
      const info = JSON.parse(stdout);
      const videoStream = info.streams?.find(s => s.codec_type === 'video');
      const audioStream = info.streams?.find(s => s.codec_type === 'audio');
      
      if (!videoStream) {
        throw new Error('No video stream found');
      }

      // Extract codec information
      const videoCodec = this.normalizeCodec(videoStream.codec_name);
      const audioCodec = audioStream ? this.normalizeCodec(audioStream.codec_name) : 'unknown';
      
      // Calculate bitrate
      const totalBitrate = parseInt(info.format?.bit_rate) || 0;
      const videoBitrate = parseInt(videoStream?.bit_rate) || 0;
      const audioBitrate = audioStream ? (parseInt(audioStream?.bit_rate) || 0) : 0;
      
      const mediaInfo = {
        duration: parseFloat(info.format?.duration) || 0,
        totalBitrate,
        videoBitrate,
        audioBitrate,
        videoCodec,
        audioCodec,
        resolution: {
          width: videoStream.width || 0,
          height: videoStream.height || 0
        },
        frameRate: videoStream.r_frame_rate || 'unknown',
        container: info.format?.format_name || 'unknown',
        fileSize: parseInt(info.format?.size) || 0
      };

      
      return mediaInfo;
    } catch (error) {
      console.error(`⚠️ Failed to get media info for ${path.basename(filePath)}:`, error.message);
      return {
        duration: 0,
        totalBitrate: 0,
        videoCodec: 'unknown',
        audioCodec: 'unknown',
        resolution: { width: 0, height: 0 },
        frameRate: 'unknown',
        container: 'unknown',
        fileSize: 0,
        error: error.message
      };
    }
  }

  normalizeCodec(codecName) {
    if (!codecName) return 'unknown';
    
    const normalized = codecName.toLowerCase();
    return this.codecMap[normalized] || normalized;
  }

  async analyzeTranscodingNeeds(filePath, mediaInfo) {
    try {
      const analysis = {
        needsTranscoding: false,
        recommendedQualities: [],
        estimatedSavings: {},
        skipReasons: [],
        codecEfficiency: this.assessCodecEfficiency(mediaInfo.videoCodec)
      };

      // Skip if codec detection failed
      if (mediaInfo.videoCodec === 'unknown') {
        analysis.skipReasons.push('Codec detection failed');
        return analysis;
      }

      // Skip if already efficient codec
      if (analysis.codecEfficiency.isEfficient) {
        analysis.skipReasons.push(`Already using efficient codec: ${mediaInfo.videoCodec}`);
        return analysis;
      }

      // Check each quality level
      const qualityLevels = ['1080p', '720p', '480p'];
      
      for (const quality of qualityLevels) {
        const qualityAnalysis = await this.analyzeQualityLevel(filePath, mediaInfo, quality);
        
        if (qualityAnalysis.shouldTranscode) {
          analysis.needsTranscoding = true;
          analysis.recommendedQualities.push(quality);
          analysis.estimatedSavings[quality] = qualityAnalysis.estimatedSavings;
        } else {
          analysis.skipReasons.push(`${quality}: ${qualityAnalysis.reason}`);
        }
      }

      return analysis;
    } catch (error) {
      console.error(`❌ Transcoding analysis failed:`, error.message);
      return {
        needsTranscoding: false,
        recommendedQualities: [],
        estimatedSavings: {},
        skipReasons: [`Analysis error: ${error.message}`],
        codecEfficiency: { isEfficient: false, efficiency: 0 }
      };
    }
  }

  assessCodecEfficiency(codec) {
    const efficiencyScores = {
      'h265': { isEfficient: true, efficiency: 95, description: 'Highly efficient' },
      'hevc': { isEfficient: true, efficiency: 95, description: 'Highly efficient' },
      'av1': { isEfficient: true, efficiency: 98, description: 'Most efficient' },
      'vp9': { isEfficient: true, efficiency: 90, description: 'Very efficient' },
      'h264': { isEfficient: false, efficiency: 60, description: 'Moderate efficiency' },
      'avc': { isEfficient: false, efficiency: 60, description: 'Moderate efficiency' },
      'mpeg4': { isEfficient: false, efficiency: 30, description: 'Low efficiency' },
      'xvid': { isEfficient: false, efficiency: 25, description: 'Low efficiency' },
      'divx': { isEfficient: false, efficiency: 25, description: 'Low efficiency' }
    };

    return efficiencyScores[codec] || { isEfficient: false, efficiency: 0, description: 'Unknown codec' };
  }

  async analyzeQualityLevel(filePath, mediaInfo, quality) {
    try {
      // Check if already transcoded
      const alreadyTranscoded = await this.checkAlreadyTranscoded(filePath, quality);
      if (alreadyTranscoded) {
        return {
          shouldTranscode: false,
          reason: 'Already transcoded',
          estimatedSavings: { bytes: 0, formatted: '0 B', percentage: 0 }
        };
      }

      // Estimate compression benefits
      const estimatedSavings = await this.estimateCompressionSavings(filePath, mediaInfo, quality);
      
      // Check if savings meet minimum threshold
      const savingsPercent = (estimatedSavings.bytes / mediaInfo.fileSize) * 100;
      const meetsThreshold = savingsPercent >= this.config.minCompressionPercent;
      
      // Check for data inflation
      const wouldInflate = estimatedSavings.bytes < 0;
      
      if (wouldInflate && this.config.preventDataInflation) {
        return {
          shouldTranscode: false,
          reason: `Would increase file size by ${formatFileSize(Math.abs(estimatedSavings.bytes))}`,
          estimatedSavings
        };
      }
      
      if (!meetsThreshold) {
        return {
          shouldTranscode: false,
          reason: `Insufficient savings: ${savingsPercent.toFixed(1)}% (minimum: ${this.config.minCompressionPercent}%)`,
          estimatedSavings
        };
      }

      return {
        shouldTranscode: true,
        reason: `Estimated savings: ${estimatedSavings.formatted} (${savingsPercent.toFixed(1)}%)`,
        estimatedSavings
      };
    } catch (error) {
      return {
        shouldTranscode: false,
        reason: `Analysis error: ${error.message}`,
        estimatedSavings: { bytes: 0, formatted: '0 B', percentage: 0 }
      };
    }
  }

  async checkAlreadyTranscoded(filePath, quality) {
    try {
      // Check database for existing transcoded files
      const database = require('../../utils/database');
      
      // Use Knex query builder to avoid parameter binding issues
      if (database.databaseType === 'postgresql' && database.knex) {
        const result = await database.knex('transcoded_results')
          .select('*')
          .where('original_path', filePath)
          .where('quality', quality);
        
        if (result.length > 0) {
          const transcoded = result[0];
          
          // Verify the transcoded file still exists and is valid
          try {
            const stats = await fs.stat(transcoded.transcoded_path);
            if (stats.size > 1024 * 1024) { // At least 1MB
              return true;
            }
          } catch {
            // File doesn't exist, remove from database
            await database.knex('transcoded_results')
              .where('id', transcoded.id)
              .del();
          }
        }
        
        return false;
      }
      
      // Fallback to raw query for SQLite
      const result = await database.query(
        `SELECT * FROM transcoded_results 
         WHERE original_path = ? AND quality = ?`,
        [filePath, quality]
      );
      
      if (result.length > 0) {
        const transcoded = result[0];
        
        // Verify the transcoded file still exists and is valid
        try {
          const stats = await fs.stat(transcoded.transcoded_path);
          if (stats.size > 1024 * 1024) { // At least 1MB
            return true;
          }
        } catch {
          // File doesn't exist, remove from database
          await database.query(
            'DELETE FROM transcoded_results WHERE id = ?',
            [transcoded.id]
          );
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking transcoded status:', error);
      return false;
    }
  }

  async estimateCompressionSavings(filePath, mediaInfo, quality) {
    try {
      const originalSize = mediaInfo.fileSize;
      const originalBitrate = mediaInfo.totalBitrate;
      const duration = mediaInfo.duration;
      
      if (!originalBitrate || !duration) {
        // Fallback to basic estimation
        return this.basicCompressionEstimate(originalSize, mediaInfo.videoCodec, quality);
      }
      
      // Get target bitrate for quality level
      const targetBitrate = this.getTargetBitrate(quality);
      
      // Estimate new file size based on target bitrate
      const estimatedSize = (targetBitrate * duration) / 8; // Convert bits to bytes
      const estimatedSizeWithOverhead = estimatedSize * 1.1; // Add 10% overhead
      
      const savings = originalSize - estimatedSizeWithOverhead;
      const percentage = (savings / originalSize) * 100;
      
      return {
        bytes: Math.max(0, savings),
        formatted: formatFileSize(Math.max(0, savings)),
        percentage: Math.max(0, percentage)
      };
    } catch (error) {
      console.error('Error estimating compression savings:', error);
      return this.basicCompressionEstimate(mediaInfo.fileSize, mediaInfo.videoCodec, quality);
    }
  }

  basicCompressionEstimate(originalSize, codec, quality) {
    // Basic estimation based on codec and quality
    let compressionRatio = 0.5; // Default 50% savings
    
    // Adjust based on source codec
    if (codec === 'h264' || codec === 'avc') {
      compressionRatio = 0.6; // H.264 to H.265 typically saves 60%
    } else if (codec === 'mpeg4' || codec === 'xvid' || codec === 'divx') {
      compressionRatio = 0.7; // Older codecs save more
    } else if (codec === 'h265' || codec === 'hevc') {
      compressionRatio = 0.1; // Already efficient, minimal savings
    }
    
    // Adjust based on target quality
    if (quality === '480p') {
      compressionRatio *= 1.2; // Lower quality saves more
    } else if (quality === '720p') {
      compressionRatio *= 1.1; // Medium quality saves more
    }
    
    const savedBytes = Math.floor(originalSize * compressionRatio);
    const percentage = compressionRatio * 100;
    
    return {
      bytes: savedBytes,
      formatted: formatFileSize(savedBytes),
      percentage: Math.round(percentage)
    };
  }

  getTargetBitrate(quality) {
    const bitrates = {
      '1080p': 1200000, // 1.2 Mbps
      '720p': 800000,   // 800 kbps
      '480p': 600000    // 600 kbps
    };
    
    return bitrates[quality] || 800000;
  }

  async analyzeBatch(files) {
    
    const results = [];
    const batchSize = 5; // Process in batches to avoid overwhelming the system
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(file => this.analyzeFile(file));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            isValid: false,
            reason: `Analysis failed: ${result.reason.message}`,
            filePath: batch[j]
          });
        }
      }
      
      // Progress update
      const progress = Math.min(100, ((i + batchSize) / files.length) * 100);
      this.emit('batchProgress', { progress, completed: i + batchSize, total: files.length });
      
      // Small delay between batches
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.emit('batchComplete', results);
    
    return results;
  }

  getAnalysisSummary(analyses) {
    const summary = {
      totalFiles: analyses.length,
      validFiles: analyses.filter(a => a.isValid).length,
      needsTranscoding: 0,
      totalPotentialSavings: 0,
      recommendedJobs: [],
      codecBreakdown: {},
      qualityBreakdown: {}
    };
    
    for (const analysis of analyses) {
      if (!analysis.isValid) continue;
      
      // Count codecs
      const codec = analysis.mediaInfo.videoCodec;
      summary.codecBreakdown[codec] = (summary.codecBreakdown[codec] || 0) + 1;
      
      if (analysis.transcodingAnalysis.needsTranscoding) {
        summary.needsTranscoding++;
        
        // Calculate total potential savings
        for (const [quality, savings] of Object.entries(analysis.transcodingAnalysis.estimatedSavings)) {
          summary.totalPotentialSavings += savings.bytes;
          summary.qualityBreakdown[quality] = (summary.qualityBreakdown[quality] || 0) + 1;
        }
        
        // Create job recommendation
        summary.recommendedJobs.push({
          filePath: analysis.filePath,
          qualities: analysis.transcodingAnalysis.recommendedQualities,
          estimatedSavings: analysis.transcodingAnalysis.estimatedSavings,
          priority: this.calculateJobPriority(analysis)
        });
      }
    }
    
    summary.totalPotentialSavingsFormatted = formatFileSize(summary.totalPotentialSavings);
    
    return summary;
  }

  calculateJobPriority(analysis) {
    let priority = 0;
    
    // Higher priority for larger files
    const sizeGB = analysis.fileInfo.size / (1024 * 1024 * 1024);
    if (sizeGB > 2) priority += 3;
    else if (sizeGB > 1) priority += 2;
    else if (sizeGB > 0.5) priority += 1;
    
    // Higher priority for less efficient codecs
    const efficiency = analysis.transcodingAnalysis.codecEfficiency.efficiency;
    if (efficiency < 30) priority += 3;
    else if (efficiency < 60) priority += 2;
    else if (efficiency < 80) priority += 1;
    
    // Higher priority for better compression ratios
    const maxSavings = Math.max(...Object.values(analysis.transcodingAnalysis.estimatedSavings).map(s => s.percentage));
    if (maxSavings > 50) priority += 2;
    else if (maxSavings > 30) priority += 1;
    
    return priority;
  }

  // Compatibility method for old API
  async getFileCodec(filePath) {
    try {
      // First check if file exists and has reasonable size
      const stats = await fs.stat(filePath);
      if (stats.size < 1024 * 1024) { // At least 1MB
        return 'unknown';
      }

      // Use more comprehensive ffprobe command
      const { stdout } = await execAsync(
        `ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 "${filePath}"`
      );
      
      const parts = stdout.trim().split(',');
      const codec = parts[0]?.toLowerCase();
      const width = parts[1];
      const height = parts[2];
      
      const mappedCodec = this.codecMap[codec] || codec;
      
      if (mappedCodec && mappedCodec !== 'unknown') {
      }
      
      return mappedCodec || 'unknown';
      
    } catch (error) {
      // Only log codec detection errors once per file to reduce spam
      const fileName = path.basename(filePath);
      if (!this.config.codecErrorCache.has(fileName)) {
        this.config.codecErrorCache.add(fileName);
      }
      
      return 'unknown';
    }
  }
}

module.exports = FileAnalyzer; 
