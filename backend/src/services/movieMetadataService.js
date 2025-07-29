const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

class MovieMetadataService {
  constructor() {
    // TMDB API configuration
    this.tmdbApiKey = process.env.TMDB_API_KEY || null;
    this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
    this.tmdbImageBaseUrl = 'https://image.tmdb.org/t/p/w500';
    
    // OMDB API configuration (backup)
    this.omdbApiKey = process.env.OMDB_API_KEY || null;
    this.omdbBaseUrl = 'http://www.omdbapi.com';
  }

  // Extract title from filename (works for both movies and TV shows)
  extractTitle(filename) {
    let title = filename.replace(/\.[^/.]+$/, '');
    
    // For TV shows, remove season/episode info first
    title = title
      .replace(/[Ss]\d{1,2}[Ee]\d{1,2}.*$/g, '') // Remove S01E01 and everything after
      .replace(/[Ss]eason\s*\d{1,2}.*$/gi, '') // Remove Season 1 and everything after
      .replace(/[Ee]pisode\s*\d{1,2}.*$/gi, '') // Remove Episode 1 and everything after
      .replace(/\d{4}.*$/g, '') // Remove year and everything after
      .replace(/\.(720p|1080p|2160p|4K|HD|BluRay|WEB-DL|WEBRip|DVDRip|x264|x265|HEVC|AAC|AC3|DTS).*$/gi, '')
      .replace(/\[.*?\]/g, '') // Remove brackets content
      .replace(/\(.*?\)/g, '') // Remove parentheses content
      .replace(/[-_.]/g, ' ') // Replace dashes, dots, underscores with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    title = title.replace(/\b\w/g, l => l.toUpperCase());
    
    return title || 'Unknown Title';
  }

  // Extract movie title (legacy method for compatibility)
  extractMovieTitle(filename) {
    return this.extractTitle(filename);
  }

