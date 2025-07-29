const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const database = require('../utils/database');
const thumbnailService = require('./thumbnailService');
const MovieMetadataService = require('./movieMetadataService');

class MediaService {
  constructor() {
    this.uploadDir = path.join(__dirname, '../../uploads/media');
    this.thumbnailDir = path.join(__dirname, '../../uploads/thumbnails');
    this.transcodedDir = path.join(__dirname, '../../uploads/transcoded');
    
    // Initialize metadata service
    this.metadataService = new MovieMetadataService();
    
    // Ensure directories exist
    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
      await fs.mkdir(this.transcodedDir, { recursive: true });
    } catch (error) {
      // Error creating media directories
    }
  }

  // Generate unique filename
  generateUniqueFilename(originalFilename) {
    const ext = path.extname(originalFilename);
    const name = path.basename(originalFilename, ext);
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${name}-${timestamp}-${random}${ext}`;
  }

  // Determine media type from MIME type
  getMediaType(mimeType) {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    return 'document';
  }

  // Determine category (movie or tv-show) from filename
  determineCategory(filename) {
    // Check for TV show patterns
    const tvPatterns = [
      /[Ss]\d{1,2}[Ee]\d{1,2}/, // S01E01, S1E1
      /[Ss]eason\s*\d{1,2}/i, // Season 1
      /[Ee]pisode\s*\d{1,2}/i, // Episode 1
      /\d{1,2}x\d{1,2}/, // 1x01
    ];

    for (const pattern of tvPatterns) {
      if (pattern.test(filename)) {
        return 'tv-show';
      }
    }

    return 'movie'; // Default to movie
  }

  // Extract metadata from media file
  async extractMetadata(filePath, mimeType) {
    return new Promise((resolve) => {
      const metadata = {
        duration: null,
        resolution: null,
        bitrate: null,
        codec: null
      };

      if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        ffmpeg.ffprobe(filePath, (err, data) => {
          if (err) {
            resolve(metadata);
            return;
          }

          try {
            const videoStream = data.streams.find(s => s.codec_type === 'video');
            const audioStream = data.streams.find(s => s.codec_type === 'audio');

            if (data.format && data.format.duration) {
              metadata.duration = Math.round(parseFloat(data.format.duration));
            }

            if (videoStream) {
              metadata.resolution = `${videoStream.width}x${videoStream.height}`;
              metadata.codec = videoStream.codec_name;
            }

            if (audioStream && !videoStream) {
              metadata.codec = audioStream.codec_name;
            }

            if (data.format && data.format.bit_rate) {
              metadata.bitrate = parseInt(data.format.bit_rate);
            }
          } catch (parseError) {
            // Metadata parsing error
          }

          resolve(metadata);
        });
      } else {
        resolve(metadata);
      }
    });
  }

  // Generate advanced thumbnail using the new thumbnail service
  async generateThumbnail(filePath, mediaType, mediaId, title, category = 'movie') {
    if (mediaType !== 'video') return null;

    try {
      const thumbnailPath = await thumbnailService.generateThumbnail(filePath, mediaId, title, category);
      
      if (thumbnailPath) {
        return thumbnailPath;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  // Convert MPEG-TS files to MP4 for better browser compatibility
  async convertToMp4IfNeeded(filePath, originalFilename) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      // Check if file needs conversion (MPEG-TS formats)
      const needsConversion = ['.ts', '.mts', '.m2ts'].includes(ext);
      
      if (!needsConversion) {
        return { converted: false, newPath: filePath, newSize: null };
      }

      // Create new MP4 filename
      const mp4Path = filePath.replace(ext, '.mp4');
      
      // Convert using ffmpeg - copy streams without re-encoding for speed
      await new Promise((resolve, reject) => {
        let lastProgress = 0;
        
        ffmpeg(filePath)
          .outputOptions([
            '-c copy', // Copy streams without re-encoding
            '-movflags +faststart' // Optimize for web streaming
          ])
          .output(mp4Path)
          .on('start', (commandLine) => {
            // Conversion started
          })
          .on('progress', (progress) => {
            // Progress tracking (silent)
          })
          .on('end', () => {
            resolve();
          })
          .on('error', (err) => {
            reject(err);
          })
          .run();
      });
      
      // Get the new file size
      const stats = await fs.stat(mp4Path);
      const newSize = stats.size;
      
      // Remove the original file to save space
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        // Could not remove original file
      }
      
      return { 
        converted: true, 
        newPath: mp4Path, 
        newSize: newSize,
        originalSize: (await fs.stat(filePath).catch(() => ({ size: 0 }))).size
      };
      
    } catch (error) {
      // If conversion fails, return original file info
      return { converted: false, newPath: filePath, newSize: null, error: error.message };
    }
  }

  // Save media file and metadata to database
  async saveMedia(fileData, userId) {
    try {
      let {
        originalname,
        filename,
        path: filePath,
        size,
        mimetype
      } = fileData;

      const mediaType = this.getMediaType(mimetype);
      
      // Auto-convert MPEG-TS files to MP4 for better browser compatibility
      let conversionResult = { converted: false, newPath: filePath, newSize: null };
      if (mediaType === 'video') {
        conversionResult = await this.convertToMp4IfNeeded(filePath, originalname);
        
        if (conversionResult.converted) {
          // Update file data with converted file info
          filePath = conversionResult.newPath;
          size = conversionResult.newSize;
          filename = path.basename(filePath);
          
          // Update MIME type to video/mp4 for converted files
          mimetype = 'video/mp4';
          
        } else if (conversionResult.error) {
          // Auto-conversion failed, proceeding with original format
        }
      }
      
      // Extract basic technical metadata (from the final file)
      const basicMetadata = await this.extractMetadata(filePath, mimetype);

      // Determine category from tags or filename for video files
      const category = mediaType === 'video' ? this.determineCategory(originalname) : 'other';
      
      // Get comprehensive metadata for video files
      let completeMetadata = null;
      let dbData = null;
      
      if (mediaType === 'video') {
        completeMetadata = await this.metadataService.getCompleteMetadata(originalname, filePath, category);
        dbData = this.metadataService.formatForDatabase(completeMetadata);
      }

      // Use enhanced metadata if available, otherwise fall back to basic
      const title = dbData?.title || path.basename(originalname, path.extname(originalname));
      const description = dbData?.description || '';
      const tags = dbData?.tags || (category === 'tv-show' ? 'tv-show' : 'movie');
      const duration = dbData?.duration || basicMetadata.duration;
      const fileSize = dbData?.file_size || size;
      const resolution = dbData?.resolution || basicMetadata.resolution;

      // TV show specific fields
      const seasonNumber = completeMetadata?.season || null;
      const episodeNumber = completeMetadata?.episode || null;
      const episodeTitle = completeMetadata?.episodeTitle || null;
      
      // For TV shows, determine the show title and check for existing shows
      let showTitle = null;
      if (completeMetadata?.category === 'tv-show') {
        if (completeMetadata?.tmdbDataAvailable) {
          // Use TMDB title (clean show name)
          showTitle = completeMetadata.title;
        } else {
          // Use extracted title as fallback
          showTitle = completeMetadata.extractedTitle;
        }
        
        // Check if there's already a show with a similar title and use that instead
        showTitle = await this.normalizeShowTitle(showTitle);
      }

      // For TV shows, use episode title as the main title if available
      const finalTitle = episodeTitle || title;

      // Insert into database
      const result = await database.insert(
        `INSERT INTO media_content (
          title, description, tags, original_filename, filename, file_path, file_size, 
          mime_type, media_type, duration, resolution, uploaded_by, 
          status, metadata, extended_metadata, season_number, episode_number, 
          episode_title, show_title
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalTitle,
          description,
          tags,
          originalname,
          filename,
          filePath,
          fileSize,
          mimetype,
          mediaType,
          duration,
          resolution,
          userId,
          'processing',
          JSON.stringify(basicMetadata),
          dbData?.extended_metadata || null,
          seasonNumber,
          episodeNumber,
          episodeTitle,
          showTitle
        ]
      );

      const mediaId = result.id;

      // Generate advanced thumbnail for videos
      const thumbnailPath = await this.generateThumbnail(filePath, mediaType, mediaId, title, 'movie');
      
      if (thumbnailPath) {
        await database.update(
          'UPDATE media_content SET thumbnail_path = ? WHERE id = ?',
          [thumbnailPath, mediaId]
        );
      }

      // Update status to ready
      await database.update(
        'UPDATE media_content SET status = ? WHERE id = ?',
        ['ready', mediaId]
      );

      // Enhanced metadata saved successfully

      return {
        id: mediaId,
        title,
        description,
        tags,
        filename,
        mediaType,
        size: fileSize,
        duration,
        resolution,
        thumbnailPath,
        status: 'ready',
        metadata: completeMetadata
      };

    } catch (error) {
      throw error;
    }
  }

  // Normalize show title to ensure consistency across episodes
  async normalizeShowTitle(proposedTitle) {
    try {
      // Look for existing shows with similar titles
      const existingShows = await database.query(
        `SELECT DISTINCT show_title FROM media_content 
         WHERE show_title IS NOT NULL 
         AND tags LIKE '%tv-show%'
         AND media_type = 'video'`
      );
      
      // Check for exact match first
      const exactMatch = existingShows.find(show => 
        show.show_title.toLowerCase() === proposedTitle.toLowerCase()
      );
      if (exactMatch) {
        return exactMatch.show_title;
      }
      
      // Check for partial matches (e.g., "Peep Show" matches "Peep Show S1E1")
      const partialMatch = existingShows.find(show => {
        const existing = show.show_title.toLowerCase();
        const proposed = proposedTitle.toLowerCase();
        return existing.includes(proposed) || proposed.includes(existing);
      });
      
      if (partialMatch) {
        return partialMatch.show_title;
      }
      
      // No match found, use the proposed title
      return proposedTitle;
      
    } catch (error) {
      return proposedTitle;
    }
  }

  // Get media list with filters
  async getMediaList(userId, userRole, filters = {}) {
    try {
      let query = `
        SELECT 
          mc.*,
          u.username as uploader_name
        FROM media_content mc
        JOIN users u ON mc.uploaded_by = u.id
      `;
      
      const params = [];
      const conditions = [];

      // Role-based filtering
      if (userRole === 'user') {
        conditions.push('mc.published = 1');
      }

      // Apply filters
      if (filters.mediaType) {
        conditions.push('mc.media_type = ?');
        params.push(filters.mediaType);
      }

      if (filters.category) {
        conditions.push('mc.tags LIKE ?');
        params.push(`${filters.category}%`);
      }

      if (filters.search) {
        conditions.push('(mc.title LIKE ? OR mc.description LIKE ? OR mc.tags LIKE ?)');
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY mc.upload_date DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
      }

      const media = await database.query(query, params);
      
      return media.map(item => ({
        ...item,
        metadata: item.metadata ? JSON.parse(item.metadata) : null,
        file_size_mb: Math.round(item.file_size / (1024 * 1024) * 100) / 100
      }));

    } catch (error) {
      console.error('Error getting media list:', error);
      throw error;
    }
  }

  // Get single media item
  async getMediaById(mediaId, userId, userRole) {
    try {
      let query = `
        SELECT 
          mc.*,
          u.username as uploader_name,
          u.display_name as uploader_display_name
        FROM media_content mc
        JOIN users u ON mc.uploaded_by = u.id
        WHERE mc.id = ?
      `;
      
      const params = [mediaId];

      // Role-based access control
      if (userRole === 'user') {
        query += ' AND mc.published = 1';
      }

      const result = await database.query(query, params);
      
      if (result.length === 0) {
        return null;
      }

      const media = result[0];
      
      // Increment view count
      await database.update(
        'UPDATE media_content SET views = views + 1 WHERE id = ?',
        [mediaId]
      );

      return {
        ...media,
        metadata: media.metadata ? JSON.parse(media.metadata) : null,
        file_size_mb: Math.round(media.file_size / (1024 * 1024) * 100) / 100
      };

    } catch (error) {
      throw error;
    }
  }

  // Update media metadata
  async updateMedia(mediaId, updates, userId, userRole) {
    try {
      // Check permissions
      const media = await database.query(
        'SELECT uploaded_by FROM media_content WHERE id = ?',
        [mediaId]
      );

      if (media.length === 0) {
        throw new Error('Media not found');
      }

      // Only allow updates by uploader, managers, or admins
      if (userRole !== 'admin' && userRole !== 'manager' && media[0].uploaded_by !== userId) {
        throw new Error('Permission denied');
      }

      const allowedFields = ['title', 'description', 'tags', 'published'];
      const updateFields = [];
      const params = [];

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          params.push(updates[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      params.push(mediaId);

      await database.update(
        `UPDATE media_content SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      return { success: true };

    } catch (error) {
      throw error;
    }
  }

  // Delete media
  async deleteMedia(mediaId, userId, userRole) {
    try {
      // Get media info for permission check
      const media = await database.query(
        'SELECT * FROM media_content WHERE id = ?',
        [mediaId]
      );

      if (media.length === 0) {
        throw new Error('Media not found');
      }

      const mediaItem = media[0];

      // Check permissions
      if (userRole !== 'admin' && userRole !== 'manager' && mediaItem.uploaded_by !== userId) {
        throw new Error('Permission denied');
      }

      // Use comprehensive cleanup method
      return await this.comprehensiveCleanup(mediaId, userRole);

    } catch (error) {
      console.error('Delete media error:', error);
      throw error;
    }
  }

  // Comprehensive cleanup - removes ALL traces of media when deleted
  async comprehensiveCleanup(mediaId, userRole) {
    try {
      // Get media info before deletion
      const media = await database.query('SELECT * FROM media_content WHERE id = ?', [mediaId]);
      if (media.length === 0) {
        throw new Error('Media not found');
      }
      
      const mediaInfo = media[0];
      const originalPath = mediaInfo.file_path;
      const thumbnailPath = mediaInfo.thumbnail_path;
      
      // Step 1: Remove all transcoded versions
      const transcodedFiles = await database.query(
        'SELECT * FROM transcoded_results WHERE original_path = ?',
        [originalPath]
      );
      
      let transcodedCleaned = 0;
      for (const transcoded of transcodedFiles) {
        try {
          await fs.unlink(transcoded.transcoded_path);
          await database.query('DELETE FROM transcoded_results WHERE id = ?', [transcoded.id]);
          transcodedCleaned++;
        } catch (error) {
          // Could not remove transcoded file
        }
      }
      
      // Step 2: Remove thumbnail
      if (thumbnailPath) {
        try {
          await fs.unlink(thumbnailPath);
        } catch (error) {
          // Could not remove thumbnail
        }
      }
      
      // Step 3: Remove original file
      try {
        await fs.unlink(originalPath);
      } catch (error) {
        // Could not remove original file
      }
      
      // Step 4: Clean up any related chunks or temp files
      const filename = path.basename(originalPath);
      const fileBasename = path.basename(filename, path.extname(filename));
      
      // Clean chunks directory
      const chunksDir = path.join(path.dirname(originalPath), '../chunks');
      try {
        const chunkFiles = await fs.readdir(chunksDir);
        let chunksCleaned = 0;
        
        for (const chunkFile of chunkFiles) {
          if (chunkFile.includes(fileBasename) || chunkFile.includes(filename.split('-')[0])) {
            try {
              await fs.unlink(path.join(chunksDir, chunkFile));
              chunksCleaned++;
            } catch (error) {
              // Chunk file might already be gone
            }
          }
        }
        
        // Chunks cleaned if any existed
      } catch (error) {
        // Chunks directory might not exist
      }
      
      // Step 5: Remove from database (this should be last)
      await database.query('DELETE FROM media_content WHERE id = ?', [mediaId]);
      
      // Step 6: Update storage analytics
      const transcodingService = require('./transcodingService');
      if (global.transcodingService) {
        await global.transcodingService.updateStorageAnalytics();
      }
      
      return {
        success: true,
        cleaned: {
          original: 1,
          transcoded: transcodedCleaned,
          thumbnail: thumbnailPath ? 1 : 0,
          database: 1
        },
        message: `Completely removed "${mediaInfo.title}" from all locations`
      };
      
    } catch (error) {
      throw error;
    }
  }

  // Get media statistics
  async getStatistics() {
    try {
      const stats = await database.query(`
        SELECT 
          COUNT(*) as total_content,
          COUNT(CASE WHEN published = 1 THEN 1 END) as published_content,
          COUNT(CASE WHEN published = 0 THEN 1 END) as draft_content,
          SUM(views) as total_views,
          SUM(file_size) as total_size,
          COUNT(CASE WHEN tags LIKE 'movie%' THEN 1 END) as movie_count,
          COUNT(CASE WHEN tags LIKE 'tv-show%' THEN 1 END) as tv_show_count,
          COUNT(CASE WHEN published = 1 AND tags LIKE 'movie%' THEN 1 END) as published_movies,
          COUNT(CASE WHEN published = 1 AND tags LIKE 'tv-show%' THEN 1 END) as published_tv_shows,
          AVG(views) as avg_views_per_content
        FROM media_content
      `);

      const result = stats[0];
      
      return {
        // Convert to camelCase for frontend compatibility
        totalContent: result.total_content || 0,
        publishedContent: result.published_content || 0,
        draftContent: result.draft_content || 0,
        totalViews: result.total_views || 0,
        totalSize: result.total_size || 0,
        totalSizeGb: Math.round((result.total_size || 0) / (1024 * 1024 * 1024) * 100) / 100,
        movieCount: result.movie_count || 0,
        tvShowCount: result.tv_show_count || 0,
        publishedMovies: result.published_movies || 0,
        publishedTvShows: result.published_tv_shows || 0,
        avgViewsPerContent: Math.round((result.avg_views_per_content || 0) * 100) / 100
      };

    } catch (error) {
      throw error;
    }
  }
  // Regenerate thumbnails using the advanced thumbnail service
  async regenerateThumbnails() {
    try {
      // Get all video content
      const mediaItems = await database.query(`
        SELECT id, file_path, media_type, title, tags
        FROM media_content 
        WHERE media_type = 'video' 
        AND status = 'ready'
      `);
      
      // Use the thumbnail service's batch regeneration
      const results = await thumbnailService.regenerateAllThumbnails(mediaItems);
      
      // Update database with new thumbnail paths
      let updated = 0;
      for (const result of results) {
        if (result.success && result.thumbnail_path) {
          await database.update(
            'UPDATE media_content SET thumbnail_path = ? WHERE id = ?',
            [result.thumbnail_path, result.id]
          );
          updated++;
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // Advanced thumbnail regeneration complete
      return { 
        regenerated: successful, 
        failed, 
        total: mediaItems.length,
        updated,
        results 
      };
      
    } catch (error) {
      throw error;
    }
  }

  // Fetch metadata for all existing content
  async fetchMetadataForExistingContent() {
    try {
      // Starting metadata fetch for existing content
      
      // Get all video content that doesn't have extended metadata
      const videos = await database.query(
        'SELECT id, title, original_filename, file_path FROM media_content WHERE media_type = ? AND status = ? AND (extended_metadata IS NULL OR extended_metadata = "")',
        ['video', 'ready']
      );
      
      // Found video files without enhanced metadata
      
      let updated = 0;
      let failed = 0;
      
      for (const video of videos) {
        try {
          // Fetching metadata for video
          
          // Determine category and get comprehensive metadata
          const category = this.determineCategory(video.original_filename);
          const completeMetadata = await this.metadataService.getCompleteMetadata(
            video.original_filename, 
            video.file_path,
            category
          );
          
          if (completeMetadata && completeMetadata.tmdbDataAvailable) {
            const dbData = this.metadataService.formatForDatabase(completeMetadata);
            
            // TV show specific fields
            const seasonNumber = completeMetadata?.season || null;
            const episodeNumber = completeMetadata?.episode || null;
            const episodeTitle = completeMetadata?.episodeTitle || null;
            const showTitle = completeMetadata?.category === 'tv-show' ? completeMetadata?.title : null;
            
            // Update database with enhanced metadata
            await database.update(
              `UPDATE media_content SET 
                title = ?, description = ?, tags = ?, 
                extended_metadata = ?, season_number = ?, episode_number = ?, 
                episode_title = ?, show_title = ?
               WHERE id = ?`,
              [
                dbData.title,
                dbData.description,
                dbData.tags,
                dbData.extended_metadata,
                seasonNumber,
                episodeNumber,
                episodeTitle,
                showTitle,
                video.id
              ]
            );
            
            updated++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
        }
      }
      
      // Metadata fetch complete
      
      return {
        total: videos.length,
        updated,
        failed
      };
    } catch (error) {
      throw error;
    }
  }

  // Fetch metadata for specific content item
  async fetchMetadataForContent(contentId) {
    try {
      // Get the content item
      const content = await database.query(
        'SELECT * FROM media_content WHERE id = ? AND media_type = ?',
        [contentId, 'video']
      );
      
      if (!content || content.length === 0) {
        return null;
      }
      
      const video = content[0];
      // Fetching metadata for video
      
      // Determine category and get comprehensive metadata
      const category = this.determineCategory(video.original_filename);
      const completeMetadata = await this.metadataService.getCompleteMetadata(
        video.original_filename, 
        video.file_path,
        category
      );
      
      let updated = false;
      
      if (completeMetadata && completeMetadata.tmdbDataAvailable) {
        const dbData = this.metadataService.formatForDatabase(completeMetadata);
        
        // TV show specific fields
        const seasonNumber = completeMetadata?.season || null;
        const episodeNumber = completeMetadata?.episode || null;
        const episodeTitle = completeMetadata?.episodeTitle || null;
        const showTitle = completeMetadata?.category === 'tv-show' ? completeMetadata?.title : null;
        
        // Update database with enhanced metadata
        await database.update(
          `UPDATE media_content SET 
            title = ?, description = ?, tags = ?, 
            extended_metadata = ?, season_number = ?, episode_number = ?, 
            episode_title = ?, show_title = ?
           WHERE id = ?`,
          [
            dbData.title,
            dbData.description,
            dbData.tags,
            dbData.extended_metadata,
            seasonNumber,
            episodeNumber,
            episodeTitle,
            showTitle,
            contentId
          ]
        );
        
        updated = true;
      }
      
      // Get updated content
      const updatedContent = await database.query(
        'SELECT * FROM media_content WHERE id = ?',
        [contentId]
      );
      
      return {
        updated,
        content: updatedContent[0],
        metadata: completeMetadata
      };
    } catch (error) {
      console.error(`Error fetching metadata for content ${contentId}:`, error);
      throw error;
    }
  }

  // Get TV shows organized by show and season
  async getTVShowsOrganized(userId, userRole) {
    try {
      let query = `
        SELECT 
          mc.*,
          u.username as uploader_name
        FROM media_content mc
        JOIN users u ON mc.uploaded_by = u.id
        WHERE mc.tags LIKE '%tv-show%' AND mc.media_type = 'video'
      `;
      const params = [];

      // Role-based filtering
      if (userRole === 'user') {
        query += ' AND mc.published = 1';
      }

      query += ' ORDER BY mc.show_title, mc.season_number, mc.episode_number';

      const episodes = await database.query(query, params);
      
      // Parse metadata and organize by show and season
      const tvShows = {};
      
      episodes.forEach(episode => {
        // Determine the show title with better fallback logic
        let showTitle = episode.show_title;
        
        // If no show_title, try to extract from the episode title
        if (!showTitle && episode.title) {
          // Extract show name from episode title (remove season/episode info)
          showTitle = episode.title
            .replace(/[Ss]\d{1,2}[Ee]\d{1,2}.*$/g, '')
            .replace(/[Ss]eason\s*\d{1,2}.*$/gi, '')
            .replace(/[Ee]pisode\s*\d{1,2}.*$/gi, '')
            .replace(/\d{4}.*$/g, '')
            .replace(/[-_.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        // Final fallback
        if (!showTitle) {
          showTitle = 'Unknown Show';
        }
        
        const seasonNumber = episode.season_number || 1;
        
        if (!tvShows[showTitle]) {
          tvShows[showTitle] = {
            title: showTitle,
            seasons: {},
            totalEpisodes: 0,
            thumbnail: episode.thumbnail_path,
            description: episode.description,
            extended_metadata: episode.extended_metadata ? JSON.parse(episode.extended_metadata) : null
          };
        }
        
        if (!tvShows[showTitle].seasons[seasonNumber]) {
          tvShows[showTitle].seasons[seasonNumber] = {
            seasonNumber,
            episodes: [],
            episodeCount: 0
          };
        }
        
        tvShows[showTitle].seasons[seasonNumber].episodes.push({
          ...episode,
          metadata: episode.metadata ? JSON.parse(episode.metadata) : null,
          extended_metadata: episode.extended_metadata ? JSON.parse(episode.extended_metadata) : null,
          file_size_mb: Math.round(episode.file_size / (1024 * 1024) * 100) / 100
        });
        
        tvShows[showTitle].seasons[seasonNumber].episodeCount++;
        tvShows[showTitle].totalEpisodes++;
      });

      // Convert to array format
      return Object.values(tvShows).map(show => ({
        ...show,
        seasons: Object.values(show.seasons).sort((a, b) => a.seasonNumber - b.seasonNumber)
      }));

    } catch (error) {
      console.error('Error getting organized TV shows:', error);
      throw error;
    }
  }

  // Update existing TV show episodes to use normalized show titles
  async normalizeExistingTVShows() {
    try {
      
      // Get all TV show episodes
      const episodes = await database.query(
        `SELECT id, title, show_title FROM media_content 
         WHERE tags LIKE '%tv-show%' AND media_type = 'video'
         ORDER BY upload_date`
      );
      
      const showTitleMap = new Map();
      let updated = 0;
      
      for (const episode of episodes) {
        let normalizedTitle = episode.show_title;
        
        // If no show_title, extract from episode title
        if (!normalizedTitle && episode.title) {
          normalizedTitle = episode.title
            .replace(/[Ss]\d{1,2}[Ee]\d{1,2}.*$/g, '')
            .replace(/[Ss]eason\s*\d{1,2}.*$/gi, '')
            .replace(/[Ee]pisode\s*\d{1,2}.*$/gi, '')
            .replace(/\d{4}.*$/g, '')
            .replace(/[-_.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        if (normalizedTitle) {
          // Check if we've seen a similar title before
          let finalTitle = normalizedTitle;
          for (const [existing, canonical] of showTitleMap.entries()) {
            if (existing.toLowerCase().includes(normalizedTitle.toLowerCase()) || 
                normalizedTitle.toLowerCase().includes(existing.toLowerCase())) {
              finalTitle = canonical;
              break;
            }
          }
          
          // If this is a new title, add it to the map
          if (finalTitle === normalizedTitle) {
            showTitleMap.set(normalizedTitle, normalizedTitle);
          }
          
          // Update the episode if the show_title has changed
          if (episode.show_title !== finalTitle) {
            await database.update(
              'UPDATE media_content SET show_title = ? WHERE id = ?',
              [finalTitle, episode.id]
            );
            updated++;
            // Updated episode show title
          }
        }
      }
      
      // TV show normalization complete
      return { updated, total: episodes.length };
      
    } catch (error) {
      throw error;
    }
  }

  // Get episodes for a specific TV show and season
  async getTVShowEpisodes(showTitle, seasonNumber, userId, userRole) {
    try {
      // Extract the base show title (remove season/episode info)
      const baseShowTitle = showTitle.replace(/\s+S\d+E\d+.*$/i, '').trim();
      
      let query = `
        SELECT 
          mc.*,
          u.username as uploader_name
        FROM media_content mc
        JOIN users u ON mc.uploaded_by = u.id
        WHERE (mc.show_title LIKE ? OR mc.title LIKE ?) 
        AND mc.season_number = ? 
        AND mc.media_type = 'video'
      `;
      const params = [`%${baseShowTitle}%`, `%${baseShowTitle}%`, seasonNumber];

      // Role-based filtering
      if (userRole === 'user') {
        query += ' AND mc.published = 1';
      }

      query += ' ORDER BY mc.episode_number';

      const episodes = await database.query(query, params);
      
      // Parse metadata for each episode
      return episodes.map(episode => ({
        ...episode,
        metadata: episode.metadata ? JSON.parse(episode.metadata) : null,
        extended_metadata: episode.extended_metadata ? JSON.parse(episode.extended_metadata) : null,
        file_size_mb: Math.round(episode.file_size / (1024 * 1024) * 100) / 100
      }));

    } catch (error) {
      throw error;
    }
  }

  // Get the best available file for streaming (prefers transcoded versions)
  async getBestStreamingFile(mediaId, originalFilePath) {
    try {
      // Query transcoded files for this media, ordered by quality preference
      const transcodedFiles = await database.query(`
        SELECT transcoded_path, quality, original_size, transcoded_size
        FROM transcoded_results 
        WHERE original_path = ?
        ORDER BY 
          CASE quality
            WHEN '1080p' THEN 1
            WHEN '720p' THEN 2
            WHEN '480p' THEN 3
            WHEN '1080p_opus' THEN 4
            WHEN '720p_opus' THEN 5
            WHEN '480p_opus' THEN 6
            ELSE 7
          END
      `, [originalFilePath]);

      // Check each transcoded file to see if it exists and is valid
      for (const transcoded of transcodedFiles) {
        try {
          const stats = await fs.stat(transcoded.transcoded_path);
          if (stats.size > 1024) { // Must be larger than 1KB to be valid
            // Using transcoded version
            return {
              filePath: transcoded.transcoded_path,
              isTranscoded: true,
              quality: transcoded.quality_level,
              fileSize: stats.size,
              compressionInfo: {
                originalSize: transcoded.original_size,
                transcodedSize: stats.size,
                spaceSaved: transcoded.original_size - stats.size,
                compressionRatio: ((transcoded.original_size - stats.size) / transcoded.original_size * 100).toFixed(1)
              }
            };
          }
        } catch (fileError) {
          // Transcoded file doesn't exist or isn't accessible, try next one
        }
      }

      // No database matches found, try filesystem-based lookup as fallback
      const originalBasename = path.basename(originalFilePath, path.extname(originalFilePath));
      const transcodedDir = path.join(path.dirname(originalFilePath), '../transcoded');
      
      // Extract the EXACT unique identifier from the filename (the timestamp-hash part)
      // e.g., "Hackers_audio_fixed-1753096684827-8dc740ba1291365a.mkv" -> "1753096684827-8dc740ba1291365a"
      const uniqueIdMatch = originalBasename.match(/-(\d+-[a-f0-9]+)$/);
      
      if (uniqueIdMatch) {
        const uniqueId = uniqueIdMatch[1]; // e.g., "1753096684827-8dc740ba1291365a"
        // Looking for transcoded files with unique ID
        
        try {
          const files = await fs.readdir(transcodedDir);
          
          // Look ONLY for transcoded files that contain this exact unique identifier
          const candidateFiles = files.filter(file => {
            return file.includes(uniqueId) && (file.endsWith('.mp4') || file.endsWith('.webm'));
          });
          
          // Sort by quality preference (1080p > 720p > 480p)
          candidateFiles.sort((a, b) => {
            if (a.includes('1080p') && !b.includes('1080p')) return -1;
            if (b.includes('1080p') && !a.includes('1080p')) return 1;
            if (a.includes('720p') && !b.includes('720p')) return -1;
            if (b.includes('720p') && !a.includes('720p')) return 1;
            return 0;
          });
          
          // Check each candidate file
          for (const fileName of candidateFiles) {
            const transcodedPath = path.join(transcodedDir, fileName);
            try {
              const stats = await fs.stat(transcodedPath);
              if (stats.size > 1024) {
                // Determine quality from filename
                let quality = 'unknown';
                if (fileName.includes('1080p')) quality = '1080p';
                else if (fileName.includes('720p')) quality = '720p';
                else if (fileName.includes('480p')) quality = '480p';
                
                // Found transcoded file via filesystem
                
                // Get original file size for compression info
                let originalSize;
                try {
                  const originalStats = await fs.stat(originalFilePath);
                  originalSize = originalStats.size;
                } catch {
                  originalSize = null;
                }
                
                return {
                  filePath: transcodedPath,
                  isTranscoded: true,
                  quality: quality,
                  fileSize: stats.size,
                  compressionInfo: originalSize ? {
                    originalSize: originalSize,
                    transcodedSize: stats.size,
                    spaceSaved: originalSize - stats.size,
                    compressionRatio: ((originalSize - stats.size) / originalSize * 100).toFixed(1)
                  } : null
                };
              }
            } catch (fileError) {
              // File doesn't exist or isn't accessible, continue to next
            }
          }
        } catch (dirError) {
          // Could not read transcoded directory
        }
      } else {
        // No unique ID found in filename - skipping filesystem fallback
      }

      // No valid transcoded files found, use original
      const stats = await fs.stat(originalFilePath);
      return {
        filePath: originalFilePath,
        isTranscoded: false,
        quality: 'original',
        fileSize: stats.size,
        compressionInfo: null
      };

    } catch (error) {
      // Fallback to original file
      const stats = await fs.stat(originalFilePath);
      return {
        filePath: originalFilePath,
        isTranscoded: false,
        quality: 'original',
        fileSize: stats.size,
        compressionInfo: null
      };
    }
  }

  // Get a lower quality file for streaming enforcement
  async getLowerQualityFile(mediaId, originalFilePath, maxQuality) {
    try {
      // Query transcoded files for this media, ordered by quality preference (but below maxQuality)
      const qualityOrder = ['1080p', '720p', '480p'];
      const maxQualityIndex = qualityOrder.indexOf(maxQuality);
      
      if (maxQualityIndex === -1) {
        return null;
      }

      // Get transcoded files that are at or below the max quality
      const allowedQualities = qualityOrder.slice(maxQualityIndex);
      const placeholders = allowedQualities.map(() => '?').join(',');
      
      const transcodedFiles = await database.query(`
        SELECT transcoded_path, quality, original_size, transcoded_size
        FROM transcoded_results 
        WHERE original_path = ? AND quality IN (${placeholders})
        ORDER BY 
          CASE quality
            WHEN '1080p' THEN 1
            WHEN '720p' THEN 2
            WHEN '480p' THEN 3
            ELSE 4
          END
      `, [originalFilePath, ...allowedQualities]);

      // Check each transcoded file to see if it exists and is valid
      for (const transcoded of transcodedFiles) {
        try {
          const stats = await fs.stat(transcoded.transcoded_path);
          if (stats.size > 1024) { // Must be larger than 1KB to be valid
            return {
          filePath: transcoded.transcoded_path,
          isTranscoded: true,
          quality: transcoded.quality,
              fileSize: stats.size,
              compressionInfo: {
                originalSize: transcoded.original_size,
                transcodedSize: stats.size,
                spaceSaved: transcoded.original_size - stats.size,
                compressionRatio: ((transcoded.original_size - stats.size) / transcoded.original_size * 100).toFixed(1)
              }
            };
          }
        } catch (fileError) {
          // Transcoded file doesn't exist or isn't accessible, try next one
        }
      }

      // No database matches found, try filesystem-based lookup as fallback
      const originalBasename = path.basename(originalFilePath, path.extname(originalFilePath));
      const transcodedDir = path.join(path.dirname(originalFilePath), '../transcoded');
      
      // Extract the unique identifier from the filename
      const uniqueIdMatch = originalBasename.match(/-(\d+-[a-f0-9]+)$/);
      
      if (uniqueIdMatch) {
        const uniqueId = uniqueIdMatch[1];
        
        try {
          const files = await fs.readdir(transcodedDir);
          
          // Look for transcoded files that contain this exact unique identifier and are at or below max quality
          const candidateFiles = files.filter(file => {
            if (!file.includes(uniqueId) || !(file.endsWith('.mp4') || file.endsWith('.webm'))) {
              return false;
            }
            
            // Check if quality is at or below max quality
            for (let i = maxQualityIndex; i < qualityOrder.length; i++) {
              if (file.includes(qualityOrder[i])) {
                return true;
              }
            }
            return false;
          });
          
          // Sort by quality preference (best allowed quality first)
          candidateFiles.sort((a, b) => {
            for (let i = maxQualityIndex; i < qualityOrder.length; i++) {
              const quality = qualityOrder[i];
              if (a.includes(quality) && !b.includes(quality)) return -1;
              if (b.includes(quality) && !a.includes(quality)) return 1;
            }
            return 0;
          });
          
          // Check each candidate file
          for (const fileName of candidateFiles) {
            const transcodedPath = path.join(transcodedDir, fileName);
            try {
              const stats = await fs.stat(transcodedPath);
              if (stats.size > 1024) {
                // Determine quality from filename
                let quality = 'unknown';
                if (fileName.includes('1080p')) quality = '1080p';
                else if (fileName.includes('720p')) quality = '720p';
                else if (fileName.includes('480p')) quality = '480p';
                
                // Found lower quality transcoded file via filesystem
                
                // Get original file size for compression info
                let originalSize;
                try {
                  const originalStats = await fs.stat(originalFilePath);
                  originalSize = originalStats.size;
                } catch {
                  originalSize = null;
                }
                
                return {
                  filePath: transcodedPath,
                  isTranscoded: true,
                  quality: quality,
                  fileSize: stats.size,
                  compressionInfo: originalSize ? {
                    originalSize: originalSize,
                    transcodedSize: stats.size,
                    spaceSaved: originalSize - stats.size,
                    compressionRatio: ((originalSize - stats.size) / originalSize * 100).toFixed(1)
                  } : null
                };
              }
            } catch (fileError) {
              // File doesn't exist or isn't accessible, continue to next
            }
          }
        } catch (dirError) {
          // Could not read transcoded directory
        }
      }

      // No suitable lower quality version found for file
      return null;

    } catch (error) {
      console.error('Error finding lower quality streaming file:', error);
      return null;
    }
  }
}

module.exports = new MediaService(); 
