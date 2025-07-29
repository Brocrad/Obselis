const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const database = require('../utils/database');
const path = require('path');
const fs = require('fs').promises;
const mediaDir = path.join(__dirname, '../../uploads/media');
const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
const ffmpeg = require('fluent-ffmpeg');
const crypto = require('crypto');

// Rate limit store reference (we'll need to access the rate limiter's store)
let rateLimitStore = null;

// Function to set the rate limit store (called from server.js)
const setRateLimitStore = (store) => {
  rateLimitStore = store;
};

// Get rate limit store from app locals
const getRateLimitStore = (req) => {
  return req.app.locals.rateLimitStore || rateLimitStore;
};

// Function to reset a user's rate limit
const resetUserRateLimit = (userId, req) => {
  const store = getRateLimitStore(req);
  if (!store) {
    return false;
  }
  
  
  try {
    // Reset all rate limit keys for this user
    const userKeys = [
      `user_${userId}`,
      `user_${userId}_streaming`,
      `user_${userId}_auth`,
      `user_${userId}_email`
    ];
    
    let resetCount = 0;
    
    // Try different methods to reset the rate limit
    if (store.delete && typeof store.delete === 'function') {
      // Method 1: Direct delete method
      userKeys.forEach(key => {
        try {
          if (store.delete(key)) {
            resetCount++;
          }
        } catch (err) {
        }
      });
    } else if (store.set && typeof store.set === 'function') {
      // Method 2: Reset by setting to 0
      userKeys.forEach(key => {
        try {
          store.set(key, 0);
          resetCount++;
        } catch (err) {
        }
      });
    } else if (store.resetKey && typeof store.resetKey === 'function') {
      // Method 3: resetKey method
      userKeys.forEach(key => {
        try {
          store.resetKey(key);
          resetCount++;
        } catch (err) {
        }
      });
    } else {
      // As a fallback, try to reset the entire store if possible
      if (store.reset && typeof store.reset === 'function') {
        store.reset();
        resetCount = userKeys.length; // Assume success
      }
    }
    
    return resetCount > 0;
  } catch (error) {
    console.error('🔧 Error resetting rate limit:', error);
    return false;
  }
};

// Helper to extract resolution using ffprobe
async function getResolution(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(null);
      try {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream) {
          return resolve(`${videoStream.width}x${videoStream.height}`);
        }
      } catch {}
      resolve(null);
    });
  });
}
// Helper to calculate SHA-256 hash
async function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => resolve(null));
  });
}
// Helper to normalize filename (strip year, release group, etc.)
function normalizeFilename(filename) {
  return filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/\d{4}/g, '') // Remove year
    .replace(/\b(720p|1080p|2160p|4k|hd|bluray|webrip|web-dl|dvdrip|x264|x265|hevc|aac|ac3|dts|yify|yts|rarbg|[a-f0-9]{8,})\b/gi, '') // Remove common tags
    .replace(/[-_.]/g, ' ') // Replace separators
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim()
    .toLowerCase();
}

// Utility function to clean up empty directories recursively
async function cleanupEmptyDirectories(dirPath) {
  try {
    // Don't delete protected directories
    const protectedDirs = [
      path.join(__dirname, '../../uploads'),
      path.join(__dirname, '../../uploads/media'), 
      path.join(__dirname, '../../uploads/transcoded'),
      path.join(__dirname, '../../uploads/temp'),
      path.join(__dirname, '../../uploads/thumbnails')
    ];
    
    const normalizedDirPath = path.resolve(dirPath);
    if (protectedDirs.some(protectedDir => normalizedDirPath === path.resolve(protectedDir))) {
      return; // Don't delete protected directories
    }
    
    // Check if directory exists
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) return;
    } catch (e) {
      return; // Directory doesn't exist
    }
    
    // Read directory contents
    const files = await fs.readdir(dirPath);
    
    // If directory is empty, delete it and check parent
    if (files.length === 0) {
      await fs.rmdir(dirPath);
      
      // Recursively check parent directory
      const parentDir = path.dirname(dirPath);
      if (parentDir !== dirPath) { // Prevent infinite recursion
        await cleanupEmptyDirectories(parentDir);
      }
    }
  } catch (error) {
    // Silently ignore errors (directory might not be empty or already deleted)
  }
}

// Enhanced normalize for transcoded files - more aggressive to group similar content
function normalizeTranscodedFilename(filename) {
  return filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/-\d{13}-[a-f0-9]{16}/g, '') // Remove timestamp-hash patterns like "-1753091007404-8bbcd4700bf9532c"
    .replace(/_\d+p_h265$/g, '') // Remove transcoding suffixes like "_1080p_h265"
    .replace(/\d{4}/g, '') // Remove year
    .replace(/\b(720p|1080p|2160p|4k|hd|bluray|webrip|web-dl|dvdrip|x264|x265|hevc|aac|ac3|dts|yify|yts|rarbg|[a-f0-9]{8,})\b/gi, '') // Remove common tags
    .replace(/\b(audio[\s_]*fixed?|repack|proper|internal|limited)\b/gi, '') // Remove fix/repack indicators
    .replace(/[-_.]/g, ' ') // Replace separators
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim()
    .toLowerCase();
}

// Utility function to clean up empty directories recursively
async function cleanupEmptyDirectories(dirPath) {
  try {
    // Don't delete protected directories
    const protectedDirs = [
      path.join(__dirname, '../../uploads'),
      path.join(__dirname, '../../uploads/media'), 
      path.join(__dirname, '../../uploads/transcoded'),
      path.join(__dirname, '../../uploads/temp'),
      path.join(__dirname, '../../uploads/thumbnails')
    ];
    
    const normalizedDirPath = path.resolve(dirPath);
    if (protectedDirs.some(protectedDir => normalizedDirPath === path.resolve(protectedDir))) {
      return; // Don't delete protected directories
    }
    
    // Check if directory exists
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) return;
    } catch (e) {
      return; // Directory doesn't exist
    }
    
    // Read directory contents
    const files = await fs.readdir(dirPath);
    
    // If directory is empty, delete it and check parent
    if (files.length === 0) {
      await fs.rmdir(dirPath);
      
      // Recursively check parent directory
      const parentDir = path.dirname(dirPath);
      if (parentDir !== dirPath) { // Prevent infinite recursion
        await cleanupEmptyDirectories(parentDir);
      }
    }
  } catch (error) {
    // Silently ignore errors (directory might not be empty or already deleted)
  }
}

// POST /api/admin/invites
router.post('/invites', (req, res) => {
  res.json({ message: 'Generate invite endpoint - to be implemented' });
});

// GET /api/admin/invites
router.get('/invites', (req, res) => {
  res.json({ message: 'List invites endpoint - to be implemented' });
});

// DELETE /api/admin/invites/:token
router.delete('/invites/:token', (req, res) => {
  res.json({ message: 'Revoke invite endpoint - to be implemented' });
});

// GET /api/admin/users
router.get('/users', (req, res) => {
  res.json({ message: 'List users endpoint - to be implemented' });
});

// PUT /api/admin/users/:userId/status
router.put('/users/:userId/status', (req, res) => {
  res.json({ message: 'User status endpoint - to be implemented' });
});

