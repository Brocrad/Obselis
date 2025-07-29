const EventEmitter = require('events');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const crypto = require('crypto');
const { formatFileSize } = require('../../utils/formatters');

class Transcoder extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enableGPU: true,
      gpuDevice: 0,
      cpuThreads: 'auto',
      gpuPreset: 'p4',
      vp9Speed: 4,
      minCompressionPercent: 5,
      preventDataInflation: true,
      maxInflationPercent: 0,
      ...config
    };
    
    // Quality presets
    this.qualityPresets = this.initializeQualityPresets();
    
    // Active transcoding processes
    this.activeProcesses = new Map();
    
    // Performance tracking
    this.performanceStats = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };
  }

  initializeQualityPresets() {
    return {
      // H.265 MP4 presets
      '1080p': {
        resolution: '1920x1080',
        videoBitrate: '1200k',
        audioBitrate: '96k',
        videoCodec: 'hevc_nvenc',
        audioCodec: 'aac',
        container: 'mp4',
        suffix: '_1080p_h265',
        crf: 23,
        preset: 'p4'
      },
      '720p': {
        resolution: '1280x720',
        videoBitrate: '800k',
        audioBitrate: '80k',
        videoCodec: 'hevc_nvenc',
        audioCodec: 'aac',
        container: 'mp4',
        suffix: '_720p_h265',
        crf: 25,
        preset: 'p4'
      },
      '480p': {
        resolution: '854x480',
        videoBitrate: '600k',
        audioBitrate: '64k',
        videoCodec: 'hevc_nvenc',
        audioCodec: 'aac',
        container: 'mp4',
        suffix: '_480p_h265',
        crf: 27,
        preset: 'p4'
      },
      
      // VP9 WebM presets (for better compression)
      '1080p_vp9': {
        resolution: '1920x1080',
        videoBitrate: '1000k',
        audioBitrate: '96k',
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        container: 'webm',
        suffix: '_1080p_vp9',
        crf: 30,
        preset: 'good'
      },
      '720p_vp9': {
        resolution: '1280x720',
        videoBitrate: '700k',
        audioBitrate: '80k',
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        container: 'webm',
        suffix: '_720p_vp9',
        crf: 32,
        preset: 'good'
      }
    };
  }

  async transcodeFile(inputPath, outputPath, quality, jobId = null) {
    const startTime = Date.now();
    const preset = this.qualityPresets[quality];
    
    if (!preset) {
      throw new Error(`Unknown quality preset: ${quality}`);
    }

    try {
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Adjust output path based on container
      const fileExtension = preset.container === 'webm' ? '.webm' : '.mp4';
      const adjustedOutputPath = outputPath.replace(/\.[^.]*$/, fileExtension);
      
      // Get original file info
      const originalStats = await fs.stat(inputPath);
      const originalSize = originalStats.size;
      
      // Start transcoding process
      await this.startTranscodingProcess(inputPath, adjustedOutputPath, preset, jobId);
      
      // Validate output
      const validation = await this.validateOutput(adjustedOutputPath, originalSize, quality);
      
      // Update performance stats
      const processingTime = Date.now() - startTime;
      this.updatePerformanceStats(true, processingTime);
      
      return {
        success: true,
        outputPath: adjustedOutputPath,
        originalSize,
        outputSize: validation.outputSize,
        compressionRatio: validation.compressionRatio,
        spaceSaved: validation.spaceSaved,
        processingTime,
        quality,
        preset
      };
      
    } catch (error) {
      // Update performance stats
      const processingTime = Date.now() - startTime;
      this.updatePerformanceStats(false, processingTime);
      
      console.error(`❌ Transcoding failed: ${error.message}`);
      
      // Clean up failed output file
      try {
        await fs.unlink(outputPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  async startTranscodingProcess(inputPath, outputPath, preset, jobId) {
    return new Promise((resolve, reject) => {
      let ffmpegCommand = ffmpeg(inputPath);
      
      // Configure video codec
      if (preset.videoCodec === 'libvpx-vp9') {
        // VP9 encoding (CPU-based)
        ffmpegCommand = this.configureVP9Encoding(ffmpegCommand, preset);
      } else if (preset.videoCodec === 'hevc_nvenc') {
        // H.265 GPU encoding
        ffmpegCommand = this.configureGPUEncoding(ffmpegCommand, preset);
      } else {
        // Fallback to CPU encoding
        ffmpegCommand = this.configureCPUEncoding(ffmpegCommand, preset);
      }
      
      // Configure audio
      ffmpegCommand = ffmpegCommand
        .audioCodec(preset.audioCodec)
        .audioBitrate(preset.audioBitrate);
      
      // Set output (handle path properly for Windows)
      let normalizedOutputPath;
      if (process.platform === 'win32') {
        // On Windows, use native backslashes for absolute paths
        normalizedOutputPath = outputPath.replace(/\//g, '\\');
      } else {
        // On Unix-like systems, convert to forward slashes
        normalizedOutputPath = outputPath.replace(/\\/g, '/');
      }
      
      ffmpegCommand = ffmpegCommand
        .size(preset.resolution)
        .output(normalizedOutputPath);
      
      // Add progress tracking
      ffmpegCommand
        .on('start', (commandLine) => {
          this.emit('transcodingStarted', { jobId, quality: preset.suffix, commandLine });
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            const progressData = {
              jobId,
              quality: preset.suffix,
              progress: Math.round(progress.percent),
              fps: progress.currentFps,
              speed: progress.currentKbps,
              time: progress.timemark
            };
            
            this.emit('transcodingProgress', progressData);
          }
        })
        .on('end', () => {
          this.emit('transcodingCompleted', { jobId, quality: preset.suffix });
          resolve();
        })
        .on('error', (error) => {
          console.error(`❌ FFmpeg process failed:`, error.message);
          this.emit('transcodingError', { jobId, quality: preset.suffix, error: error.message });
          reject(error);
        });
      
      // Store process reference for cancellation
      if (jobId) {
        this.activeProcesses.set(jobId, ffmpegCommand);
      }
      
      // Start the process
      ffmpegCommand.run();
    });
  }

  configureVP9Encoding(ffmpegCommand, preset) {
    return ffmpegCommand
      .videoCodec('libvpx-vp9')
      .outputOptions([
        '-deadline good',
        `-cpu-used ${this.config.vp9Speed}`,
        '-row-mt 1',
        '-tile-columns 2',
        '-frame-parallel 1',
        '-threads 0',
        `-crf ${preset.crf}`,
        '-b:v ' + preset.videoBitrate,
        '-maxrate ' + preset.videoBitrate,
        '-bufsize ' + (parseInt(preset.videoBitrate) * 2) + 'k'
      ]);
  }

  configureGPUEncoding(ffmpegCommand, preset) {
    if (!this.config.enableGPU) {
      return this.configureCPUEncoding(ffmpegCommand, preset);
    }
    
    return ffmpegCommand
      .videoCodec('hevc_nvenc')
      .outputOptions([
        `-preset ${preset.preset}`,
        '-profile:v main',
        '-rc vbr',
        `-cq ${preset.crf}`,
        '-spatial_aq 1',
        '-temporal_aq 1',
        '-aq-mode 2',
        '-rc-lookahead 20',
        '-tag:v hvc1',
        `-gpu ${this.config.gpuDevice}`,
        '-b:v ' + preset.videoBitrate,
        '-maxrate ' + preset.videoBitrate,
        '-bufsize ' + (parseInt(preset.videoBitrate) * 1.5) + 'k'
      ]);
  }

  configureCPUEncoding(ffmpegCommand, preset) {
    return ffmpegCommand
      .videoCodec('libx265')
      .outputOptions([
        '-preset medium',
        `-crf ${preset.crf}`,
        '-x265-params bframes=8:b-adapt=2:ref=6:me=3:subme=7:merange=57:rd=6:psy-rd=2.0:aq-mode=3:aq-strength=1.0',
        '-tag:v hvc1',
        '-b:v ' + preset.videoBitrate,
        '-maxrate ' + preset.videoBitrate,
        '-bufsize ' + (parseInt(preset.videoBitrate) * 2) + 'k'
      ]);
  }

  async validateOutput(outputPath, originalSize, quality) {
    try {
      // Check if output file exists and has valid size
      const outputStats = await fs.stat(outputPath);
      const outputSize = outputStats.size;
      
      if (outputSize < 1024 * 1024) { // Less than 1MB
        throw new Error(`Output file too small: ${formatFileSize(outputSize)}`);
      }
      
      // Calculate compression metrics
      const spaceSaved = originalSize - outputSize;
      const compressionRatio = ((spaceSaved / originalSize) * 100);
      
      // Check for data inflation
      if (this.config.preventDataInflation && outputSize >= originalSize) {
        const inflationAmount = outputSize - originalSize;
        const inflationPercent = ((inflationAmount / originalSize) * 100).toFixed(1);
        
        throw new Error(`Data inflation detected: +${formatFileSize(inflationAmount)} (+${inflationPercent}%)`);
      }
      
      // Check minimum compression requirement
      if (compressionRatio < this.config.minCompressionPercent) {
        throw new Error(`Insufficient compression: ${compressionRatio.toFixed(1)}% (minimum: ${this.config.minCompressionPercent}%)`);
      }
      
      // Verify file integrity with ffprobe
      await this.verifyFileIntegrity(outputPath);
      
      return {
        outputSize,
        spaceSaved: formatFileSize(spaceSaved),
        compressionRatio: compressionRatio.toFixed(1),
        isValid: true
      };
      
    } catch (error) {
      // Clean up invalid output
      try {
        await fs.unlink(outputPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  async verifyFileIntegrity(outputPath) {
    try {
      await execAsync(`ffprobe -v quiet -show_format "${outputPath}"`);
    } catch (error) {
      throw new Error(`File integrity check failed: ${error.message}`);
    }
  }

  async cancelTranscoding(jobId) {
    const process = this.activeProcesses.get(jobId);
    if (process) {
      try {
        process.kill('SIGTERM');
        this.emit('transcodingCancelled', { jobId });
      } catch (error) {
        console.error(`❌ Failed to cancel transcoding: ${error.message}`);
      } finally {
        this.activeProcesses.delete(jobId);
      }
    }
  }

  async testGPUAvailability() {
    try {
      // Use a real video file for testing (more reliable than synthetic input)
      // Path from backend/src/services/transcoding/ to backend/uploads/media/
      const testFile = path.join(__dirname, '../../../uploads/media/Fight.Club.1999.REPACK.1080p.BluRay.x264.AAC5.1-[YTS.MX]-1750051032180-8091413a483b2333.mp4');
      
      // Check if the test file exists
      const fs = require('fs');
      if (!fs.existsSync(testFile)) {
        return false;
      }
      
      const testCommand = ffmpeg()
        .input(testFile)
        .inputOptions(['-t', '1']) // Only process 1 second for speed
        .videoCodec('hevc_nvenc')
        .outputOptions(['-f', 'null'])
        .output('-');
      
      return new Promise((resolve) => {
        testCommand
          .on('end', () => {
            resolve(true);
          })
          .on('error', (error) => {
            resolve(false);
          })
          .run();
      });
    } catch (error) {
      console.error('❌ GPU test failed:', error.message);
      return false;
    }
  }

  async getSystemInfo() {
    try {
      const [cpuInfo, gpuInfo, ffmpegVersion] = await Promise.all([
        this.getCPUInfo(),
        this.getGPUInfo(),
        this.getFFmpegVersion()
      ]);
      
      return {
        cpu: cpuInfo,
        gpu: gpuInfo,
        ffmpeg: ffmpegVersion,
        config: this.config
      };
    } catch (error) {
      console.error('❌ Failed to get system info:', error.message);
      return {
        cpu: null,
        gpu: null,
        ffmpeg: null,
        config: this.config
      };
    }
  }

  async getCPUInfo() {
    try {
      const { stdout } = await execAsync('nproc');
      const cpuCount = parseInt(stdout.trim());
      
      return {
        cores: cpuCount,
        threads: cpuCount
      };
    } catch (error) {
      return { cores: 'unknown', threads: 'unknown' };
    }
  }

  async getGPUInfo() {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
      const lines = stdout.trim().split('\n');
      const gpus = lines.map(line => {
        const [name, memory] = line.split(', ');
        return { name, memory: parseInt(memory) };
      });
      
      return {
        available: gpus.length > 0,
        count: gpus.length,
        devices: gpus
      };
    } catch (error) {
      return { available: false, count: 0, devices: [] };
    }
  }

  async getFFmpegVersion() {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const versionLine = stdout.split('\n')[0];
      const version = versionLine.match(/ffmpeg version ([^\s]+)/)?.[1] || 'unknown';
      
      return {
        version,
        available: true
      };
    } catch (error) {
      return { version: 'unknown', available: false };
    }
  }

  updatePerformanceStats(success, processingTime) {
    this.performanceStats.totalJobs++;
    this.performanceStats.totalProcessingTime += processingTime;
    
    if (success) {
      this.performanceStats.successfulJobs++;
    } else {
      this.performanceStats.failedJobs++;
    }
    
    this.performanceStats.averageProcessingTime = 
      this.performanceStats.totalProcessingTime / this.performanceStats.totalJobs;
  }

  getPerformanceStats() {
    return {
      ...this.performanceStats,
      successRate: this.performanceStats.totalJobs > 0 
        ? (this.performanceStats.successfulJobs / this.performanceStats.totalJobs * 100).toFixed(1)
        : 0,
      averageProcessingTimeFormatted: `${(this.performanceStats.averageProcessingTime / 1000).toFixed(1)}s`
    };
  }

  getQualityPresets() {
    return this.qualityPresets;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  async cleanup() {
    // Cancel all active processes
    for (const [jobId, process] of this.activeProcesses) {
      try {
        process.kill('SIGTERM');
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    this.activeProcesses.clear();
  }
}

module.exports = Transcoder; 
