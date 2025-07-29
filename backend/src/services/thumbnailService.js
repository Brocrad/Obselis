const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const database = require('../utils/database');

class ThumbnailService {
  constructor() {
    this.thumbnailDir = path.join(__dirname, '../../uploads/thumbnails');
    this.tempDir = path.join(__dirname, '../../uploads/temp');
    
    // TMDB API configuration (you can get a free API key from themoviedb.org)
    this.tmdbApiKey = process.env.TMDB_API_KEY || null;
    this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
    this.tmdbImageBaseUrl = 'https://image.tmdb.org/t/p/w500';
    
    // OMDB API configuration (alternative, also free)
    this.omdbApiKey = process.env.OMDB_API_KEY || null;
    this.omdbBaseUrl = 'http://www.omdbapi.com';
    
    this.initDirectories();
  }

  async initDirectories() {
    try {
      await fs.mkdir(this.thumbnailDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating thumbnail directories:', error);
    }
  }

  // Extract movie title from filename
  extractMovieTitle(filename) {
    // Remove file extension
    let title = filename.replace(/\.[^/.]+$/, '');
    
    // Remove common patterns
    title = title
      .replace(/\d{4}.*$/g, '') // Remove year and everything after
      .replace(/\.(720p|1080p|2160p|4K|HD|BluRay|WEB-DL|WEBRip|DVDRip|x264|x265|HEVC|AAC|AC3|DTS).*$/gi, '')
      .replace(/\[.*?\]/g, '') // Remove brackets content
      .replace(/\(.*?\)/g, '') // Remove parentheses content
      .replace(/[-_.]/g, ' ') // Replace dashes, dots, underscores with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    // Capitalize words
    title = title.replace(/\b\w/g, l => l.toUpperCase());
    
    return title || 'Unknown Movie';
  }

  // Search for movie poster using TMDB API
  async searchMoviePosterTMDB(title, year = null) {
    if (!this.tmdbApiKey) return null;
    
    try {
      const searchQuery = year ? `${title} ${year}` : title;
      const searchUrl = `${this.tmdbBaseUrl}/search/movie?api_key=${this.tmdbApiKey}&query=${encodeURIComponent(searchQuery)}`;
      
      const response = await axios.get(searchUrl, { timeout: 10000 });
      const results = response.data.results;
      
      if (results && results.length > 0) {
        const movie = results[0]; // Take the first result
        if (movie.poster_path) {
          const posterUrl = `${this.tmdbImageBaseUrl}${movie.poster_path}`;
          return {
            url: posterUrl,
            title: movie.title,
            year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
            overview: movie.overview
          };
        }
      }
    } catch (error) {
      // TMDB search failed
    }
    
    return null;
  }

  // Search for movie poster using OMDB API
  async searchMoviePosterOMDB(title, year = null) {
    if (!this.omdbApiKey) return null;
    
    try {
      let searchUrl = `${this.omdbBaseUrl}/?apikey=${this.omdbApiKey}&t=${encodeURIComponent(title)}`;
      if (year) {
        searchUrl += `&y=${year}`;
      }
      
      const response = await axios.get(searchUrl, { timeout: 10000 });
      const movie = response.data;
      
      if (movie && movie.Response === 'True' && movie.Poster && movie.Poster !== 'N/A') {
        return {
          url: movie.Poster,
          title: movie.Title,
          year: movie.Year,
          overview: movie.Plot
        };
      }
    } catch (error) {
      // OMDB search failed
    }
    
    return null;
  }

  // Download poster from URL
  async downloadPoster(posterUrl, outputPath) {
    try {
      const response = await axios.get(posterUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      await fs.writeFile(outputPath, response.data);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Extract frame from video using FFmpeg
  async extractVideoFrame(videoPath, outputPath, timeOffset = '20%') {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: path.dirname(outputPath),
          filename: path.basename(outputPath),
          timemarks: [timeOffset],
          size: '1280x720'
        })
        .on('end', () => {
          resolve(true);
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  // Create stylized poster with title overlay
  async createStylizedPoster(backgroundImagePath, title, outputPath) {
    try {
      // Create title overlay
      const titleSvg = `
        <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:rgba(0,0,0,0.3);stop-opacity:1" />
              <stop offset="100%" style="stop-color:rgba(0,0,0,0.8);stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grad1)"/>
          <text x="200" y="500" font-family="Arial, sans-serif" font-size="32" font-weight="bold" 
                text-anchor="middle" fill="white" stroke="black" stroke-width="1">
            ${title.length > 20 ? title.substring(0, 20) + '...' : title}
          </text>
        </svg>
      `;

      // Process the image
      let image = sharp(backgroundImagePath)
        .resize(400, 600, { 
          fit: 'cover',
          position: 'center'
        });

      // Composite with title overlay
      const result = await image
        .composite([{
          input: Buffer.from(titleSvg),
          top: 0,
          left: 0
        }])
        .jpeg({ 
          quality: 90,
          progressive: true,
          mozjpeg: true 
        })
        .toFile(outputPath);

      return true;
    } catch (error) {
      return false;
    }
  }

  // Create fallback poster with just text
  async createTextPoster(title, outputPath, category = 'movie') {
    try {
      const emoji = category === 'movie' ? '🎬' : '📺';
      const bgColor = category === 'movie' ? '#1a1a2e' : '#16213e';
      const accentColor = category === 'movie' ? '#e94560' : '#0f3460';
      
      // Wrap long titles
      const words = title.split(' ');
      let lines = [];
      let currentLine = '';
      
      for (const word of words) {
        if ((currentLine + word).length > 15) {
          if (currentLine) lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      
      // Limit to 3 lines
      if (lines.length > 3) {
        lines = lines.slice(0, 2);
        lines.push('...');
      }

      const titleSvg = `
        <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${accentColor};stop-opacity:1" />
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="black" flood-opacity="0.5"/>
            </filter>
          </defs>
          
          <!-- Background -->
          <rect width="100%" height="100%" fill="url(#bgGrad)"/>
          
          <!-- Decorative elements -->
          <circle cx="50" cy="50" r="20" fill="rgba(255,255,255,0.1)"/>
          <circle cx="350" cy="550" r="30" fill="rgba(255,255,255,0.1)"/>
          <rect x="0" y="0" width="400" height="10" fill="rgba(255,255,255,0.2)"/>
          <rect x="0" y="590" width="400" height="10" fill="rgba(255,255,255,0.2)"/>
          
          <!-- Emoji -->
          <text x="200" y="200" font-family="Arial, sans-serif" font-size="80" 
                text-anchor="middle" fill="white" filter="url(#shadow)">
            ${emoji}
          </text>
          
          <!-- Title -->
          ${lines.map((line, index) => 
            `<text x="200" y="${300 + (index * 40)}" font-family="Arial, sans-serif" 
                   font-size="28" font-weight="bold" text-anchor="middle" 
                   fill="white" filter="url(#shadow)">
              ${line}
            </text>`
          ).join('')}
          
          <!-- Category label -->
          <rect x="150" y="480" width="100" height="30" rx="15" fill="rgba(255,255,255,0.2)"/>
          <text x="200" y="500" font-family="Arial, sans-serif" font-size="14" 
                text-anchor="middle" fill="white" font-weight="bold">
            ${category.toUpperCase()}
          </text>
        </svg>
      `;

      await sharp(Buffer.from(titleSvg))
        .jpeg({ 
          quality: 90,
          progressive: true 
        })
        .toFile(outputPath);

      return true;
    } catch (error) {
      return false;
    }
  }

  // Main thumbnail generation function
  async generateThumbnail(videoPath, mediaId, title, category = 'movie') {
    const thumbnailPath = path.join(this.thumbnailDir, `thumb-${mediaId}.jpg`);
    const tempFramePath = path.join(this.tempDir, `frame-${mediaId}.jpg`);
    
    try {
      // Step 1: Try to get movie poster from external APIs
      const cleanTitle = this.extractMovieTitle(title);
      
      // Try TMDB first, then OMDB
      let posterInfo = await this.searchMoviePosterTMDB(cleanTitle);
      if (!posterInfo) {
        posterInfo = await this.searchMoviePosterOMDB(cleanTitle);
      }
      
      if (posterInfo) {
        const downloaded = await this.downloadPoster(posterInfo.url, thumbnailPath);
        if (downloaded) {
          // Resize and optimize the downloaded poster
          await sharp(thumbnailPath)
            .resize(400, 600, { 
              fit: 'cover',
              position: 'center'
            })
            .jpeg({ 
              quality: 90,
              progressive: true,
              mozjpeg: true 
            })
            .toFile(thumbnailPath + '.tmp');
          
          await fs.rename(thumbnailPath + '.tmp', thumbnailPath);
          return `/uploads/thumbnails/thumb-${mediaId}.jpg`;
        }
      }
      
      // Step 2: Extract frame from video and create stylized poster
      try {
        await this.extractVideoFrame(videoPath, tempFramePath);
        
        // Create stylized poster with extracted frame
        const stylized = await this.createStylizedPoster(tempFramePath, cleanTitle, thumbnailPath);
        if (stylized) {
          // Clean up temp file
          try { await fs.unlink(tempFramePath); } catch {}
          return `/uploads/thumbnails/thumb-${mediaId}.jpg`;
        }
      } catch (frameError) {
        // Frame extraction failed
      }
      
      // Step 3: Create text-based fallback poster
      const textPoster = await this.createTextPoster(cleanTitle, thumbnailPath, category);
      if (textPoster) {
        return `/uploads/thumbnails/thumb-${mediaId}.jpg`;
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ Thumbnail generation error for ${title}:`, error);
      return null;
    } finally {
      // Clean up temp files
      try { await fs.unlink(tempFramePath); } catch {}
    }
  }

  // Regenerate thumbnail for existing content
  async regenerateThumbnail(videoPath, mediaId, title, category = 'movie') {
    const thumbnailPath = path.join(this.thumbnailDir, `thumb-${mediaId}.jpg`);
    
    // Remove existing thumbnail
    try {
      await fs.unlink(thumbnailPath);
    } catch {}
    
    // Insert into deletion schedule
    try {
      await database.insert(
        `INSERT INTO deletion_schedule \
         (file_path, file_type, media_id, scheduled_for, reason) \
         VALUES (?, ?, ?, ?, ?)`,
        [thumbnailPath, 'thumbnail', mediaId, new Date().toISOString(), 'thumbnail_regeneration']
      );
    } catch {}
    
    return await this.generateThumbnail(videoPath, mediaId, title, category);
  }

  // Batch regenerate thumbnails
  async regenerateAllThumbnails(mediaList) {
    const results = [];
    
    for (const media of mediaList) {
      try {
        const result = await this.regenerateThumbnail(
          media.file_path, 
          media.id, 
          media.title, 
          media.tags?.split(',')[0] || 'movie'
        );
        
        results.push({
          id: media.id,
          title: media.title,
          success: !!result,
          thumbnail_path: result
        });
        
        // Small delay to avoid overwhelming external APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Failed to regenerate thumbnail for ${media.title}:`, error);
        results.push({
          id: media.id,
          title: media.title,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

module.exports = new ThumbnailService(); 