// POST /api/admin/users/:userId/reset-rate-limit
router.post('/users/:userId/reset-rate-limit', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user exists
    const user = await database.query('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Reset the user's rate limit
    const success = resetUserRateLimit(userId, req);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Rate limit reset for user ${user[0].username}`,
        userId: userId,
        username: user[0].username
      });
    } else {
      res.status(500).json({ error: 'Failed to reset rate limit' });
    }
  } catch (error) {
    console.error('Error resetting user rate limit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  res.json({ message: 'System stats endpoint - to be implemented' });
});

// GET /api/admin/logs
router.get('/logs', (req, res) => {
  res.json({ message: 'System logs endpoint - to be implemented' });
});

// POST /api/admin/media/scan
router.post('/media/scan', (req, res) => {
  res.json({ message: 'Media scan endpoint - to be implemented' });
});

// Diagnostic endpoint to check database vs filesystem sync
router.get('/diagnostic/protection-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    
    // Get all media entries from database
    const media = await database.query(`
      SELECT id, title, original_filename, file_path, file_size, upload_date, resolution 
      FROM media_content 
      ORDER BY title, upload_date
    `);
    
    
    // Scan filesystem
    const mediaDir = path.join(__dirname, '../../uploads/media');
    const files = await fs.readdir(mediaDir);
    
    const results = {
      database: [],
      filesystem: [],
      matches: [],
      mismatches: []
    };
    
    // Process database entries
    for (const m of media) {
      const dbEntry = {
        id: m.id,
        title: m.title,
        original_filename: m.original_filename,
        file_path: m.file_path,
        file_exists: false,
        normalized: null,
        hash: null,
        resolution: m.resolution
      };
      
      // Check if file exists
      try {
        await fs.access(m.file_path);
        dbEntry.file_exists = true;
        
        // Calculate normalized name and hash for comparison using actual filename
        const actualFilename = m.filename || path.basename(m.file_path);
        dbEntry.normalized = normalizeFilename(actualFilename);
        try {
          dbEntry.hash = await getFileHash(m.file_path);
        } catch (hashError) {
        }
      } catch (e) {
      }
      
      results.database.push(dbEntry);
    }
    
    // Process filesystem files
    for (const file of files) {
      const filePath = path.join(mediaDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) continue;
        
        const fsEntry = {
          filename: file,
          file_path: filePath,
          size: stats.size,
          normalized: normalizeFilename(file),
          hash: await getFileHash(filePath),
          resolution: await getResolution(filePath),
          in_database: false
        };
        
        // Check if this file matches any database entry
        const dbMatch = results.database.find(db => 
          db.file_exists && 
          db.normalized === fsEntry.normalized && 
          db.hash === fsEntry.hash &&
          db.resolution === fsEntry.resolution
        );
        
        if (dbMatch) {
          fsEntry.in_database = true;
          fsEntry.db_id = dbMatch.id;
          results.matches.push({
            filesystem: fsEntry,
            database: dbMatch,
            protection_key: `${fsEntry.normalized}|${fsEntry.resolution}|${fsEntry.hash}`
          });
        } else {
          results.mismatches.push(fsEntry);
        }
        
        results.filesystem.push(fsEntry);
        
      } catch (e) {
        console.error(`Error processing file ${file}:`, e.message);
      }
    }
    
    // Summary
    const summary = {
      total_db_entries: media.length,
      total_fs_files: files.length,
      db_files_exist: results.database.filter(d => d.file_exists).length,
      db_files_missing: results.database.filter(d => !d.file_exists).length,
      fs_files_in_db: results.filesystem.filter(f => f.in_database).length,
      fs_files_orphaned: results.filesystem.filter(f => !f.in_database).length,
      perfect_matches: results.matches.length,
      mismatches: results.mismatches.length
    };
    
    
    res.json({
      success: true,
      summary,
      details: {
        database_entries: results.database,
        filesystem_files: results.filesystem,
        matches: results.matches,
        mismatches: results.mismatches
      },
      recommendations: summary.fs_files_orphaned > 0 ? [
        `${summary.fs_files_orphaned} files exist on filesystem but not in database`,
        'Consider using the recovery endpoint to restore missing entries',
        'Or use the cleanup endpoint to remove orphaned files'
      ] : [
        'All files are properly synchronized between database and filesystem'
      ]
    });
    
  } catch (error) {
    console.error('Protection diagnostic error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Simple test endpoint
router.get('/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Admin test endpoint working',
      user: req.user.username,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze and cleanup duplicate media entries
router.all('/cleanup/analyze-duplicates', authenticateToken, requireAdmin, async (req, res) => {
  // Set no-cache headers to prevent caching
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  const isSSE = (req.headers.accept && req.headers.accept.includes('text/event-stream')) || req.query.token;
  function sendProgress(percent, status) {
    if (isSSE) {
      res.write(`event: progress\ndata: ${JSON.stringify({ percent, status })}\n\n`);
    }
  }
  function sendComplete(result) {
    if (isSSE) {
      res.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    }
  }
  if (isSSE) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }
  try {
    sendProgress(5, 'Querying database...');
    // Get all media content (excluding soft-deleted entries)
    // Start with basic query and progressively add soft delete filters if columns exist
    let media = await database.query(`
      SELECT id, title, original_filename, file_path, file_size, upload_date, resolution 
      FROM media_content 
      ORDER BY title, upload_date
    `);
    sendProgress(15, `Found ${media.length} media files. Querying transcoded files...`);
    // Get all transcoded files
    const transcoded = await database.query(`
      SELECT original_path, transcoded_path, quality 
      FROM transcoded_results 
      ORDER BY original_path, quality
    `);
    sendProgress(25, `Found ${transcoded.length} transcoded files. Analyzing duplicates...`);
    // Find titles with multiple entries (duplicates)
    const titleGroups = {};
    media.forEach(m => {
      // More intelligent title normalization
      const baseTitle = m.title
        .toLowerCase()
        .replace(/[._-]/g, ' ')        // Replace dots, underscores, dashes with spaces
        .replace(/\s+/g, ' ')          // Collapse multiple spaces
        .replace(/[^\w\s]/g, '')       // Remove special chars but keep letters, numbers, spaces
        .trim();                       // Remove leading/trailing spaces
      
      if (!titleGroups[baseTitle]) titleGroups[baseTitle] = [];
      titleGroups[baseTitle].push(m);
    });
    const duplicates = [];
    Object.keys(titleGroups).forEach(baseTitle => {
      const group = titleGroups[baseTitle];
      if (group.length > 1) {
        group.forEach((item, i) => {
        });
        
        const sorted = group.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
        duplicates.push({
          title: sorted[0].title,
          keep: sorted[0],
          delete: sorted.slice(1)
        });
        
        sorted.slice(1).forEach((item, i) => {
        });
      }
    });
    sendProgress(35, `Found ${duplicates.length} duplicate groups. Analyzing orphaned files...`);
    // Analyze orphaned transcoded files (now flag soft-deleted entries)
    const mediaFilePaths = new Set(media.map(m => m.file_path));
    const orphanedTranscodedCandidates = transcoded.filter(t => !mediaFilePaths.has(t.original_path));
    const orphanedTranscoded = [];
    for (const t of orphanedTranscodedCandidates) {
      // Check if the transcoded file actually exists on disk
      try {
        await fs.access(t.transcoded_path);
        orphanedTranscoded.push({
          ...t,
          softDeleted: false // All entries in transcoded_results are active
        });
      } catch (e) {
        // File doesn't exist on disk, skip it (likely already deleted)
      }
    }
    sendProgress(45, `Found ${orphanedTranscoded.length} orphaned transcoded files. Scanning media files...`);
    // Build protected files set
    const protectedFiles = new Set();
    const protectedInfo = {};
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      try {
        // Use the actual filename (not original_filename) for protection matching
        const actualFilename = m.filename || path.basename(m.file_path);
        const normName = normalizeFilename(actualFilename);
        const resolution = m.resolution || null;
        let hash = null;
        try {
          hash = await getFileHash(m.file_path);
        } catch (hashError) {
        }
        const key = `${normName}|${resolution}|${hash}`;
        protectedFiles.add(key);
        protectedInfo[key] = {
          id: m.id,
          title: m.title,
          filename: actualFilename,
          file_path: m.file_path,
          resolution,
          hash
        };
        if (i % 10 === 0) {
        }
      } catch (mediaError) {
        console.error(`[Analyze] Error processing media ${m.original_filename}:`, mediaError);
      }
    }
    sendProgress(55, 'Scanning uploads/media for duplicates...');
    // Scan uploads/media for context-aware duplicates
    const fsDuplicateCandidates = {};
    let fileCount = 0;
    let files = [];
    try {
      files = await fs.readdir(mediaDir);
    } catch (e) {
      console.error('Error scanning uploads/media:', e);
      files = []; // Ensure files is an array even if readdir fails
    }
    for (const [i, file] of files.entries()) {
      const filePath = path.join(mediaDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) continue;
        if (filePath.includes('/transcoded/') || filePath.includes('\\transcoded\\')) continue;
        
        const normName = normalizeFilename(file);
        const resolution = await getResolution(filePath);
        const hash = await getFileHash(filePath);
        const key = `${normName}|${resolution}|${hash}`;
        
        
        sendProgress(60 + Math.floor((i / files.length) * 20), `Processing file ${i + 1} of ${files.length}: ${file}`);
        
        if (protectedFiles.has(key)) {
          continue;
        }
        
        const groupKey = `${normName}|${resolution}`;
        if (!fsDuplicateCandidates[groupKey]) fsDuplicateCandidates[groupKey] = [];
        fsDuplicateCandidates[groupKey].push({ file, filePath, size: stats.size, mtime: stats.mtime, hash, resolution });
        
      } catch (fsError) {
        console.error(`[Analyze] Error processing file ${file}:`, fsError.message);
      }
    }
    sendProgress(85, 'Grouping and analyzing duplicates...');
    // For each group, if there is a protected file with same normName and resolution, and group has >0 files, flag as duplicates
    const fsContextDuplicates = [];
    
    Object.keys(fsDuplicateCandidates).forEach(groupKey => {
      const [normName, resolution] = groupKey.split('|');
      const group = fsDuplicateCandidates[groupKey];
      
      const protectedMatch = Object.keys(protectedInfo).find(k => k.startsWith(`${normName}|${resolution}|`));
      if (protectedMatch) {
        fsContextDuplicates.push({
          groupKey: `${protectedInfo[protectedMatch].filename} (${resolution})`,
          protected: protectedInfo[protectedMatch],
          keep: protectedInfo[protectedMatch],
          delete: fsDuplicateCandidates[groupKey]
        });
      } else {
        // Even if no protected match, if there are multiple files with same norm name/resolution, they're duplicates
        if (group.length > 1) {
          const sorted = group.sort((a, b) => b.mtime - a.mtime);
          fsContextDuplicates.push({
            groupKey: `${normName} (${resolution})`,
            keep: sorted[0],
            delete: sorted.slice(1)
          });
        } else {
        }
      }
    });
    sendProgress(95, 'Finalizing report...');
    // Build a set of all referenced files from the DB
    const referencedFiles = new Set();
    media.forEach(m => referencedFiles.add(path.normalize(m.file_path)));
    transcoded.forEach(t => referencedFiles.add(path.normalize(t.transcoded_path)));

    // Scan both uploads/media and uploads/transcoded
    const allFiles = [];
    for (const dir of [mediaDir, transcodedDir]) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) continue;
            const normName = normalizeFilename(file);
            const resolution = await getResolution(filePath);
            allFiles.push({ file, filePath: path.normalize(filePath), normName, resolution, mtime: stats.mtime, size: stats.size });
          } catch {}
        }
      } catch {}
    }
    // Orphan detection: files not referenced by DB
    const orphans = allFiles.filter(f => !referencedFiles.has(f.filePath));
    // Duplicate grouping: group by normName|resolution
    const duplicateGroups = {};
    allFiles.forEach(f => {
      const key = `${f.normName}|${f.resolution}`;
      if (!duplicateGroups[key]) duplicateGroups[key] = [];
      duplicateGroups[key].push(f);
    });
    const duplicateResults = [];
    Object.values(duplicateGroups).forEach(group => {
      if (group.length > 1) {
        // Sort by mtime (newest first), keep newest, mark rest as duplicates
        const sorted = group.sort((a, b) => b.mtime - a.mtime);
        duplicateResults.push({
          groupKey: `${sorted[0].normName} (${sorted[0].resolution})`,
          keep: sorted[0],
          delete: sorted.slice(1),
          all: sorted
        });
        
        // Also add to fsContextDuplicates for consistency
        fsContextDuplicates.push({
          groupKey: `${sorted[0].normName} (${sorted[0].resolution})`,
          keep: sorted[0],
          delete: sorted.slice(1),
          all: sorted
        });
      }
    });
    // --- BEGIN: Transcoded Directory Scan ---
    sendProgress(56, 'Scanning uploads/transcoded for duplicates...');
    const transcodedDuplicateCandidates = {};
    let transcodedFiles = [];
    let transcodedFilesFiltered = []; // Only actual files, not directories
    try {
      transcodedFiles = await fs.readdir(transcodedDir);
    } catch (e) {
      console.error('Error scanning uploads/transcoded:', e);
      transcodedFiles = [];
    }
    for (const [i, file] of transcodedFiles.entries()) {
      const filePath = path.join(transcodedDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) continue;
        
        // Add to filtered list of actual files
        transcodedFilesFiltered.push(file);
        
        const normName = normalizeTranscodedFilename(file);
        let resolution = await getResolution(filePath);
        // Fallback: extract resolution from filename for transcoded files
        if (!resolution) {
          const resMatch = file.match(/_(\d+p)_/);
          if (resMatch) {
            const p = resMatch[1];
            // Common resolution mappings
            const resMap = { '720p': '1280x720', '1080p': '1920x1080', '1440p': '2560x1440', '2160p': '3840x2160' };
            resolution = resMap[p] || p;
          }
        }
        const hash = await getFileHash(filePath);
        const key = `${normName}|${resolution}|${hash}`;
        const groupKey = `${normName}|${resolution}`;
        if (!transcodedDuplicateCandidates[groupKey]) transcodedDuplicateCandidates[groupKey] = [];
        transcodedDuplicateCandidates[groupKey].push({ file, filePath, size: stats.size, mtime: stats.mtime, hash, resolution });
      } catch (fsError) {
        console.error(`[Analyze] Error processing transcoded file ${file}:`, fsError.message);
      }
    }
    // Group and log transcoded duplicates
    const transcodedFsDuplicates = [];
    Object.keys(transcodedDuplicateCandidates).forEach(groupKey => {
      const group = transcodedDuplicateCandidates[groupKey];
      if (group.length > 1) {
        // Sort by mtime (newest first), keep newest, mark rest as duplicates
        const sorted = group.sort((a, b) => b.mtime - a.mtime);
        transcodedFsDuplicates.push({
          groupKey: groupKey,
          keep: sorted[0],
          delete: sorted.slice(1),
          all: sorted
        });
        sorted.slice(1).forEach((item, i) => {
        });
      }
    });
    // Orphan detection for transcoded files (only process actual files, not directories)
    const transcodedOrphans = transcodedFilesFiltered
      .map(file => path.join(transcodedDir, file))
      .filter(filePath => !referencedFiles.has(path.normalize(filePath)));
    if (transcodedOrphans.length > 0) {
    }
    
    // Identify empty directories for cleanup (separate from orphaned files)
    const emptyDirectories = [];
    for (const item of transcodedFiles) {
      const itemPath = path.join(transcodedDir, item);
      try {
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
          // Check if directory is empty
          const dirContents = await fs.readdir(itemPath);
          if (dirContents.length === 0) {
            emptyDirectories.push(itemPath);
          }
        }
      } catch (e) {
        // Ignore errors for items that can't be accessed
      }
    }
    
    // --- END: Transcoded Directory Scan ---
    const result = {
      success: true,
      analysis: {
        totalMedia: media.length,
        totalTranscoded: transcoded.length,
        activeTranscoded: transcoded.length, // All entries in transcoded_results are active
        duplicateGroupsCount: duplicates.length,
        totalDuplicatesToDelete: duplicates.reduce((sum, group) => sum + group.delete.length, 0),
        orphanedTranscoded: orphanedTranscoded.length,
        fsDuplicateGroups: fsContextDuplicates.length,
        fsDuplicateFiles: fsContextDuplicates.reduce((sum, group) => sum + group.delete.length, 0),
        orphans: orphans,
              fsDuplicateGroups_detailed: duplicateResults,
      transcodedFsDuplicateGroups: transcodedFsDuplicates.length,
      transcodedFsDuplicateFiles: transcodedFsDuplicates.reduce((sum, group) => sum + group.delete.length, 0),
      transcodedOrphans: transcodedOrphans,
      // Add orphaned files to total duplicate count
      totalOrphanedFiles: transcodedOrphans.length,
        totalAllDuplicates: duplicates.reduce((sum, group) => sum + group.delete.length, 0) + 
                           fsContextDuplicates.reduce((sum, group) => sum + group.delete.length, 0) + 
                           transcodedFsDuplicates.reduce((sum, group) => sum + group.delete.length, 0) + 
                           transcodedOrphans.length,
      },
      duplicates: duplicates.map(group => ({
        title: group.title,
        keep: {
          id: group.keep.id,
          filename: group.keep.original_filename,
          size: group.keep.file_size,
          createdAt: group.keep.upload_date
        },
        delete: group.delete.map(item => ({
          id: item.id,
          filename: item.original_filename,
          size: item.file_size,
          createdAt: item.upload_date
        }))
      })),
      orphanedTranscoded: orphanedTranscoded.map(t => ({
        originalPath: t.original_path,
        transcodedPath: t.transcoded_path,
                      quality: t.quality,
                    active: true, // All entries in transcoded_results are active
        softDeleted: t.softDeleted
      })),
      fsDuplicates: fsContextDuplicates,
      transcodedFsDuplicates,
      transcodedOrphans,
      emptyDirectories, // Empty directories for separate cleanup
    };
    
    sendComplete(result);
    if (!isSSE) {
      res.json(result);
    }
  } catch (error) {
    console.error('Analyze duplicates error:', error);
    console.error('Stack trace:', error.stack);
    const errorMessage = error.message || 'Unknown error occurred';
    if (isSSE) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage, stack: error.stack })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: errorMessage, stack: error.stack });
    }
  }
});

// Execute duplicate cleanup
router.post('/cleanup/remove-duplicates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { confirmed } = req.body;
    
    if (!confirmed) {
      return res.status(400).json({ 
        error: 'Must confirm deletion by setting confirmed: true' 
      });
    }
    
    
    // Get duplicates (same logic as analyze)
    const media = await database.query(`
      SELECT id, title, original_filename, file_path, file_size, upload_date 
      FROM media_content 
      ORDER BY title, upload_date
    `);
    
    const titleGroups = {};
    media.forEach(m => {
      const baseTitle = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!titleGroups[baseTitle]) titleGroups[baseTitle] = [];
      titleGroups[baseTitle].push(m);
    });
    
    const duplicates = [];
    Object.keys(titleGroups).forEach(baseTitle => {
      const group = titleGroups[baseTitle];
      if (group.length > 1) {
        const sorted = group.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
        duplicates.push({
          keep: sorted[0],
          delete: sorted.slice(1)
        });
      }
    });
    
    // Execute cleanup using comprehensive cleanup method
    const mediaService = require('../services/mediaService');
    let deletedCount = 0;
    let errorCount = 0;
    let totalSpaceCleaned = 0;
    const deletedItems = [];
    
    for (const group of duplicates) {
      for (const item of group.delete) {
        try {
          
          const result = await mediaService.comprehensiveCleanup(item.id, req.user.role);
          
          deletedCount++;
          totalSpaceCleaned += result.spaceCleaned || 0;
          deletedItems.push({
            id: item.id,
            filename: item.original_filename,
            sizeCleaned: result.spaceCleaned || 0
          });
          
          
        } catch (error) {
          console.error(`   ❌ Error deleting ID:${item.id}: ${error.message}`);
          errorCount++;
        }
      }
    }
    
    // After deleting database duplicates, scan for orphaned transcoded files and fs duplicates
    const transcodedFilesToDelete = [];
    const fsFilesToDelete = [];

    // Re-run the analysis logic to get current orphans and fs duplicates
    const currentMedia = await database.query(`SELECT file_path FROM media_content`);
    const mediaFilePaths = new Set(currentMedia.map(m => m.file_path));
    const currentTranscoded = await database.query(`
      SELECT original_path, transcoded_path, quality 
      FROM transcoded_results 
      ORDER BY original_path, quality
    `);
    const orphanedTranscoded = currentTranscoded.filter(t => !mediaFilePaths.has(t.original_path));

    // Add orphaned transcoded files to delete list
    for (const t of orphanedTranscoded) {
      transcodedFilesToDelete.push(t.transcoded_path);
      // Mark as inactive in DB
      await database.update(
                  'DELETE FROM transcoded_results WHERE transcoded_path = ?',
        [t.transcoded_path]
      );
    }

    // Scan uploads/media for fs duplicates
    const fsDuplicateGroupsByRes = {};
    try {
      const files = await fs.readdir(mediaDir);
      for (const file of files) {
        const filePath = path.join(mediaDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (!stats.isFile()) continue;
          const normName = normalizeFilename(file);
          const resolution = await getResolution(filePath);
          const hash = await getFileHash(filePath);
          const key = `${normName}|${resolution}`;
          if (!fsDuplicateGroupsByRes[key]) fsDuplicateGroupsByRes[key] = [];
          fsDuplicateGroupsByRes[key].push({ file, filePath, size: stats.size, mtime: stats.mtime, hash, resolution });
        } catch {}
      }
    } catch (e) {
      console.error('Error scanning uploads/media:', e);
    }
    // For each group, if >1 file and hashes differ, mark as duplicates
    const fsDuplicates = [];
    Object.values(fsDuplicateGroupsByRes).forEach(group => {
      if (group.length > 1) {
        // Group by hash
        const hashMap = {};
        group.forEach(f => {
          if (!hashMap[f.hash]) hashMap[f.hash] = [];
          hashMap[f.hash].push(f);
        });
        if (Object.keys(hashMap).length > 1) {
          // Sort by mtime (newest first), keep newest, mark rest as duplicates
          const sorted = group.sort((a, b) => b.mtime - a.mtime);
          fsDuplicates.push({
            groupKey: `${group[0].file} (${group[0].resolution})`,
            keep: sorted[0],
            delete: sorted.slice(1)
          });
        }
      }
    });
    for (const group of fsDuplicates) {
      // Keep the newest (by mtime), delete the rest
      const sorted = await Promise.all(group.map(async f => {
        const stats = await fs.stat(f.filePath);
        return { ...f, mtime: stats.mtime };
      }));
      sorted.sort((a, b) => b.mtime - a.mtime);
      for (let i = 1; i < sorted.length; i++) {
        fsFilesToDelete.push(sorted[i].filePath);
      }
    }

    // Delete orphaned transcoded files
    for (const filePath of transcodedFilesToDelete) {
      try {
        await fs.unlink(filePath);
      } catch (e) {
        // Ignore if already deleted
      }
    }
    
    // Delete fs duplicate files and clean up empty directories
    const directoriesProcessed = new Set();
    for (const filePath of fsFilesToDelete) {
      try {
        await fs.unlink(filePath);
        
        // Add parent directory to cleanup list
        const parentDir = path.dirname(filePath);
        directoriesProcessed.add(parentDir);
      } catch (e) {
        console.error(`❌ Failed to delete ${filePath}: ${e.message}`);
      }
    }
    
    // Clean up empty directories
    for (const dirPath of directoriesProcessed) {
      await cleanupEmptyDirectories(dirPath);
    }
    
    res.json({
      success: true,
      message: 'Duplicate cleanup completed',
      results: {
        duplicatesDeleted: deletedCount,
        errors: errorCount,
        totalSpaceCleaned: totalSpaceCleaned,
        orphanedTranscodedCleaned: transcodedFilesToDelete.length,
        deletedItems,
        deletedOrphanedTranscoded: transcodedFilesToDelete.length,
        deletedFsDuplicates: fsFilesToDelete.length,
        directoriesProcessed: directoriesProcessed.size
      }
    });
    
    
  } catch (error) {
    console.error('Execute cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/cleanup/delete-orphaned-transcoded', authenticateToken, requireAdmin, async (req, res) => {
  const { transcodedPath, hardDelete } = req.body;
  if (!transcodedPath) {
    return res.status(400).json({ success: false, error: 'transcodedPath is required' });
  }
  try {
    // Decode HTML entities (&#x5C; becomes \)
    const decodedPath = transcodedPath
      .replace(/&#x5C;/g, '\\')
      .replace(/&#x2F;/g, '/')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    
    const basename = path.basename(decodedPath);
    const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
    
    // Handle both full paths and just filenames
    let filePath;
    if (path.isAbsolute(decodedPath) && decodedPath.includes('transcoded')) {
      // If it's already a full path to transcoded directory, use it directly
      filePath = decodedPath;
    } else {
      // If it's just a filename, join with transcoded directory
      filePath = path.join(transcodedDir, basename);
    }
    
    // Log directory contents
    try {
      const filesInDir = await fs.readdir(transcodedDir);
    } catch (e) {
    }
    // Check if file exists before deleting
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch (e) {
      fileExists = false;
    }
    // Check for DB entry with matching basename using Knex query builder
    let dbEntries = [];
    let dbEntryExists = false;
    
    try {
      if (database.databaseType === 'postgresql' && database.knex) {
        dbEntries = await database.knex('transcoded_results')
          .select('*')
          .where('transcoded_path', 'like', `%${basename}%`);
      } else {
        // Fallback for SQLite
        dbEntries = await database.query(
          'SELECT * FROM transcoded_results WHERE transcoded_path LIKE ?',
          [`%${basename}`]
        );
      }
      dbEntryExists = dbEntries && dbEntries.length > 0;
    } catch (dbError) {
      dbEntryExists = false;
    }
    
    // If DB entry exists, delete it
    if (dbEntryExists) {
      try {
        if (database.databaseType === 'postgresql' && database.knex) {
          await database.knex('transcoded_results')
            .where('transcoded_path', 'like', `%${basename}%`)
            .del();
        } else {
          // Fallback for SQLite
          await database.query(
            'DELETE FROM transcoded_results WHERE transcoded_path LIKE ?',
            [`%${basename}`]
          );
        }
      } catch (deleteError) {
      }
    }
    if (fileExists) {
      try {
        // Check if it's a directory or file
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          // Handle directory deletion
          await fs.rm(filePath, { recursive: true });
          return res.json({ success: true, deleted: filePath, dbEntry: dbEntryExists, hardDelete: !!hardDelete, message: `Directory deleted and DB entry ${hardDelete ? 'deleted' : 'marked inactive'}.` });
        } else {
          // Handle file deletion
          await fs.unlink(filePath);
          return res.json({ success: true, deleted: filePath, dbEntry: dbEntryExists, hardDelete: !!hardDelete, message: `File deleted and DB entry ${hardDelete ? 'deleted' : 'marked inactive'}.` });
        }
      } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to delete file/directory', details: e.message });
      }
    } else if (dbEntryExists) {
      return res.json({ success: true, deleted: null, dbEntry: true, hardDelete: !!hardDelete, message: `File not found, but DB entry ${hardDelete ? 'deleted' : 'marked inactive'}.` });
    } else {
      return res.json({ success: true, deleted: null, dbEntry: false, message: 'File and DB entry not found (already cleaned up).' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk delete all orphaned transcoded files
router.post('/cleanup/delete-all-orphaned-transcoded', authenticateToken, requireAdmin, async (req, res) => {
  const { hardDelete, orphanedFiles } = req.body;
  try {
    
    // Use orphaned files from request body if provided, otherwise scan for them
    let filesToDelete = [];
    
    if (orphanedFiles && orphanedFiles.length > 0) {
      // Use the orphaned files passed from the frontend
      filesToDelete = orphanedFiles;
    } else {
      // Fallback: scan the transcoded directory for orphaned files
      const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
      
      try {
        const transcodedFiles = await fs.readdir(transcodedDir);
        
        // Check each file to see if it has a database entry
        for (const file of transcodedFiles) {
          const filePath = path.join(transcodedDir, file);
          
          try {
            // Check if this file has a database entry
            let dbEntry = [];
            
            if (database.databaseType === 'postgresql' && database.knex) {
              dbEntry = await database.knex('transcoded_results')
                .select('*')
                .where('transcoded_path', 'like', `%${file}%`);
            } else {
              dbEntry = await database.query(
                'SELECT * FROM transcoded_results WHERE transcoded_path LIKE ?',
                [`%${file}`]
              );
            }
            
            if (dbEntry.length === 0) {
              // This is an orphaned file
              filesToDelete.push({ transcodedPath: filePath });
            }
          } catch (dbError) {
          }
        }
      } catch (scanError) {
      }
    }
    
    
    if (filesToDelete.length === 0) {
      return res.json({ 
        success: true, 
        deleted: 0, 
        errors: 0, 
        message: 'No orphaned files found to delete' 
      });
    }
    
    let deletedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Delete each orphaned file
    for (const file of filesToDelete) {
      try {
        const transcodedPath = file.transcodedPath;
        
        // Decode HTML entities
        const decodedPath = transcodedPath
          .replace(/&#x5C;/g, '\\')
          .replace(/&#x2F;/g, '/')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        
        const basename = path.basename(decodedPath);
        const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
        
        // Handle both full paths and just filenames
        let filePath;
        if (path.isAbsolute(decodedPath) && decodedPath.includes('transcoded')) {
          filePath = decodedPath;
        } else {
          filePath = path.join(transcodedDir, basename);
        }
        
        // Check if file exists
        let fileExists = false;
        try {
          await fs.access(filePath);
          fileExists = true;
        } catch (e) {
          fileExists = false;
        }
        
        // Check for DB entry using Knex query builder
        let dbEntries = [];
        let dbEntryExists = false;
        
        try {
          if (database.databaseType === 'postgresql' && database.knex) {
            dbEntries = await database.knex('transcoded_results')
              .select('*')
              .where('transcoded_path', 'like', `%${basename}%`);
          } else {
            // Fallback for SQLite
            dbEntries = await database.query(
              'SELECT * FROM transcoded_results WHERE transcoded_path LIKE ?',
              [`%${basename}`]
            );
          }
          dbEntryExists = dbEntries && dbEntries.length > 0;
        } catch (dbError) {
          dbEntryExists = false;
        }
        
        // Handle DB entry deletion
        if (dbEntryExists) {
          try {
            if (database.databaseType === 'postgresql' && database.knex) {
              await database.knex('transcoded_results')
                .where('transcoded_path', 'like', `%${basename}%`)
                .del();
            } else {
              // Fallback for SQLite
              await database.query(
                'DELETE FROM transcoded_results WHERE transcoded_path LIKE ?',
                [`%${basename}`]
              );
            }
          } catch (deleteError) {
          }
        }
        
        // Handle file deletion
        if (fileExists) {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            await fs.rm(filePath, { recursive: true });
          } else {
            await fs.unlink(filePath);
          }
        }
        
        deletedCount++;
        
      } catch (error) {
        errorCount++;
        errors.push({ file: file.transcodedPath, error: error.message });
        console.error(`[Bulk Orphaned Delete] Error deleting ${file.transcodedPath}:`, error.message);
      }
    }
    
    
    return res.json({
      success: true,
      deleted: deletedCount,
      errors: errorCount,
      totalFiles: orphanedFiles.length,
      errorDetails: errors,
      message: `Bulk deletion completed: ${deletedCount} files deleted, ${errorCount} errors`
    });
    
  } catch (error) {
    console.error('[Bulk Orphaned Delete] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete media file from uploads/media directory
router.post('/cleanup/delete-media-file', authenticateToken, requireAdmin, async (req, res) => {
  const { filePath, hardDelete } = req.body;
  if (!filePath) {
    return res.status(400).json({ success: false, error: 'filePath is required' });
  }
  try {
    const basename = path.basename(filePath);
    const mediaDir = path.join(__dirname, '../../uploads/media');
    const fullFilePath = path.join(mediaDir, basename);
    
    // Log directory contents for debugging
    try {
      const filesInDir = await fs.readdir(mediaDir);
    } catch (e) {
    }
    
    // Check if file exists before deleting
    let fileExists = false;
    try {
      await fs.access(fullFilePath);
      fileExists = true;
    } catch (e) {
      fileExists = false;
    }
    
    // Check for DB entry with matching file path
    const dbEntries = await database.query(
      'SELECT * FROM media_content WHERE file_path LIKE ? OR original_filename LIKE ?',
      [`%${basename}`, `%${basename}`]
    );
    const dbEntryExists = dbEntries && dbEntries.length > 0;
    
    // CRITICAL FIX: NEVER delete database entries for referenced files
    // This endpoint should only delete orphaned files (files without DB references)
    if (dbEntryExists) {
      return res.json({ 
        success: false, 
        error: 'Cannot delete file - it is currently referenced in the media library',
        protected: true,
        dbEntries: dbEntries.length
      });
    }
    
    // Only delete orphaned files (files that exist but have no database reference)
    if (fileExists) {
      try {
        await fs.unlink(fullFilePath);
        return res.json({ 
          success: true, 
          deleted: fullFilePath, 
          dbEntry: false, 
          orphaned: true,
          message: `Orphaned media file deleted successfully (no database reference found).` 
        });
      } catch (e) {
        console.error(`[Media Delete] Failed to delete file: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Failed to delete file', details: e.message });
      }
    } else {
      return res.json({ 
        success: false, 
        deleted: null, 
        dbEntry: false, 
        message: 'File not found on disk (already cleaned up).' 
      });
    }
  } catch (error) {
    console.error('[Media Delete] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete duplicate media entry with soft delete support
router.post('/cleanup/delete-duplicate-media', authenticateToken, requireAdmin, async (req, res) => {
  const { filename, mediaId, softDelete = false } = req.body;
  
  if (!filename && !mediaId) {
    return res.status(400).json({ success: false, error: 'Either filename or mediaId is required' });
  }
  
  try {
    
    // Check if this is a transcoded file (contains quality indicators)
    const isTranscodedFile = filename && (filename.includes('_1080p_h265') || filename.includes('_720p_h265') || filename.includes('_480p_h265'));
    
    if (isTranscodedFile) {
      
      // Use the orphaned transcoded deletion logic for transcoded files
      const basename = path.basename(filename);
      const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
      const filePath = path.join(transcodedDir, basename);
      
      // Check if file exists before deleting
      let fileExists = false;
      try {
        await fs.access(filePath);
        fileExists = true;
      } catch (e) {
        fileExists = false;
      }
      
      // Check for DB entry with matching basename using Knex query builder
      let dbEntries = [];
      let dbEntryExists = false;
      
      try {
        if (database.databaseType === 'postgresql' && database.knex) {
          dbEntries = await database.knex('transcoded_results')
            .select('*')
            .where('transcoded_path', 'like', `%${basename}%`);
        } else {
          // Fallback for SQLite
          dbEntries = await database.query(
            'SELECT * FROM transcoded_results WHERE transcoded_path LIKE ?',
            [`%${basename}`]
          );
        }
        dbEntryExists = dbEntries && dbEntries.length > 0;
      } catch (dbError) {
        dbEntryExists = false;
      }
      
      // Handle transcoded file deletion
      if (dbEntryExists) {
        try {
          if (database.databaseType === 'postgresql' && database.knex) {
            await database.knex('transcoded_results')
              .where('transcoded_path', 'like', `%${basename}%`)
              .del();
          } else {
            // Fallback for SQLite
            await database.query(
              'DELETE FROM transcoded_results WHERE transcoded_path LIKE ?',
              [`%${basename}`]
            );
          }
        } catch (deleteError) {
        }
      }
      
      if (fileExists) {
        try {
          await fs.unlink(filePath);
          
          return res.json({ 
            success: true, 
            deleted: filePath, 
            dbEntry: dbEntryExists, 
            hardDelete: !softDelete,
            isTranscoded: true,
            message: `Transcoded file ${softDelete ? 'soft' : 'hard'} deleted successfully.` 
          });
        } catch (e) {
          return res.status(500).json({ success: false, error: 'Failed to delete transcoded file', details: e.message });
        }
      } else if (dbEntryExists) {
        return res.json({ 
          success: true, 
          deleted: null, 
          dbEntry: true, 
          hardDelete: !softDelete,
          isTranscoded: true,
          message: `Transcoded file DB entry ${softDelete ? 'soft' : 'hard'} deleted (file not found on disk).` 
        });
      } else {
        return res.status(404).json({ 
          success: false, 
          error: 'Transcoded file not found in database or filesystem',
          isTranscoded: true
        });
      }
    } else {
      // Original media file deletion logic
      let mediaEntry;
      if (mediaId) {
        const results = await database.query('SELECT * FROM media_content WHERE id = ?', [mediaId]);
        mediaEntry = results[0];
      } else {
        const results = await database.query(
          'SELECT * FROM media_content WHERE original_filename = ? OR file_path LIKE ?',
          [filename, `%${filename}`]
        );
        mediaEntry = results[0];
      }
      
      if (!mediaEntry) {
        return res.status(404).json({ 
          success: false, 
          error: 'Media entry not found',
          isTranscoded: false
        });
      }
      
      if (softDelete) {
        // Soft delete: Add a 'deleted_at' timestamp or 'is_deleted' flag
        // Check if the table has a 'deleted_at' column, if not add 'is_deleted' flag
        try {
          await database.update(
            'UPDATE media_content SET deleted_at = ? WHERE id = ?',
            [new Date().toISOString(), mediaEntry.id]
          );
        } catch (error) {
          // If deleted_at column doesn't exist, try is_deleted flag
          try {
            await database.update(
              'UPDATE media_content SET is_deleted = 1 WHERE id = ?',
              [mediaEntry.id]
            );
          } catch (error2) {
            // If neither column exists, create a soft delete record in a separate table
            try {
              await database.insert(
                'INSERT INTO soft_deleted_media (media_id, original_filename, deleted_at, deleted_by) VALUES (?, ?, ?, ?)',
                [mediaEntry.id, mediaEntry.original_filename, new Date().toISOString(), req.user.id]
              );
            } catch (error3) {
              // Create the soft delete table if it doesn't exist
              await database.query(`
                CREATE TABLE IF NOT EXISTS soft_deleted_media (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  media_id INTEGER,
                  original_filename TEXT,
                  deleted_at TEXT,
                  deleted_by INTEGER,
                  FOREIGN KEY (media_id) REFERENCES media_content(id),
                  FOREIGN KEY (deleted_by) REFERENCES users(id)
                )
              `);
              
              await database.insert(
                'INSERT INTO soft_deleted_media (media_id, original_filename, deleted_at, deleted_by) VALUES (?, ?, ?, ?)',
                [mediaEntry.id, mediaEntry.original_filename, new Date().toISOString(), req.user.id]
              );
            }
          }
        }
        
        // Also soft delete associated transcoded files
        await database.update(
          'DELETE FROM transcoded_results WHERE original_path = ?',
          [mediaEntry.file_path]
        );
        
        
        return res.json({
          success: true,
          message: 'Media soft deleted successfully',
          mediaId: mediaEntry.id,
          filename: mediaEntry.original_filename,
          softDeleted: true,
          isTranscoded: false
        });
        
      } else {
        // Hard delete: Use comprehensive cleanup
        const mediaService = require('../services/mediaService');
        const result = await mediaService.comprehensiveCleanup(mediaEntry.id, req.user.role);
        
        
        return res.json({
          success: true,
          message: 'Media permanently deleted successfully',
          mediaId: mediaEntry.id,
          filename: mediaEntry.original_filename,
          spaceCleaned: result.spaceCleaned || 0,
          softDeleted: false,
          isTranscoded: false
        });
      }
    }
    
  } catch (error) {
    console.error('[Duplicate Delete] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Recovery endpoint to restore missing media entries
router.post('/recovery/restore-missing-media', authenticateToken, requireAdmin, async (req, res) => {
  try {
    
    const results = {
      found: [],
      restored: [],
      errors: []
    };
    
    // Check transcoded_results table for orphaned entries (transcoded files with no matching media_content)
    const transcodedFiles = await database.query(`
      SELECT DISTINCT t.original_path, t.transcoded_path
      FROM transcoded_results t
      LEFT JOIN media_content m ON t.original_path = m.file_path
      WHERE m.file_path IS NULL
      ORDER BY t.original_path
    `);
    
    
    // ALSO scan the transcoded directory for files that exist but have no database entries
    const transcodedDir = path.join(__dirname, '../../uploads/transcoded');
    let filesystemOrphans = [];
    
    try {
      const transcodedFilesOnDisk = await fs.readdir(transcodedDir);
      
      for (const file of transcodedFilesOnDisk) {
        const filePath = path.join(transcodedDir, file);
        
        // Check if this file has a database entry using Knex query builder
        let dbEntry = [];
        
        try {
          if (database.databaseType === 'postgresql' && database.knex) {
            dbEntry = await database.knex('transcoded_results')
              .select('*')
              .where('transcoded_path', 'like', `%${file}%`);
          } else {
            // Fallback for SQLite
            dbEntry = await database.query(
              'SELECT * FROM transcoded_results WHERE transcoded_path LIKE ?',
              [`%${file}`]
            );
          }
        } catch (dbError) {
          dbEntry = [];
        }
        
        if (dbEntry.length === 0) {
          // This is an orphaned transcoded file - try to reconstruct the original path
          
          // Extract original filename from transcoded filename
          // Pattern: OriginalName-timestamp-hash_quality_codec.ext
          let originalName = file.replace(/_\d+p_(h264|h265|vp9|av1)\.(mp4|mkv|webm)$/i, '');
          
          // Try to find the original file in uploads/media
          const mediaDir = path.join(__dirname, '../../uploads/media');
          try {
            const mediaFiles = await fs.readdir(mediaDir);
            const matchingOriginal = mediaFiles.find(mediaFile => {
              const mediaBase = mediaFile.replace(/\.[^/.]+$/, ''); // Remove extension
              return originalName.startsWith(mediaBase) || mediaBase.startsWith(originalName);
            });
            
            if (matchingOriginal) {
              const originalPath = path.join(mediaDir, matchingOriginal);
              filesystemOrphans.push({
                original_path: originalPath,
                transcoded_path: filePath
              });
            } else {
            }
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
    
    
    // Combine database orphans and filesystem orphans
    const allOrphans = [...transcodedFiles, ...filesystemOrphans];
    
    for (const t of allOrphans) {
      results.found.push(t.original_path);
      
      try {
        // Check if original file still exists
        await fs.access(t.original_path);
        
        const filename = path.basename(t.original_path);
        const stats = await fs.stat(t.original_path);
        
        // Extract title from filename (remove timestamp and hash)
        let title = filename.replace(/\.[^/.]+$/, ''); // Remove extension
        title = title.replace(/-\d{13}-[a-f0-9]{16}$/, ''); // Remove timestamp-hash
        title = title.replace(/[._]/g, ' '); // Replace dots/underscores with spaces
        title = title.replace(/\s+/g, ' ').trim(); // Clean up spaces
        
        // Determine category (basic heuristic)
        const category = filename.toLowerCase().includes('s1e') || filename.toLowerCase().includes('season') ? 'tv' : 'movie';
        
        // Create media_content entry
        const result = await database.insert(`
          INSERT INTO media_content 
          (title, original_filename, file_path, file_size, upload_date, category, published, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          title,
          filename,
          t.original_path,
          stats.size,
          new Date().toISOString(),
          category,
          true,
          req.user.id
        ]);
        
        results.restored.push({
          id: result.lastID,
          title: title,
          filename: filename,
          size: stats.size,
          category: category
        });
        
        
      } catch (fileError) {
        results.errors.push({
          path: t.original_path,
          error: 'Original file not found on disk'
        });
      }
    }
    
    res.json({
      success: true,
      message: `Recovery completed: ${results.restored.length} entries restored, ${results.errors.length} errors`,
      results: results
    });
    
    
  } catch (error) {
    console.error('Recovery error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-fix protection synchronization issues
router.post('/diagnostic/fix-protection', authenticateToken, requireAdmin, async (req, res) => {
  try {
    
    // Get all media entries from database
    const media = await database.query(`
      SELECT id, title, original_filename, filename, file_path, file_size, upload_date, resolution 
      FROM media_content 
      ORDER BY title, upload_date
    `);
    
    
    // Scan filesystem
    const mediaDir = path.join(__dirname, '../../uploads/media');
    const files = await fs.readdir(mediaDir);
    
    const results = {
      fixed: 0,
      errors: 0,
      details: []
    };
    
    // For each database entry, try to find and sync with filesystem
    for (const dbEntry of media) {
      try {
        let matchingFile = null;
        let syncNeeded = false;
        
        // Strategy 1: Try exact filename match (generated filename)
        if (dbEntry.filename) {
          const exactMatch = files.find(f => f === dbEntry.filename);
          if (exactMatch) {
            matchingFile = exactMatch;
          }
        }
        
        // Strategy 2: Try file_path basename match
        if (!matchingFile && dbEntry.file_path) {
          const basename = path.basename(dbEntry.file_path);
          const pathMatch = files.find(f => f === basename);
          if (pathMatch) {
            matchingFile = pathMatch;
          }
        }
        
        // Strategy 3: Try original_filename similarity match (fallback)
        if (!matchingFile && dbEntry.original_filename) {
          // Look for files that might be the same content but with different names
          const origNorm = normalizeFilename(dbEntry.original_filename);
          const similarFile = files.find(f => {
            const fileNorm = normalizeFilename(f);
            // Check if normalized names are similar or if file contains key parts of original
            return fileNorm === origNorm || 
                   (origNorm.length > 10 && fileNorm.includes(origNorm.substring(0, 10))) ||
                   (fileNorm.length > 10 && origNorm.includes(fileNorm.substring(0, 10)));
          });
          if (similarFile) {
            matchingFile = similarFile;
            syncNeeded = true;
          }
        }
        
        if (matchingFile) {
          const filePath = path.join(mediaDir, matchingFile);
          const stats = await fs.stat(filePath);
          
          // Get current file metadata
          const currentResolution = await getResolution(filePath);
          const currentHash = await getFileHash(filePath);
          
          // Check what needs to be updated
          const updates = {};
          const updateFields = [];
          const updateParams = [];
          
          // Update filename if it doesn't match
          if (dbEntry.filename !== matchingFile) {
            updates.filename = matchingFile;
            updateFields.push('filename = ?');
            updateParams.push(matchingFile);
            syncNeeded = true;
          }
          
          // Update file_path if it doesn't match
          const correctPath = filePath;
          if (dbEntry.file_path !== correctPath) {
            updates.file_path = correctPath;
            updateFields.push('file_path = ?');
            updateParams.push(correctPath);
            syncNeeded = true;
          }
          
          // Update file_size if it doesn't match
          if (dbEntry.file_size !== stats.size) {
            updates.file_size = stats.size;
            updateFields.push('file_size = ?');
            updateParams.push(stats.size);
            syncNeeded = true;
          }
          
          // Update resolution if it doesn't match
          if (dbEntry.resolution !== currentResolution) {
            updates.resolution = currentResolution;
            updateFields.push('resolution = ?');
            updateParams.push(currentResolution);
            syncNeeded = true;
          }
          
          if (syncNeeded && updateFields.length > 0) {
            // Perform the update
            updateParams.push(dbEntry.id);
            await database.update(
              `UPDATE media_content SET ${updateFields.join(', ')} WHERE id = ?`,
              updateParams
            );
            
            results.fixed++;
            results.details.push({
              id: dbEntry.id,
              title: dbEntry.title,
              action: 'synchronized',
              updates: updates,
              filesystem_file: matchingFile
            });
            
          } else {
            results.details.push({
              id: dbEntry.id,
              title: dbEntry.title,
              action: 'already_synced',
              filesystem_file: matchingFile
            });
          }
        } else {
          results.errors++;
          results.details.push({
            id: dbEntry.id,
            title: dbEntry.title,
            action: 'no_match_found',
            original_filename: dbEntry.original_filename,
            filename: dbEntry.filename,
            file_path: dbEntry.file_path
          });
        }
        
      } catch (error) {
        results.errors++;
        results.details.push({
          id: dbEntry.id,
          title: dbEntry.title,
          action: 'error',
          error: error.message
        });
        console.error(`❌ Error processing ${dbEntry.title}:`, error.message);
      }
    }
    
    
    res.json({
      success: true,
      message: `Protection synchronization completed: ${results.fixed} entries fixed, ${results.errors} errors`,
      results: results,
      recommendations: results.fixed > 0 ? [
        'Database entries have been synchronized with filesystem',
        'Run the duplicate analysis again to verify protection is working',
        'All original files should now show Protected: true'
      ] : results.errors > 0 ? [
        'Some database entries could not be matched to filesystem files',
        'Consider using the recovery endpoint to restore missing entries',
        'Or manually check file locations'
      ] : [
        'All database entries are already synchronized with filesystem'
      ]
    });
    
  } catch (error) {
    console.error('Protection auto-fix error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router; 
