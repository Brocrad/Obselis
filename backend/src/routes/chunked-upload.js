const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const router = express.Router();
const { authenticateToken, requireContentManagement } = require('../middleware/auth');
const mediaService = require('../services/mediaService');
// Remove direct import - we'll use global.transcodingService instead
const database = require('../utils/database');

// Configure multer for chunked uploads
const chunkStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/chunks');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate a temporary filename, we'll rename it later
    const tempName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    cb(null, tempName);
  }
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 1000 * 1024 * 1024, // 1GB per chunk (dramatically increased)
    fieldSize: 1000 * 1024 * 1024, // 1GB for form fields
    fields: 50, // Max number of non-file fields
    files: 10, // Max number of files
    parts: 10000, // Max number of parts (multipart)
    headerPairs: 20000 // Max number of header key-value pairs
  }
});

// Initialize chunked upload
router.post('/init', authenticateToken, requireContentManagement, async (req, res) => {
  try {
    const { filename, fileSize, totalChunks } = req.body;
    
    // Validate file type
    const allowedTypes = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ogv|ts|mts|m2ts)$/i;
    if (!allowedTypes.test(filename.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Only video files are allowed (MP4, MKV, AVI, MOV, WMV, FLV, WebM, TS, etc.)' 
      });
    }
    
    // Check file size limit (75GB)
    if (fileSize > 75 * 1024 * 1024 * 1024) {
      return res.status(400).json({ 
        error: 'File size exceeds 75GB limit' 
      });
    }
    
    // Generate unique upload ID
    const uploadId = crypto.randomBytes(16).toString('hex');
    
    // Store upload metadata
    const uploadMeta = {
      uploadId,
      filename,
      fileSize,
      totalChunks,
      uploadedChunks: [],
      userId: req.user.id,
      createdAt: new Date().toISOString()
    };
    
    // Save metadata to temporary storage (you might want to use Redis for production)
    const metaPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_meta.json`);
    await fs.writeFile(metaPath, JSON.stringify(uploadMeta, null, 2));
    
    res.json({
      success: true,
      uploadId,
      chunkSize: 1000 * 1024 * 1024, // 1GB chunks
      message: 'Chunked upload initialized'
    });
  } catch (error) {
    console.error('Chunked upload init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    console.error(`❌ File size limit exceeded: ${err.message}`);
    console.error(`📊 Request body size: ${req.get('content-length')} bytes`);
    console.error(`📊 Multer file size limit: 1GB`);
    return res.status(413).json({ 
      error: 'File chunk too large. This is likely a configuration issue.' 
    });
  }
  next(err);
};

// Upload chunk
router.post('/chunk', authenticateToken, requireContentManagement, chunkUpload.single('chunk'), handleMulterError, async (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks } = req.body;
    
    // Debug logging
    
    if (!req.file) {
      console.error(`❌ Chunk ${chunkIndex} failed: No file uploaded`);
      return res.status(400).json({ error: 'No chunk uploaded' });
    }
    
    // Load upload metadata with retry logic for race conditions
    const metaPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_meta.json`);
    let uploadMeta;
    let metaRetries = 0;
    const maxMetaRetries = 5;
    
    
    while (metaRetries < maxMetaRetries) {
      try {
        const metaData = await fs.readFile(metaPath, 'utf8');
        uploadMeta = JSON.parse(metaData);
        break;
      } catch (error) {
        metaRetries++;
        if (metaRetries >= maxMetaRetries) {
          console.error(`❌ Failed to load metadata for chunk ${chunkIndex} (uploadId: ${uploadId}) after ${maxMetaRetries} retries:`, error);
          return res.status(404).json({ error: 'Upload session not found or corrupted' });
        }
        // Wait before retry with exponential backoff and jitter
        const baseDelay = 100 * Math.pow(2, metaRetries - 1);
        const jitter = Math.random() * 50;
        const delay = baseDelay + jitter;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Verify user owns this upload
    if (uploadMeta.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Rename the temporary file to the correct chunk name
    const tempPath = req.file.path;
    const chunkPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_chunk_${chunkIndex}`);
    
    try {
      await fs.rename(tempPath, chunkPath);
    } catch (renameError) {
      console.error('Error renaming chunk file:', renameError);
      // Clean up temp file if rename fails
      try {
        await fs.unlink(tempPath);
      } catch (unlinkError) {
        console.error('Error cleaning up temp file:', unlinkError);
      }
      return res.status(500).json({ error: 'Failed to save chunk file' });
    }
    
    // Update uploaded chunks with PROPER FILE LOCKING to prevent race conditions
    const chunkNum = parseInt(chunkIndex);
    
    // Implement proper file locking using lock files
    const lockPath = metaPath + '.lock';
    let updateRetries = 0;
    const maxUpdateRetries = 15;
    let updateSuccess = false;
    
    while (updateRetries < maxUpdateRetries && !updateSuccess) {
      try {
        // Try to acquire lock (create lock file exclusively)
        let lockAcquired = false;
        let lockRetries = 0;
        const maxLockRetries = 20;
        
        while (!lockAcquired && lockRetries < maxLockRetries) {
          try {
            // Try to create lock file exclusively (fails if exists)
            await fs.writeFile(lockPath, `${chunkIndex}-${Date.now()}`, { flag: 'wx' });
            lockAcquired = true;
          } catch (lockError) {
            if (lockError.code === 'EEXIST') {
              // Lock file exists, wait and retry
              lockRetries++;
              const lockDelay = 50 + Math.random() * 100; // 50-150ms random delay
              await new Promise(resolve => setTimeout(resolve, lockDelay));
              
              // Check if lock file is stale (older than 5 seconds)
              try {
                const lockStat = await fs.stat(lockPath);
                const lockAge = Date.now() - lockStat.mtime.getTime();
                if (lockAge > 5000) { // 5 seconds
                  await fs.unlink(lockPath);
                }
              } catch (statError) {
                // Lock file might have been removed, continue
              }
            } else {
              throw lockError;
            }
          }
        }
        
        if (!lockAcquired) {
          throw new Error(`Failed to acquire lock after ${maxLockRetries} attempts`);
        }
        
        try {
          // Re-read the metadata file with lock held
          let currentMeta;
          try {
            const metaData = await fs.readFile(metaPath, 'utf8');
            currentMeta = JSON.parse(metaData);
          } catch (readError) {
            console.error(`❌ Failed to re-read metadata for chunk ${chunkIndex}:`, readError.message);
            throw readError;
          }
          
          // Check if this chunk is already recorded
          if (!currentMeta.uploadedChunks.includes(chunkNum)) {
            currentMeta.uploadedChunks.push(chunkNum);
            currentMeta.uploadedChunks.sort((a, b) => a - b);
            
            // Write atomically using a temporary file
            const tempPath = metaPath + '.tmp.' + Date.now() + '.' + Math.random().toString(36).substr(2, 9);
            await fs.writeFile(tempPath, JSON.stringify(currentMeta, null, 2));
            await fs.rename(tempPath, metaPath);
            
            uploadMeta = currentMeta; // Update our local copy
            updateSuccess = true;
          } else {
            uploadMeta = currentMeta; // Update our local copy
            updateSuccess = true;
          }
        } finally {
          // Always release the lock
          try {
            await fs.unlink(lockPath);
          } catch (unlockError) {
          }
        }
        
      } catch (updateError) {
        updateRetries++;
        if (updateRetries >= maxUpdateRetries) {
          console.error(`❌ Failed to update metadata after ${maxUpdateRetries} attempts:`, updateError.message);
          throw updateError;
        }
        // Exponential backoff with jitter
        const backoffDelay = Math.min(100 * Math.pow(2, updateRetries) + Math.random() * 200, 2000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    
    
    res.json({
      success: true,
      uploadedChunks: uploadMeta.uploadedChunks.length,
      totalChunks: parseInt(totalChunks),
      progress: (uploadMeta.uploadedChunks.length / parseInt(totalChunks)) * 100,
      message: `Chunk ${chunkIndex} uploaded successfully`
    });
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete chunked upload
router.post('/complete', authenticateToken, requireContentManagement, async (req, res) => {
  try {
    const { uploadId, title, description, category, tags, published } = req.body;
    
    // Validate category
    const validCategories = ['movie', 'tv-show'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ 
        error: 'Category is required and must be either "movie" or "tv-show"' 
      });
    }
    
    // Load upload metadata
    const metaPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_meta.json`);
    let uploadMeta;
    try {
      const metaData = await fs.readFile(metaPath, 'utf8');
      uploadMeta = JSON.parse(metaData);
    } catch (error) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    
    // Verify user owns this upload
    if (uploadMeta.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if all chunks are uploaded
    if (uploadMeta.uploadedChunks.length !== uploadMeta.totalChunks) {
      // Find missing chunks
      const expectedChunks = Array.from({length: uploadMeta.totalChunks}, (_, i) => i);
      const missingChunks = expectedChunks.filter(i => !uploadMeta.uploadedChunks.includes(i));
      
      console.error(`❌ Missing chunks for upload ${uploadId}:`);
      console.error(`   Expected: ${uploadMeta.totalChunks} chunks`);
      console.error(`   Received: ${uploadMeta.uploadedChunks.length} chunks`);
      console.error(`   Missing: [${missingChunks.join(', ')}]`);
      console.error(`   Uploaded: [${uploadMeta.uploadedChunks.join(', ')}]`);
      
      return res.status(400).json({ 
        error: `Missing chunks. Expected ${uploadMeta.totalChunks}, got ${uploadMeta.uploadedChunks.length}`,
        missing: missingChunks,
        uploaded: uploadMeta.uploadedChunks
      });
    }
    
    // Combine chunks into final file
    const finalFilename = mediaService.generateUniqueFilename(uploadMeta.filename);
    const finalPath = path.join(__dirname, '../../uploads/media', finalFilename);
    
    // Ensure media directory exists
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    
    // Combine chunks
    const writeStream = require('fs').createWriteStream(finalPath);
    
    for (let i = 0; i < uploadMeta.totalChunks; i++) {
      const chunkPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_chunk_${i}`);
      const chunkData = await fs.readFile(chunkPath);
      writeStream.write(chunkData);
      
      // Clean up chunk file
      await fs.unlink(chunkPath);
    }
    
    writeStream.end();
    
    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Create file object for mediaService
    const fileData = {
      originalname: uploadMeta.filename,
      filename: finalFilename,
      path: finalPath,
      size: uploadMeta.fileSize,
      mimetype: getMimeType(uploadMeta.filename)
    };
    
    // Save media to database and process
    const mediaResult = await mediaService.saveMedia(fileData, req.user.id);
    
    // Update with additional metadata
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
    
    // Clean up metadata file
    await fs.unlink(metaPath);
    
    // Helper function to format file size
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // AUTO-TRANSCODING DISABLED: Files will not be automatically transcoded on upload
    // You can manually transcode files from the Storage Management page
    
    // Note: To re-enable auto-transcoding, uncomment the following block:
    /*
    if (uploadMeta.fileSize > 500 * 1024 * 1024) { // 500MB threshold
      try {
        await global.transcodingService.autoTranscodeUpload(finalPath, {
          qualities: ['1080p', '720p'], // Generate multiple quality levels
          deleteOriginal: false, // Keep original for now
          priority: 'high'
        });
      } catch (transcodingError) {
        console.error('Auto-transcoding error:', transcodingError);
        // Don't fail the upload if transcoding fails
      }
    }
    */
    
    res.json({
      success: true,
      message: 'Video uploaded successfully - ready to stream',
      media: {
        ...mediaResult,
        category,
        tags: allTags
      },
      user_role: req.user.role,
      transcoding: {
        queued: false,
        message: 'Auto-transcoding disabled - use Storage Management to manually optimize files'
      }
    });
  } catch (error) {
    console.error('Complete chunked upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel chunked upload
router.delete('/cancel/:uploadId', authenticateToken, requireContentManagement, async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    // Load upload metadata
    const metaPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_meta.json`);
    let uploadMeta;
    try {
      const metaData = await fs.readFile(metaPath, 'utf8');
      uploadMeta = JSON.parse(metaData);
    } catch (error) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    
    // Verify user owns this upload
    if (uploadMeta.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Clean up chunk files
    for (let i = 0; i < uploadMeta.totalChunks; i++) {
      const chunkPath = path.join(__dirname, '../../uploads/chunks', `${uploadId}_chunk_${i}`);
      await database.insert(
        `INSERT INTO deletion_schedule \
         (file_path, file_type, media_id, scheduled_for, reason) \
         VALUES (?, ?, NULL, ?, ?)`,
        [chunkPath, 'chunk', null, new Date().toISOString(), 'chunked_upload_cancelled']
      );
    }
    // Clean up metadata file
    await database.insert(
      `INSERT INTO deletion_schedule \
       (file_path, file_type, media_id, scheduled_for, reason) \
       VALUES (?, ?, NULL, ?, ?)`,
      [metaPath, 'metadata', null, new Date().toISOString(), 'chunked_upload_cancelled']
    );
    
    res.json({
      success: true,
      message: 'Upload cancelled and cleaned up'
    });
  } catch (error) {
    console.error('Cancel chunked upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get MIME type
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',  // Enhanced WebM support for VP9+Opus
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.ogv': 'video/ogg',
    '.ts': 'video/mp4', // Changed from video/mp2t to video/mp4 for better browser compatibility
    '.mts': 'video/mp4', // Changed from video/mp2t to video/mp4 for better browser compatibility
    '.m2ts': 'video/mp4' // Changed from video/mp2t to video/mp4 for better browser compatibility
  };
  return mimeTypes[ext] || 'video/mp4';
}

module.exports = router; 