  // Extract season and episode information from filename
  extractSeasonEpisode(filename) {
    const seasonEpisode = {
      season: null,
      episode: null,
      episodeTitle: null
    };

    // Pattern 1: S01E01, S1E1, etc.
    let match = filename.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
    if (match) {
      seasonEpisode.season = parseInt(match[1]);
      seasonEpisode.episode = parseInt(match[2]);
    }

    // Pattern 2: Season 1 Episode 1, Season 01 Episode 01
    if (!match) {
      match = filename.match(/[Ss]eason\s*(\d{1,2}).*?[Ee]pisode\s*(\d{1,2})/i);
      if (match) {
        seasonEpisode.season = parseInt(match[1]);
        seasonEpisode.episode = parseInt(match[2]);
      }
    }

    // Pattern 3: 1x01, 01x01
    if (!match) {
      match = filename.match(/(\d{1,2})x(\d{1,2})/);
      if (match) {
        seasonEpisode.season = parseInt(match[1]);
        seasonEpisode.episode = parseInt(match[2]);
      }
    }

    // Try to extract episode title (text after season/episode info)
    if (seasonEpisode.season && seasonEpisode.episode) {
      const episodeTitleMatch = filename.match(/[Ss]\d{1,2}[Ee]\d{1,2}[^a-zA-Z]*([^.]+)/);
      if (episodeTitleMatch) {
        seasonEpisode.episodeTitle = episodeTitleMatch[1]
          .replace(/\.(720p|1080p|2160p|4K|HD|BluRay|WEB-DL|WEBRip|DVDRip|x264|x265|HEVC|AAC|AC3|DTS).*$/gi, '')
          .replace(/[-_.]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    return seasonEpisode;
  }

  // Extract year from filename
  extractYear(filename) {
    const yearMatch = filename.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
  }

  // Enhanced getMovieMetadata: try multiple variants, fallback to OMDB, log all attempts
  async getMovieMetadata(title, year = null) {
    if (!this.tmdbApiKey && !this.omdbApiKey) {
      // No TMDB or OMDB API key configured
      return null;
    }

    const attemptedTitles = [];
    let tmdbResult = null;
    let omdbResult = null;
    
    // FIX: Declare variables at function scope to avoid "not defined" errors
    let cleaned = null;
    let firstWords = null;

    // Helper to try TMDB
    const tryTMDB = async (searchTitle, searchYear) => {
      if (!this.tmdbApiKey) return null;
      try {
        attemptedTitles.push(`[TMDB] ${searchTitle}${searchYear ? ' (' + searchYear + ')' : ''}`);
        let searchUrl = `${this.tmdbBaseUrl}/search/movie?api_key=${this.tmdbApiKey}&query=${encodeURIComponent(searchTitle)}`;
        if (searchYear) searchUrl += `&year=${searchYear}`;
        const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
        const results = searchResponse.data.results;
        if (results && results.length > 0) {
          const movie = results[0];
          const detailsUrl = `${this.tmdbBaseUrl}/movie/${movie.id}?api_key=${this.tmdbApiKey}&append_to_response=credits,keywords,videos,release_dates`;
          const detailsResponse = await axios.get(detailsUrl, { timeout: 10000 });
          return this.processMovieData(detailsResponse.data);
        }
      } catch (error) {
        // TMDB search failed
      }
      return null;
    };

    // Helper to try OMDB
    const tryOMDB = async (searchTitle, searchYear) => {
      if (!this.omdbApiKey) return null;
      try {
        attemptedTitles.push(`[OMDB] ${searchTitle}${searchYear ? ' (' + searchYear + ')' : ''}`);
        let searchUrl = `${this.omdbBaseUrl}/?apikey=${this.omdbApiKey}&t=${encodeURIComponent(searchTitle)}`;
        if (searchYear) searchUrl += `&y=${searchYear}`;
        const response = await axios.get(searchUrl, { timeout: 10000 });
        const movie = response.data;
        if (movie && movie.Response === 'True') {
          return {
            title: movie.Title,
            description: movie.Plot,
            releaseDate: movie.Released,
            runtime: movie.Runtime,
            genres: movie.Genre ? movie.Genre.split(',').map(g => g.trim()) : [],
            director: movie.Director,
            cast: movie.Actors ? movie.Actors.split(',').map(a => ({ name: a.trim() })) : [],
            tmdbRating: movie.imdbRating,
            posterPath: movie.Poster,
            imdbId: movie.imdbID,
            // ...add more fields as needed
          };
        }
      } catch (error) {
        // OMDB search failed
      }
      return null;
    };

    // Try original title and year
    tmdbResult = await tryTMDB(title, year);
    if (!tmdbResult && year) tmdbResult = await tryTMDB(title, null);

    // Try cleaned-up variants if still not found
    if (!tmdbResult) {
      // Remove common tags and try again
      cleaned = title.replace(/(repack|extended|remastered|uncut|director'?s cut|\d{3,4}p|bluray|web-dl|webrip|dvdrip|x264|x265|hevc|aac|ac3|dts|\[.*?\]|\(.*?\)|[-_.])/gi, ' ');
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      if (cleaned && cleaned !== title) {
        tmdbResult = await tryTMDB(cleaned, year);
        if (!tmdbResult && year) tmdbResult = await tryTMDB(cleaned, null);
      }
    }
    // Try only the first few words
    if (!tmdbResult) {
      firstWords = title.split(' ').slice(0, 3).join(' ');
      if (firstWords && firstWords.length > 2) {
        tmdbResult = await tryTMDB(firstWords, year);
        if (!tmdbResult && year) tmdbResult = await tryTMDB(firstWords, null);
      }
    }
    // Try OMDB as fallback
    if (!tmdbResult) {
      omdbResult = await tryOMDB(title, year);
      if (!omdbResult && year) omdbResult = await tryOMDB(title, null);
      if (!omdbResult && cleaned) omdbResult = await tryOMDB(cleaned, year);
      if (!omdbResult && cleaned && year) omdbResult = await tryOMDB(cleaned, null);
      if (!omdbResult && firstWords) omdbResult = await tryOMDB(firstWords, year);
      if (!omdbResult && firstWords && year) omdbResult = await tryOMDB(firstWords, null);
    }

    // Log all attempts
    // Metadata search attempts: attemptedTitles.join(' | ')

    // Return the best result found
    return tmdbResult || omdbResult || null;
  }

  // Get comprehensive TV show metadata from TMDB
  async getTVShowMetadata(title, year = null) {
    if (!this.tmdbApiKey) {
      // TMDB API key not configured
      return null;
    }

    try {
      // Searching TMDB for TV show
      const searchQuery = title;
      let searchUrl = `${this.tmdbBaseUrl}/search/tv?api_key=${this.tmdbApiKey}&query=${encodeURIComponent(searchQuery)}`;
      
      // Add year as a separate parameter if available
      if (year) {
        searchUrl += `&first_air_date_year=${year}`;
      }
      
      const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
      const results = searchResponse.data.results;
      
      if (!results || results.length === 0) {
        // No TMDB TV show results found
        return null;
      }

      const tvShow = results[0]; // Take the first result
      // Found TV show: tvShow.name (tvShow.first_air_date)

      // Step 2: Get detailed TV show information
      const detailsUrl = `${this.tmdbBaseUrl}/tv/${tvShow.id}?api_key=${this.tmdbApiKey}&append_to_response=credits,keywords,videos,content_ratings`;
      const detailsResponse = await axios.get(detailsUrl, { timeout: 10000 });
      const details = detailsResponse.data;

      // Step 3: Process and structure the metadata
      const metadata = this.processTVShowData(details);
      
      // Fetched comprehensive TV show metadata for: metadata.title
      return metadata;

    } catch (error) {
      // TMDB TV show metadata fetch failed
      return null;
    }
  }

  // Process raw TMDB data into structured metadata
  processMovieData(tmdbData) {
    const metadata = {
      // Basic Information
      title: tmdbData.title || 'Unknown Title',
      originalTitle: tmdbData.original_title,
      description: tmdbData.overview || '',
      releaseDate: tmdbData.release_date,
      runtime: tmdbData.runtime, // in minutes
      
      // Ratings and Popularity
      tmdbRating: tmdbData.vote_average,
      tmdbVoteCount: tmdbData.vote_count,
      popularity: tmdbData.popularity,
      
      // Production Details
      budget: tmdbData.budget,
      revenue: tmdbData.revenue,
      status: tmdbData.status, // Released, Post Production, etc.
      
      // Languages and Countries
      originalLanguage: tmdbData.original_language,
      spokenLanguages: tmdbData.spoken_languages?.map(lang => lang.english_name).join(', '),
      productionCountries: tmdbData.production_countries?.map(country => country.name).join(', '),
      
      // Companies
      productionCompanies: tmdbData.production_companies?.map(company => company.name).join(', '),
      
      // Genres and Keywords
      genres: tmdbData.genres?.map(genre => genre.name) || [],
      keywords: tmdbData.keywords?.keywords?.map(keyword => keyword.name) || [],
      
      // Cast and Crew
      director: this.extractDirector(tmdbData.credits),
      cast: this.extractMainCast(tmdbData.credits, 5), // Top 5 actors
      writer: this.extractWriter(tmdbData.credits),
      producer: this.extractProducer(tmdbData.credits),
      
      // Content Rating
      contentRating: this.extractContentRating(tmdbData.release_dates),
      
      // Images
      posterPath: tmdbData.poster_path,
      backdropPath: tmdbData.backdrop_path,
      
      // Videos (trailers, etc.)
      trailers: this.extractTrailers(tmdbData.videos),
      
      // Additional metadata
      tmdbId: tmdbData.id,
      imdbId: tmdbData.imdb_id,
      homepage: tmdbData.homepage,
      tagline: tmdbData.tagline
    };

    return metadata;
  }

  // Process raw TMDB TV show data into structured metadata
  processTVShowData(tmdbData) {
    const metadata = {
      // Basic Information
      title: tmdbData.name || 'Unknown Title',
      originalTitle: tmdbData.original_name,
      description: tmdbData.overview || '',
      firstAirDate: tmdbData.first_air_date,
      lastAirDate: tmdbData.last_air_date,
      numberOfSeasons: tmdbData.number_of_seasons,
      numberOfEpisodes: tmdbData.number_of_episodes,
      episodeRunTime: tmdbData.episode_run_time?.[0], // Average episode runtime
      
      // Ratings and Popularity
      tmdbRating: tmdbData.vote_average,
      tmdbVoteCount: tmdbData.vote_count,
      popularity: tmdbData.popularity,
      
      // Production Details
      status: tmdbData.status, // Ended, Returning Series, etc.
      type: tmdbData.type, // Scripted, Reality, etc.
      
      // Languages and Countries
      originalLanguage: tmdbData.original_language,
      spokenLanguages: tmdbData.spoken_languages?.map(lang => lang.english_name).join(', '),
      originCountry: tmdbData.origin_country?.join(', '),
      
      // Networks and Companies
      networks: tmdbData.networks?.map(network => network.name).join(', '),
      productionCompanies: tmdbData.production_companies?.map(company => company.name).join(', '),
      
      // Genres and Keywords
      genres: tmdbData.genres?.map(genre => genre.name) || [],
      keywords: tmdbData.keywords?.results?.map(keyword => keyword.name) || [],
      
      // Cast and Crew
      creator: this.extractCreator(tmdbData.created_by),
      cast: this.extractMainCast(tmdbData.credits, 5), // Top 5 actors
      
      // Content Rating
      contentRating: this.extractTVContentRating(tmdbData.content_ratings),
      
      // Images
      posterPath: tmdbData.poster_path,
      backdropPath: tmdbData.backdrop_path,
      
      // Videos (trailers, etc.)
      trailers: this.extractTrailers(tmdbData.videos),
      
      // Seasons info
      seasons: tmdbData.seasons?.map(season => ({
        seasonNumber: season.season_number,
        name: season.name,
        overview: season.overview,
        episodeCount: season.episode_count,
        airDate: season.air_date,
        posterPath: season.poster_path
      })) || [],
      
      // Additional metadata
      tmdbId: tmdbData.id,
      homepage: tmdbData.homepage,
      tagline: tmdbData.tagline,
      inProduction: tmdbData.in_production
    };

    return metadata;
  }

  // Extract creator from TV show data
  extractCreator(createdBy) {
    if (!createdBy || createdBy.length === 0) return null;
    return createdBy.map(creator => creator.name).join(', ');
  }

  // Extract TV content rating
  extractTVContentRating(contentRatings) {
    if (!contentRatings?.results) return null;
    
    // Look for US rating first
    const usRating = contentRatings.results.find(rating => rating.iso_3166_1 === 'US');
    if (usRating?.rating) return usRating.rating;
    
    // Fallback to any available rating
    for (const rating of contentRatings.results) {
      if (rating.rating) return rating.rating;
    }
    
    return null;
  }

  // Extract director from credits
  extractDirector(credits) {
    if (!credits?.crew) return null;
    const director = credits.crew.find(person => person.job === 'Director');
    return director ? director.name : null;
  }

  // Extract main cast
  extractMainCast(credits, limit = 5) {
    if (!credits?.cast) return [];
    return credits.cast
      .slice(0, limit)
      .map(actor => ({
        name: actor.name,
        character: actor.character,
        order: actor.order
      }));
  }

  // Extract writer
  extractWriter(credits) {
    if (!credits?.crew) return null;
    const writer = credits.crew.find(person => 
      person.job === 'Writer' || 
      person.job === 'Screenplay' || 
      person.job === 'Story'
    );
    return writer ? writer.name : null;
  }

  // Extract producer
  extractProducer(credits) {
    if (!credits?.crew) return null;
    const producer = credits.crew.find(person => person.job === 'Producer');
    return producer ? producer.name : null;
  }

  // Extract content rating (PG, PG-13, R, etc.)
  extractContentRating(releaseDates) {
    if (!releaseDates?.results) return null;
    
    // Look for US rating first
    const usRelease = releaseDates.results.find(release => release.iso_3166_1 === 'US');
    if (usRelease?.release_dates?.length > 0) {
      const rating = usRelease.release_dates[0].certification;
      if (rating) return rating;
    }
    
    // Fallback to any available rating
    for (const release of releaseDates.results) {
      if (release.release_dates?.length > 0) {
        const rating = release.release_dates[0].certification;
        if (rating) return rating;
      }
    }
    
    return null;
  }

  // Extract trailer URLs
  extractTrailers(videos) {
    if (!videos?.results) return [];
    
    return videos.results
      .filter(video => video.type === 'Trailer' && video.site === 'YouTube')
      .slice(0, 3) // Top 3 trailers
      .map(video => ({
        name: video.name,
        key: video.key,
        url: `https://www.youtube.com/watch?v=${video.key}`
      }));
  }

  // Get technical metadata from video file
  async getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          // FFprobe failed
          resolve(null);
          return;
        }

        try {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
          
          const techMetadata = {
            // File info
            duration: Math.round(metadata.format.duration), // seconds
            fileSize: parseInt(metadata.format.size),
            bitrate: parseInt(metadata.format.bit_rate),
            
            // Video info
            videoCodec: videoStream?.codec_name,
            resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
            frameRate: videoStream?.r_frame_rate,
            aspectRatio: videoStream?.display_aspect_ratio,
            
            // Audio info
            audioCodec: audioStream?.codec_name,
            audioChannels: audioStream?.channels,
            audioSampleRate: audioStream?.sample_rate,
            
            // Container
            container: metadata.format.format_name
          };

          resolve(techMetadata);
        } catch (error) {
          // Error processing video metadata
          resolve(null);
        }
      });
    });
  }

  // Combine TMDB metadata with technical metadata
  async getCompleteMetadata(filename, filePath, category = 'movie') {
    
    // Extract title and year from filename
    const title = this.extractTitle(filename);
    const year = this.extractYear(filename);
    
    // Extract season/episode info for TV shows
    const seasonEpisode = category === 'tv-show' ? this.extractSeasonEpisode(filename) : null;
    
    // Get metadata from TMDB based on category
    let tmdbMetadata = null;
    if (category === 'tv-show') {
      tmdbMetadata = await this.getTVShowMetadata(title, year);
    } else {
      tmdbMetadata = await this.getMovieMetadata(title, year);
    }
    
    // Get technical metadata from file
    const techMetadata = await this.getVideoMetadata(filePath);
    
    // Combine both
    const completeMetadata = {
      // Original filename info
      originalFilename: filename,
      extractedTitle: title,
      extractedYear: year,
      category: category,
      
      // Season/Episode info for TV shows
      ...(seasonEpisode && {
        season: seasonEpisode.season,
        episode: seasonEpisode.episode,
        episodeTitle: seasonEpisode.episodeTitle
      }),
      
      // TMDB metadata
      ...(tmdbMetadata || {}),
      
      // Technical metadata (from file)
      technical: techMetadata,
      
      // Processing info
      metadataFetchedAt: new Date().toISOString(),
      tmdbDataAvailable: !!tmdbMetadata,
      technicalDataAvailable: !!techMetadata
    };

    return completeMetadata;
  }

  // Legacy method for backward compatibility
  async getCompleteMovieMetadata(filename, filePath) {
    return this.getCompleteMetadata(filename, filePath, 'movie');
  }

  // Format metadata for database storage
  formatForDatabase(metadata) {
    // Create tags from genres and keywords
    const tags = [metadata.category || 'movie']; // Use the actual category
    
    if (metadata.genres?.length > 0) {
      tags.push(...metadata.genres);
    }
    
    if (metadata.keywords?.length > 0) {
      // Add top 3 keywords
      tags.push(...metadata.keywords.slice(0, 3));
    }

    // For TV shows, use different metadata structure
    const isTV = metadata.category === 'tv-show';
    
    return {
      title: metadata.title || metadata.extractedTitle,
      description: metadata.description || '',
      tags: tags.join(','),
      duration: metadata.technical?.duration || (isTV ? metadata.episodeRunTime * 60 : null), // Convert minutes to seconds for TV
      file_size: metadata.technical?.fileSize || null,
      resolution: metadata.technical?.resolution || null,
      
      // Extended metadata (JSON)
      extended_metadata: JSON.stringify({
        tmdb: {
          id: metadata.tmdbId,
          imdb_id: metadata.imdbId,
          rating: metadata.tmdbRating,
          vote_count: metadata.tmdbVoteCount,
          popularity: metadata.popularity,
          ...(isTV ? {
            first_air_date: metadata.firstAirDate,
            last_air_date: metadata.lastAirDate,
            number_of_seasons: metadata.numberOfSeasons,
            number_of_episodes: metadata.numberOfEpisodes,
            episode_run_time: metadata.episodeRunTime,
            status: metadata.status,
            type: metadata.type,
            networks: metadata.networks,
            in_production: metadata.inProduction
          } : {
            release_date: metadata.releaseDate,
            runtime: metadata.runtime,
            budget: metadata.budget,
            revenue: metadata.revenue
          }),
          tagline: metadata.tagline,
          homepage: metadata.homepage
        },
        production: {
          ...(isTV ? {
            creator: metadata.creator,
            networks: metadata.networks
          } : {
            director: metadata.director,
            writer: metadata.writer,
            producer: metadata.producer
          }),
          cast: metadata.cast,
          companies: metadata.productionCompanies,
          countries: isTV ? metadata.originCountry : metadata.productionCountries,
          languages: metadata.spokenLanguages
        },
        technical: metadata.technical,
        content_rating: metadata.contentRating,
        trailers: metadata.trailers,
        ...(isTV && metadata.seasons && {
          seasons: metadata.seasons
        }),
        fetched_at: metadata.metadataFetchedAt
      })
    };
  }
}

module.exports = MovieMetadataService; 
