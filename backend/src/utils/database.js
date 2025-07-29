const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DatabaseConfig = require('../config/database');

class Database {
  constructor() {
    this.db = null;
    this.dbConfig = new DatabaseConfig();
    this.databaseType = this.dbConfig.databaseType;
    this.knex = null;
  }

  // Initialize database connection
  async connect() {
    try {
      if (this.databaseType === 'sqlite') {
        await this.connectSQLite();
      } else if (this.databaseType === 'postgresql') {
        await this.connectPostgreSQL();
      } else {
        throw new Error(`Unsupported database type: ${this.databaseType}`);
      }
      
      // Connected to database successfully
      await this.initializeTables();
    } catch (error) {
      console.error(`❌ Database connection failed:`, error);
      throw error;
    }
  }

  async connectSQLite() {
    return new Promise((resolve, reject) => {
      const dbPath = process.env.NODE_ENV === 'production' 
        ? path.join(__dirname, '../../database/media_server.db')
        : path.join(__dirname, '../../database/media_server_dev.db');

      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async connectPostgreSQL() {
    const knex = require('knex');
    const config = this.dbConfig.getPostgreSQLConfig();
    
    this.knex = knex({
      client: 'pg',
      connection: {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.options.ssl
      },
      pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 10000
      },
      migrations: {
        directory: './database/migrations'
      },
      seeds: {
        directory: './database/seeds'
      }
    });

    // Test connection
    await this.knex.raw('SELECT 1');
  }

  // Initialize database tables
  async initializeTables() {
    // Skip table initialization for PostgreSQL since tables are created by migrations
    if (this.databaseType === 'postgresql') {
      return;
    }
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NULL,
        profile_picture TEXT NULL,
        bio TEXT NULL,
        role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
        is_admin BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        email_verified_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Migration: Add missing columns to existing users table
    const addMissingColumns = async () => {
      try {
        // Check if profile_picture column exists
        const tableInfo = await this.query("PRAGMA table_info(users)");
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('display_name')) {
          await this.query("ALTER TABLE users ADD COLUMN display_name TEXT NULL");
        }
        
        if (!columnNames.includes('profile_picture')) {
          await this.query("ALTER TABLE users ADD COLUMN profile_picture TEXT NULL");
        }
        
        if (!columnNames.includes('bio')) {
          await this.query("ALTER TABLE users ADD COLUMN bio TEXT NULL");
        }
        
        if (!columnNames.includes('token_version')) {
          await this.query("ALTER TABLE users ADD COLUMN token_version TEXT NULL");
        }

        // Add role column and migrate existing is_admin values
        if (!columnNames.includes('role')) {
          await this.query("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
          
          // Migrate existing admin users to admin role
          await this.query("UPDATE users SET role = 'admin' WHERE is_admin = 1");
        }

        // Check and add extended_metadata column to media_content table
        const mediaTableInfo = await this.query("PRAGMA table_info(media_content)");
        const mediaColumnNames = mediaTableInfo.map(col => col.name);
        
        if (!mediaColumnNames.includes('extended_metadata')) {
          await this.query("ALTER TABLE media_content ADD COLUMN extended_metadata TEXT NULL");
        }

        if (!mediaColumnNames.includes('season_number')) {
          await this.query("ALTER TABLE media_content ADD COLUMN season_number INTEGER NULL");
        }

        if (!mediaColumnNames.includes('episode_number')) {
          await this.query("ALTER TABLE media_content ADD COLUMN episode_number INTEGER NULL");
        }

        if (!mediaColumnNames.includes('episode_title')) {
          await this.query("ALTER TABLE media_content ADD COLUMN episode_title TEXT NULL");
        }

        if (!mediaColumnNames.includes('show_title')) {
          await this.query("ALTER TABLE media_content ADD COLUMN show_title TEXT NULL");
        }
              } catch (error) {
          // Could not add columns (table may not exist yet)
        }
    };

    const createPasswordResetTable = `
      CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createPasswordChangeTable = `
      CREATE TABLE IF NOT EXISTS password_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    const createInviteTokensTable = `
      CREATE TABLE IF NOT EXISTS invite_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        created_by INTEGER,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        used_by INTEGER NULL,
        max_uses INTEGER DEFAULT 1,
        current_uses INTEGER DEFAULT 0,
        is_indefinite BOOLEAN DEFAULT 0,
        last_renewed_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id),
        FOREIGN KEY (used_by) REFERENCES users (id)
      )
    `;

    const createEmailVerificationTable = `
      CREATE TABLE IF NOT EXISTS email_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        invite_token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        verified BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        device_info TEXT,
        browser_info TEXT,
        ip_address TEXT,
        location TEXT,
        user_agent TEXT,
        is_active BOOLEAN DEFAULT 1,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    const createMediaTable = `
      CREATE TABLE IF NOT EXISTS media_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK (media_type IN ('video', 'audio', 'image', 'document')),
        duration INTEGER, -- in seconds for video/audio
        resolution TEXT, -- e.g., "1920x1080" for video
        thumbnail_path TEXT,
        status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error', 'transcoding')),
        published BOOLEAN DEFAULT FALSE,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        uploaded_by INTEGER NOT NULL,
        views INTEGER DEFAULT 0,
        metadata TEXT, -- JSON string for additional metadata
        tags TEXT, -- comma-separated tags
        FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE CASCADE
      )
    `;

    const createTranscodingJobsTable = `
      CREATE TABLE IF NOT EXISTS transcoding_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        quality TEXT NOT NULL, -- e.g., "720p", "1080p", "480p"
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        output_path TEXT,
        progress INTEGER DEFAULT 0, -- percentage 0-100
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (media_id) REFERENCES media_content (id) ON DELETE CASCADE
      )
    `;

    const createPlaylistsTable = `
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_public BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
      )
    `;

    const createPlaylistItemsTable = `
      CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
        FOREIGN KEY (media_id) REFERENCES media_content (id) ON DELETE CASCADE,
        UNIQUE(playlist_id, media_id)
      )
    `;

    // Enhanced transcoding tracking table
    const createTranscodedFilesTable = `
      CREATE TABLE IF NOT EXISTS transcoded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_path TEXT NOT NULL UNIQUE,
        original_size INTEGER NOT NULL,
        original_codec TEXT,
        transcoded_path TEXT NOT NULL,
        transcoded_size INTEGER NOT NULL,
        quality_level TEXT NOT NULL, -- e.g., "1080p", "720p"
        compression_ratio REAL NOT NULL, -- percentage saved
        transcoded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_verified DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        checksum TEXT, -- for integrity verification
        metadata TEXT -- JSON for additional info
      )
    `;

    // Deletion scheduler table
    const createDeletionScheduleTable = `
      CREATE TABLE IF NOT EXISTS deletion_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL CHECK (file_type IN ('original', 'transcoded', 'thumbnail', 'metadata')),
        media_id INTEGER, -- NULL if file not in media_content
        scheduled_for DATETIME NOT NULL,
        reason TEXT NOT NULL, -- 'content_removed', 'replaced_by_transcode', 'cleanup'
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER DEFAULT 0,
        last_attempt DATETIME,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (media_id) REFERENCES media_content (id) ON DELETE SET NULL
      )
    `;

    // Storage analytics cache table for real-time dashboard updates
    const createStorageAnalyticsTable = `
      CREATE TABLE IF NOT EXISTS storage_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL UNIQUE,
        metric_value TEXT NOT NULL, -- JSON string for complex values
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME -- for cache expiration
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createUsersTable, async (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Run migration to add missing columns
          await addMissingColumns();
        });

        this.db.run(createPasswordResetTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createPasswordChangeTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createInviteTokensTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createEmailVerificationTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createSessionsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createMediaTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createTranscodingJobsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createPlaylistsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createPlaylistItemsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createTranscodedFilesTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createDeletionScheduleTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        this.db.run(createStorageAnalyticsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        const createMonthlyBandwidthTable = `
          CREATE TABLE IF NOT EXISTS monthly_bandwidth (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT,
            total_bandwidth_gb REAL DEFAULT 0,
            total_streams INTEGER DEFAULT 0,
            total_duration_seconds INTEGER DEFAULT 0,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          )
        `;

        this.db.run(createMonthlyBandwidthTable, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  }

  // Generic query method that works with both SQLite and PostgreSQL
  async query(sql, params = []) {
    try {
      // Ensure params is always an array
      const safeParams = Array.isArray(params) ? params : [];
      
      if (this.databaseType === 'sqlite') {
        return await this.querySQLite(sql, safeParams);
      } else if (this.databaseType === 'postgresql') {
        return await this.queryPostgreSQL(sql, safeParams);
      }
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async querySQLite(sql, params = []) {
    return new Promise((resolve, reject) => {
      const safeParams = Array.isArray(params) ? params : [];
      this.db.all(sql, safeParams, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async queryPostgreSQL(sql, params = []) {
    // Use Knex query builder for simple SELECT queries to avoid parameter binding issues
    const sqlLower = sql.toLowerCase().trim();
    
    // Handle simple bandwidth query for session management
    if (sqlLower.includes('select bandwidth from streaming_sessions where id = ?')) {
      return await this.knex('streaming_sessions')
        .select('bandwidth')
        .where('id', params[0]);
    }
    
    // Handle session bandwidth query with status filter
    if (sqlLower.includes('select bandwidth from streaming_sessions where id = ? and status = ?')) {
      return await this.knex('streaming_sessions')
        .select('bandwidth')
        .where('id', params[0])
        .where('status', params[1]);
    }
    
    // Handle session existence check with status filter
    if (sqlLower.includes('select * from streaming_sessions where id = ? and status = ?')) {
      return await this.knex('streaming_sessions')
        .where('id', params[0])
        .where('status', params[1]);
    }
    
    // Handle session existence check without status filter (for debugging)
    if (sqlLower.includes('select id, status, username, title from streaming_sessions where id = ?')) {
      return await this.knex('streaming_sessions')
        .select('id', 'status', 'username', 'title')
        .where('id', params[0]);
    }
    
    // Handle monthly bandwidth record queries
    if (sqlLower.includes('select * from monthly_bandwidth where user_id = ? and period_start = ?')) {
      return await this.knex('monthly_bandwidth')
        .where('user_id', params[0])
        .where('period_start', params[1]);
    }
    
    if (sqlLower.includes('select * from monthly_bandwidth where id = ?')) {
      return await this.knex('monthly_bandwidth')
        .where('id', params[0]);
    }
    
    if (sqlLower.includes('select') && 
        sqlLower.includes('user_id, username, total_bandwidth_gb, total_streams, total_duration_seconds, period_start, period_end') &&
        sqlLower.includes('from monthly_bandwidth') &&
        sqlLower.includes('where period_start = ?') &&
        sqlLower.includes('order by total_bandwidth_gb desc')) {
      return await this.knex('monthly_bandwidth')
        .select('user_id', 'username', 'total_bandwidth_gb', 'total_streams', 'total_duration_seconds', 'period_start', 'period_end')
        .where('period_start', params[0])
        .orderBy('total_bandwidth_gb', 'desc');
    }
    
    // Handle streaming settings queries
    if (sqlLower.includes('select * from streaming_settings order by id desc limit 1')) {
      return await this.knex('streaming_settings')
        .orderBy('id', 'desc')
        .limit(1);
    }
    
    // Handle admin whitelist queries
    if (sqlLower.includes('select id, username, email, display_name, role, is_admin from users') && 
        sqlLower.includes('where (role in (\'admin\', \'manager\') or is_admin = 1)') &&
        sqlLower.includes('and is_active = 1') &&
        sqlLower.includes('and email_verified = 1')) {
      return await this.knex('users')
        .select('id', 'username', 'email', 'display_name', 'role', 'is_admin')
        .where(function() {
          this.where('role', 'admin')
              .orWhere('role', 'manager')
              .orWhere('is_admin', 1);
        })
        .where('is_active', 1)
        .where('email_verified', 1)
        .orderBy('role', 'desc')
        .orderBy('username', 'asc');
    }
    
    // Handle admin status check queries
    if (sqlLower.includes('select id, role, is_admin from users where id = ? and is_active = 1')) {
      return await this.knex('users')
        .select('id', 'role', 'is_admin')
        .where('id', params[0])
        .where('is_active', 1);
    }
    
    // Handle streaming queries
    if (sqlLower.includes('select id, user_id, username, media_id, title, quality, bandwidth, start_time, client_ip from streaming_sessions where status = ?')) {
      return await this.knex('streaming_sessions')
        .select('id', 'user_id', 'username', 'media_id', 'title', 'quality', 'bandwidth', 'start_time', 'client_ip')
        .where('status', params[0]);
    }
    
    if (sqlLower.includes('select * from streaming_sessions where id = ? and status = ?')) {
      return await this.knex('streaming_sessions')
        .where('id', params[0])
        .where('status', params[1]);
    }
    
    if (sqlLower.includes('select id from streaming_sessions where user_id = ? and media_id = ? and status = ?')) {
      return await this.knex('streaming_sessions')
        .select('id')
        .where('user_id', params[0])
        .where('media_id', params[1])
        .where('status', params[2]);
    }
    
    if (sqlLower.includes('select sum(bandwidth) as total_bandwidth from streaming_sessions where user_id = ? and status = ?')) {
      return await this.knex('streaming_sessions')
        .sum('bandwidth as total_bandwidth')
        .where('user_id', params[0])
        .where('status', params[1]);
    }
    
    // Handle bandwidth investigation session queries (with dynamic filters)
    if (sqlLower.includes('select') && 
        sqlLower.includes('id, user_id, username, title, quality, bandwidth') && 
        sqlLower.includes('from streaming_sessions') && 
        sqlLower.includes('where bandwidth > 0') && 
        sqlLower.includes('order by start_time desc') && 
        sqlLower.includes('limit')) {
      
      let query = this.knex('streaming_sessions')
        .select('id', 'user_id', 'username', 'title', 'quality', 'bandwidth', 'start_time', 'end_time', 'duration', 'status', 'client_ip')
        .where('bandwidth', '>', 0);
      
      // Check for additional filters
      let paramIndex = 0;
      
      if (sqlLower.includes('and user_id = ?')) {
        query = query.where('user_id', params[paramIndex]);
        paramIndex++;
      }
      
      if (sqlLower.includes('and username = ?')) {
        query = query.where('username', params[paramIndex]);
        paramIndex++;
      }
      
      if (sqlLower.includes('and start_time >= ? and start_time <= ?')) {
        query = query.where('start_time', '>=', params[paramIndex])
                     .where('start_time', '<=', params[paramIndex + 1]);
        paramIndex += 2;
      }
      
      return await query.orderBy('start_time', 'desc').limit(50);
    }
    
    // Handle user sessions details query (for details button)
    if (sqlLower.includes('select') && 
        sqlLower.includes('from streaming_sessions') && 
        sqlLower.includes('where user_id = ?') &&
        sqlLower.includes('bandwidth > 0') &&
        sqlLower.includes('order by start_time desc') && 
        sqlLower.includes('limit ?') &&
        params.length === 2) {
      
      return await this.knex('streaming_sessions')
        .select('id', 'title', 'quality', 'bandwidth', 'start_time', 'end_time', 'duration', 'status', 'client_ip')
        .where('user_id', params[0])
        .where('bandwidth', '>', 0)
        .orderBy('start_time', 'desc')
        .limit(params[1]);
    }
    
    // Handle user lookup query (for details button)
    if (sqlLower.includes('select username, email from users where id = ?') && params.length === 1) {
      return await this.knex('users')
        .select('username', 'email')
        .where('id', params[0]);
    }
    
    // Handle media content queries
    if (sqlLower.includes('select') && sqlLower.includes('from media_content mc') && sqlLower.includes('join users u on mc.uploaded_by = u.id')) {
      // Handle general media list query (getMediaList)
      if (sqlLower.includes('order by mc.upload_date desc')) {
        let query = this.knex('media_content as mc')
          .select('mc.*', 'u.username as uploader_name')
          .join('users as u', 'mc.uploaded_by', 'u.id');
        
        // Add role-based filtering for users
        if (sqlLower.includes('where mc.published = 1')) {
          query = query.where('mc.published', true);
        }
        
        // Add media type filter
        if (sqlLower.includes('and mc.media_type = ?')) {
          const mediaTypeIndex = sqlLower.split('and mc.media_type = ?')[0].split('?').length - 1;
          query = query.where('mc.media_type', params[mediaTypeIndex]);
        }
        
        // Add category filter
        if (sqlLower.includes('and mc.tags like ?')) {
          const tagsIndex = sqlLower.split('and mc.tags like ?')[0].split('?').length - 1;
          query = query.where('mc.tags', 'like', params[tagsIndex]);
        }
        
        // Add search filter
        if (sqlLower.includes('and (mc.title like ? or mc.description like ? or mc.tags like ?)')) {
          const searchIndex = sqlLower.split('and (mc.title like ? or mc.description like ? or mc.tags like ?)')[0].split('?').length - 1;
          const searchTerm = params[searchIndex];
          query = query.where(function() {
            this.where('mc.title', 'like', searchTerm)
                 .orWhere('mc.description', 'like', searchTerm)
                 .orWhere('mc.tags', 'like', searchTerm);
          });
        }
        
        // Add limit
        if (sqlLower.includes('limit ?')) {
          const limitIndex = params.length - 1;
          query = query.limit(params[limitIndex]);
        }
        
        return await query.orderBy('mc.upload_date', 'desc');
      }
      
      // Handle TV shows organized query (specific pattern from getTVShowsOrganized)
      if (sqlLower.includes('where mc.tags like \'%tv-show%\' and mc.media_type = \'video\'')) {
        let query = this.knex('media_content as mc')
          .select('mc.*', 'u.username as uploader_name')
          .join('users as u', 'mc.uploaded_by', 'u.id')
          .where('mc.tags', 'like', '%tv-show%')
          .where('mc.media_type', 'video');
        
        // Add role-based filtering if params include published = 1
        if (params.length > 0 && sqlLower.includes('and mc.published = 1')) {
          query = query.where('mc.published', true);
        }
        
        return await query.orderBy(['mc.show_title', 'mc.season_number', 'mc.episode_number']);
      }
      
      if (sqlLower.includes('where mc.tags like ?')) {
        // Movie/TV show listing query - handle both movie% and tv-show% patterns
        return await this.knex('media_content as mc')
          .select('mc.*', 'u.username as uploader_name')
          .join('users as u', 'mc.uploaded_by', 'u.id')
          .where('mc.tags', 'like', params[0])
          .orderBy('mc.upload_date', 'desc');
      }
      
      if (sqlLower.includes('where mc.id = ?')) {
        // Single media item query
        return await this.knex('media_content as mc')
          .select('mc.*', 'u.username as uploader_name', 'u.display_name as uploader_display_name')
          .join('users as u', 'mc.uploaded_by', 'u.id')
          .where('mc.id', params[0]);
      }
      
      // Handle TV show episodes query (getTVShowEpisodes) - multiple pattern checks
      if ((sqlLower.includes('(mc.show_title like ? or mc.title like ?)') && 
           sqlLower.includes('mc.season_number = ?') && 
           sqlLower.includes('mc.media_type = \'video\'')) ||
          (sqlLower.includes('mc.show_title like ?') && 
           sqlLower.includes('mc.title like ?') && 
           sqlLower.includes('mc.season_number = ?') && 
           params.length === 3)) {
           
        let query = this.knex('media_content as mc')
          .select('mc.*', 'u.username as uploader_name')
          .join('users as u', 'mc.uploaded_by', 'u.id')
          .where(function() {
            this.where('mc.show_title', 'like', params[0])
                .orWhere('mc.title', 'like', params[1]);
          })
          .where('mc.season_number', params[2])
          .where('mc.media_type', 'video');
        
        // Add role-based filtering if the query includes published = 1
        if (sqlLower.includes('and mc.published = 1')) {
          query = query.where('mc.published', true);
        }
        
        return await query.orderBy('mc.episode_number');
      }
    }
    
          // Handle content listing query (for home page, movies, etc.)
      if (sqlLower.includes('select mc.*, u.username as uploader_name from media_content mc join users u on mc.uploaded_by = u.id') && 
          sqlLower.includes('order by mc.upload_date desc limit ?') && 
          params.length === 1) {
        
        let query = this.knex('media_content as mc')
          .select('mc.*', 'u.username as uploader_name')
          .join('users as u', 'mc.uploaded_by', 'u.id');
        
        // Add WHERE clauses if they exist
        if (sqlLower.includes('where mc.media_type = \'video\'')) {
          query = query.where('mc.media_type', 'video');
        }
        if (sqlLower.includes('and mc.published = 1')) {
          query = query.where('mc.published', true);
        }
        if (sqlLower.includes('and mc.tags like \'%movie%\'')) {
          query = query.where('mc.tags', 'like', '%movie%');
        }
        if (sqlLower.includes('and mc.tags like \'%tv-show%\'')) {
          query = query.where('mc.tags', 'like', '%tv-show%');
        }
        
        return await query.orderBy('mc.upload_date', 'desc').limit(params[0]);
      }

      // Handle transcoding job lookup by input path
      if (sqlLower.includes('select * from transcoding_jobs where input_path = ?') && 
          sqlLower.includes('order by created_at desc limit 1') && 
          params.length === 1) {
        
        return await this.knex('transcoding_jobs')
          .select('*')
          .where('input_path', params[0])
          .orderBy('created_at', 'desc')
          .limit(1);
      }

      // Handle transcoding job queue retrieval
      if (sqlLower.includes('select * from transcoding_jobs') && 
          sqlLower.includes('where status = \'queued\'') && 
          sqlLower.includes('order by priority desc, created_at asc') && 
          params.length === 1) {
        
        return await this.knex('transcoding_jobs')
          .select('*')
          .where('status', 'queued')
          .orderBy('priority', 'desc')
          .orderBy('created_at', 'asc')
          .limit(params[0]);
      }

      // Handle transcoding job retrieval by ID
      if (sqlLower.includes('select * from transcoding_jobs where id = ?') && 
          params.length === 1) {
        
        return await this.knex('transcoding_jobs')
          .select('*')
          .where('id', params[0]);
      }

      // Handle transcoding job status update (3 parameters)
      if (sqlLower.includes('update transcoding_jobs set status = ?, progress = ? where id = ?') && 
          params.length === 3) {
        
        return await this.knex('transcoding_jobs')
          .where('id', params[2])
          .update({
            status: params[0],
            progress: params[1],
            updated_at: new Date()
          });
      }

      // Handle transcoding job status update with error and completion (5 parameters)
      if (sqlLower.includes('update transcoding_jobs set status = ?, progress = ?, error_message = ?, completed_at = ? where id = ?') && 
          params.length === 5) {
        
        return await this.knex('transcoding_jobs')
          .where('id', params[4])
          .update({
            status: params[0],
            progress: params[1],
            error_message: params[2],
            completed_at: params[3],
            updated_at: new Date()
          });
      }

      // Handle transcoding job status update with started_at (4 parameters)
      if (sqlLower.includes('update transcoding_jobs set status = ?, progress = ?, started_at = ? where id = ?') && 
          params.length === 4) {
        
        return await this.knex('transcoding_jobs')
          .where('id', params[3])
          .update({
            status: params[0],
            progress: params[1],
            started_at: params[2],
            updated_at: new Date()
          });
      }

      // Handle transcoding job attempts increment
      if (sqlLower.includes('update transcoding_jobs set attempts = attempts + 1 where id = ?') && 
          params.length === 1) {
        
        return await this.knex('transcoding_jobs')
          .where('id', params[0])
          .increment('attempts', 1)
          .update('updated_at', new Date());
      }

      // Handle transcoding job insertion
      if (sqlLower.includes('insert into transcoding_jobs') && 
          params.length === 8) {
        const [id, inputPath, qualities, status, priorityStr, attempts, maxAttempts, settings] = params;
        
        // Convert priority string to integer for PostgreSQL
        const priorityMap = {
          'low': 1,
          'normal': 2,
          'high': 3,
          'urgent': 4
        };
        const priority = priorityMap[priorityStr] || 2; // Default to normal (2)
        
        const result = await this.knex('transcoding_jobs')
          .insert({
            id: id,
            input_path: inputPath,
            qualities: qualities,
            status: status,
            priority: priority,
            attempts: attempts,
            max_attempts: maxAttempts,
            settings: settings,
            created_at: new Date(),
            updated_at: new Date()
          })
          .returning('*');
        
        return result;
      }
    
    // Handle TV show specific queries (if any unique patterns exist)
    if (sqlLower.includes('tv-show') || sqlLower.includes('tv_show')) {
      if (sqlLower.includes('select') && sqlLower.includes('from media_content') && sqlLower.includes('where tags like ?')) {
        return await this.knex('media_content')
          .select('*')
          .where('tags', 'like', params[0])
          .orderBy('upload_date', 'desc');
      }
    }
    
    // Handle simple media content queries
    if (sqlLower.includes('select * from media_content where id = ?')) {
      return await this.knex('media_content').where('id', params[0]);
    }
    
    if (sqlLower.includes('select * from media_content where tags like ?')) {
      return await this.knex('media_content')
        .where('tags', 'like', params[0])
        .orderBy([
          { column: 'upload_date', order: 'desc' },
          { column: 'id', order: 'desc' }
        ]);
    }
    
    // Handle DELETE queries
    if (sqlLower.startsWith('delete from ')) {
      const tableMatch = sqlLower.match(/delete from (\w+)/);
      if (tableMatch && sqlLower.includes('where id = ?')) {
        const tableName = tableMatch[1];
        const result = await this.knex(tableName).where('id', params[0]).del();
        return [{ changes: result || 0 }];
      }
    }
    
    // Handle monthly bandwidth queries
    if (sqlLower.includes('select') && sqlLower.includes('from monthly_bandwidth') && sqlLower.includes('where period_start = ?')) {
      return await this.knex('monthly_bandwidth')
        .select('user_id', 'username', 'total_bandwidth_gb', 'total_streams', 'total_duration_seconds', 'period_start', 'period_end')
        .where('period_start', params[0])
        .orderBy('total_bandwidth_gb', 'desc');
    }
    
    // Handle server bandwidth history query (GROUP BY with aggregations)
    if (sqlLower.includes('select') && 
        sqlLower.includes('sum(total_bandwidth_gb)') && 
        sqlLower.includes('from monthly_bandwidth') && 
        sqlLower.includes('group by period_start, period_end') && 
        sqlLower.includes('limit ?')) {
      return await this.knex('monthly_bandwidth')
        .select(
          'period_start',
          'period_end',
          this.knex.raw('SUM(total_bandwidth_gb) as total_bandwidth_gb'),
          this.knex.raw('SUM(total_streams) as total_streams'),
          this.knex.raw('SUM(total_duration_seconds) as total_duration_seconds'),
          this.knex.raw('COUNT(DISTINCT user_id) as active_users')
        )
        .groupBy('period_start', 'period_end')
        .orderBy('period_start', 'desc')
        .limit(params[0]);
    }
    
    // Handle user bandwidth history query
    if (sqlLower.includes('select') && 
        sqlLower.includes('from monthly_bandwidth') && 
        sqlLower.includes('where user_id = ?') && 
        sqlLower.includes('order by period_start desc') && 
        sqlLower.includes('limit ?') &&
        params.length === 2) {
      return await this.knex('monthly_bandwidth')
        .select('period_start', 'period_end', 'total_bandwidth_gb', 'total_streams', 'total_duration_seconds')
        .where('user_id', params[0])
        .orderBy('period_start', 'desc')
        .limit(params[1]);
    }
    
    // Handle bandwidth investigation GROUP BY queries with dynamic WHERE clauses
    
    // User breakdown query
    if (sqlLower.includes('select') && 
        sqlLower.includes('user_id, username') && 
        sqlLower.includes('count(*) as session_count') &&
        sqlLower.includes('sum(bandwidth) as total_bandwidth') &&
        sqlLower.includes('from streaming_sessions') && 
        sqlLower.includes('group by user_id, username') &&
        sqlLower.includes('where bandwidth > 0')) {
      
      let query = this.knex('streaming_sessions')
        .select(
          'user_id', 'username',
          this.knex.raw('COUNT(*) as session_count'),
          this.knex.raw('SUM(bandwidth) as total_bandwidth'),
          this.knex.raw('SUM(duration) as total_duration'),
          this.knex.raw('AVG(bandwidth) as avg_bandwidth_per_session'),
          this.knex.raw('MIN(start_time) as first_session'),
          this.knex.raw('MAX(start_time) as last_session')
        )
        .where('bandwidth', '>', 0);
      
      // Apply dynamic filters
      let paramIndex = 0;
      if (sqlLower.includes('and user_id = ?')) {
        query = query.where('user_id', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and username = ?')) {
        query = query.where('username', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and start_time >= ? and start_time <= ?')) {
        query = query.where('start_time', '>=', params[paramIndex])
                     .where('start_time', '<=', params[paramIndex + 1]);
        paramIndex += 2;
      }
      
      return await query.groupBy('user_id', 'username').orderBy('total_bandwidth', 'desc');
    }
    
    // Content breakdown query
    if (sqlLower.includes('select') && 
        sqlLower.includes('title') && 
        sqlLower.includes('count(*) as session_count') &&
        sqlLower.includes('sum(bandwidth) as total_bandwidth') &&
        sqlLower.includes('from streaming_sessions') && 
        sqlLower.includes('group by title') &&
        sqlLower.includes('where bandwidth > 0') &&
        sqlLower.includes('limit 20')) {
      
      let query = this.knex('streaming_sessions')
        .select(
          'title',
          this.knex.raw('COUNT(*) as session_count'),
          this.knex.raw('SUM(bandwidth) as total_bandwidth'),
          this.knex.raw('SUM(duration) as total_duration'),
          this.knex.raw('AVG(bandwidth) as avg_bandwidth_per_session')
        )
        .where('bandwidth', '>', 0);
      
      // Apply dynamic filters
      let paramIndex = 0;
      if (sqlLower.includes('and user_id = ?')) {
        query = query.where('user_id', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and username = ?')) {
        query = query.where('username', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and start_time >= ? and start_time <= ?')) {
        query = query.where('start_time', '>=', params[paramIndex])
                     .where('start_time', '<=', params[paramIndex + 1]);
        paramIndex += 2;
      }
      
      return await query.groupBy('title').orderBy('total_bandwidth', 'desc').limit(20);
    }
    
    // Daily breakdown query
    if (sqlLower.includes('select') && 
        sqlLower.includes('date(start_time) as date') && 
        sqlLower.includes('count(*) as session_count') &&
        sqlLower.includes('sum(bandwidth) as total_bandwidth') &&
        sqlLower.includes('from streaming_sessions') && 
        sqlLower.includes('group by date(start_time)') &&
        sqlLower.includes('where bandwidth > 0') &&
        sqlLower.includes('limit 30')) {
      
      let query = this.knex('streaming_sessions')
        .select(
          this.knex.raw('DATE(start_time) as date'),
          this.knex.raw('COUNT(*) as session_count'),
          this.knex.raw('SUM(bandwidth) as total_bandwidth'),
          this.knex.raw('SUM(duration) as total_duration')
        )
        .where('bandwidth', '>', 0);
      
      // Apply dynamic filters
      let paramIndex = 0;
      if (sqlLower.includes('and user_id = ?')) {
        query = query.where('user_id', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and username = ?')) {
        query = query.where('username', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and start_time >= ? and start_time <= ?')) {
        query = query.where('start_time', '>=', params[paramIndex])
                     .where('start_time', '<=', params[paramIndex + 1]);
        paramIndex += 2;
      }
      
      return await query.groupByRaw('DATE(start_time)').orderBy('date', 'desc').limit(30);
    }
    
    // Quality breakdown query
    if (sqlLower.includes('select') && 
        sqlLower.includes('quality') && 
        sqlLower.includes('count(*) as session_count') &&
        sqlLower.includes('sum(bandwidth) as total_bandwidth') &&
        sqlLower.includes('from streaming_sessions') && 
        sqlLower.includes('group by quality') &&
        sqlLower.includes('where bandwidth > 0') &&
        sqlLower.includes('and quality is not null')) {
      
      let query = this.knex('streaming_sessions')
        .select(
          'quality',
          this.knex.raw('COUNT(*) as session_count'),
          this.knex.raw('SUM(bandwidth) as total_bandwidth'),
          this.knex.raw('AVG(bandwidth) as avg_bandwidth_per_session')
        )
        .where('bandwidth', '>', 0)
        .whereNotNull('quality');
      
      // Apply dynamic filters
      let paramIndex = 0;
      if (sqlLower.includes('and user_id = ?')) {
        query = query.where('user_id', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and username = ?')) {
        query = query.where('username', params[paramIndex]);
        paramIndex++;
      }
      if (sqlLower.includes('and start_time >= ? and start_time <= ?')) {
        query = query.where('start_time', '>=', params[paramIndex])
                     .where('start_time', '<=', params[paramIndex + 1]);
        paramIndex += 2;
      }
      
      return await query.groupBy('quality').orderBy('total_bandwidth', 'desc');
    }
    
    // Handle watch history queries
    if (sqlLower.includes('select * from watch_history where user_id = ? and media_id = ?')) {
      return await this.knex('watch_history')
        .where('user_id', params[0])
        .where('media_id', params[1]);
    }
    
    // Handle common user queries
    if (sqlLower === 'select * from users where email = ?') {
      return await this.knex('users').where('email', params[0]);
    }
    if (sqlLower === 'select * from users where username = ?') {
      return await this.knex('users').where('username', params[0]);
    }
    if (sqlLower === 'select * from users where id = ?') {
      return await this.knex('users').where('id', params[0]);
    }
    if (sqlLower === 'select id, username from users where id = ?') {
      return await this.knex('users').select('id', 'username').where('id', params[0]);
    }
    
    // Handle session queries
    if (sqlLower.includes('select * from user_sessions where') || sqlLower.includes('select session_id from user_sessions where')) {
      if (sqlLower.includes('session_id = ?')) {
        return await this.knex('user_sessions').where('session_id', params[0]);
      }
      if (sqlLower.includes('user_id = ?')) {
        return await this.knex('user_sessions').where('user_id', params[0]);
      }
      // Handle complex session query with multiple conditions
      if (sqlLower.includes('user_id = ?') && sqlLower.includes('device_info = ?') && 
          sqlLower.includes('browser_info = ?') && sqlLower.includes('ip_address = ?') &&
          sqlLower.includes('is_active = 1')) {
        return await this.knex('user_sessions')
          .select('session_id')
          .where('user_id', params[0])
          .where('device_info', params[1])
          .where('browser_info', params[2])
          .where('ip_address', params[3])
          .where('is_active', 1)
          .where('expires_at', '>', new Date())
          .orderBy('last_activity', 'desc')
          .limit(1);
      }
    }
    
    // Handle media queries
    if (sqlLower === 'select * from media_content where id = ?') {
      return await this.knex('media_content').where('id', params[0]);
    }
    
    // Handle email verification queries
    if (sqlLower.includes('select * from email_verifications') && 
        sqlLower.includes('where email = ? and code = ?')) {
      return await this.knex('email_verifications')
        .where({
          email: params[0],
          code: params[1]
        })
        .where('verified', false)
        .where('expires_at', '>', this.knex.fn.now());
    }
    
    // Handle invite token queries
    if (sqlLower.includes('select * from invite_tokens where')) {
      if (sqlLower.includes('token = ?')) {
        return await this.knex('invite_tokens').where('token', params[0]);
      }
    }
    
    // Handle PRAGMA table_info queries (convert to PostgreSQL information_schema)
    if (sqlLower.includes('pragma table_info')) {
      const tableMatch = sql.match(/PRAGMA table_info\((\w+)\)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        try {
          const result = await this.knex.raw(`
            SELECT column_name as name, data_type as type, 
                   CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull,
                   CASE WHEN column_default IS NOT NULL THEN 1 ELSE 0 END as dflt_value,
                   ordinal_position as cid,
                   CASE WHEN column_name IN (
                     SELECT column_name FROM information_schema.key_column_usage 
                     WHERE table_name = ? AND constraint_name LIKE '%_pkey'
                   ) THEN 1 ELSE 0 END as pk
            FROM information_schema.columns 
            WHERE table_name = ? AND table_schema = 'public'
            ORDER BY ordinal_position
          `, [tableName, tableName]);
          return result.rows || [];
        } catch (error) {
          return [];
        }
      }
    }
    
    // For complex queries or queries with multiple conditions, try using Knex query builder
    let convertedSql;
    try {
      // Convert SQLite-style placeholders (?) to PostgreSQL-style ($1, $2, etc.)
      convertedSql = this.convertSQLiteToPostgreSQL(sql, params);
      
      // Always pass the params array, even if empty
      const result = await this.knex.raw(convertedSql.sql, convertedSql.params);
      return result.rows || result;
    } catch (error) {
      throw error;
    }
  }

  // Insert method
  async insert(sql, params = []) {
    try {
      // Ensure params is always an array
      const safeParams = Array.isArray(params) ? params : [];
      
      if (this.databaseType === 'sqlite') {
        return await this.insertSQLite(sql, safeParams);
      } else if (this.databaseType === 'postgresql') {
        return await this.insertPostgreSQL(sql, safeParams);
      }
    } catch (error) {
      console.error('Insert error:', error);
      throw error;
    }
  }

  async insertSQLite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async insertPostgreSQL(sql, params = []) {
    try {
      // For simple INSERT queries, try to use Knex query builder
      const sqlLower = sql.toLowerCase().trim();
      
      // Handle user inserts using Knex query builder
      if (sqlLower.includes('insert into users') || sqlLower.includes('insert into "users"')) {
        // Parse the values from the parameters based on the SQL structure
        const userData = {
          username: params[0],
          email: params[1], 
          password_hash: params[2],
          is_admin: params[3],
          email_verified: true,
          email_verified_at: new Date()
        };
        const result = await this.knex('users').insert(userData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle user inserts with specific pattern
      if (sqlLower.includes('insert into "users" ("username", "email", "password_hash", "is_admin", "email_verified", "email_verified_at")')) {
        const userData = {
          username: params[0],
          email: params[1], 
          password_hash: params[2],
          is_admin: params[3],
          email_verified: true,
          email_verified_at: new Date()
        };
        const result = await this.knex('users').insert(userData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle email verification inserts using Knex query builder
      if (sqlLower.includes('insert into email_verifications')) {
        const verificationData = {
          email: params[0],
          code: params[1],
          username: params[2],
          password_hash: params[3],
          invite_token: params[4],
          expires_at: params[5],
          verified: false
        };
        const result = await this.knex('email_verifications').insert(verificationData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle invite token inserts using Knex query builder
      if (sqlLower.includes('insert into invite_tokens')) {
        const tokenData = {
          token: params[0],
          created_by: params[1],
          expires_at: params[2],
          max_uses: params[3] || 1,
          current_uses: 0,
          is_indefinite: params[4] || false
        };
        const result = await this.knex('invite_tokens').insert(tokenData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle streaming sessions insert
      if (sqlLower.includes('insert into streaming_sessions')) {
        const sessionData = {
          id: params[0],
          user_id: params[1],
          username: params[2],
          media_id: params[3],
          title: params[4],
          quality: params[5],
          bandwidth: params[6],
          start_time: params[7],
          client_ip: params[8],
          status: params[9],
          settings: params[10]
        };
        const result = await this.knex('streaming_sessions').insert(sessionData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle monthly bandwidth record insert
      if (sqlLower.includes('insert into monthly_bandwidth')) {
        const bandwidthData = {
          user_id: params[0],
          username: params[1],
          total_bandwidth_gb: params[2] || 0,
          total_streams: params[3] || 0,
          total_duration_seconds: params[4] || 0,
          period_start: params[5],
          period_end: params[6]
        };
        const result = await this.knex('monthly_bandwidth').insert(bandwidthData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle streaming settings insert
      if (sqlLower.includes('insert into streaming_settings')) {
        const settingsData = {
          max_resolution: params[0],
          bitrate_limit: params[1],
          total_bandwidth_limit: params[2],
          per_user_bandwidth_limit: params[3],
          updated_at: params[4]
        };
        const result = await this.knex('streaming_settings').insert(settingsData).returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle watch history insert/replace (upsert)
      if (sqlLower.includes('insert or replace into watch_history')) {
        const watchData = {
          user_id: params[0],
          media_id: params[1],
          current_time: params[2],
          duration: params[3],
          progress_percentage: params[4],
          completed: params[5],
          last_watched: params[6],
          updated_at: params[7]
        };
        const result = await this.knex('watch_history')
          .insert(watchData)
          .onConflict(['user_id', 'media_id'])
          .merge(['current_time', 'duration', 'progress_percentage', 'completed', 'last_watched', 'updated_at'])
          .returning('id');
        return { id: result[0]?.id || result[0], changes: 1 };
      }
      
      // Handle INSERT OR REPLACE queries (convert to UPSERT)
      if (sqlLower.includes('insert or replace into storage_analytics')) {
        try {
          const analyticsData = {
            metric_name: params[0],
            metric_value: params[1],
            expires_at: params[2],
            last_updated: new Date()
          };
          const result = await this.knex('storage_analytics')
            .insert(analyticsData)
            .onConflict('metric_name')
            .merge(['metric_value', 'expires_at', 'last_updated'])
            .returning('id');
          return { id: result[0]?.id || result[0], changes: 1 };
        } catch (error) {
          // If storage_analytics table doesn't exist, just return success
          return { id: null, changes: 0 };
        }
      }
      
      // Handle streaming settings INSERT (use UPSERT for settings table)
      if (sqlLower.includes('insert into streaming_settings') && 
          sqlLower.includes('(max_resolution, bitrate_limit, total_bandwidth_limit, per_user_bandwidth_limit, updated_at)') &&
          params.length === 5) {
        
        const settingsData = {
          max_resolution: params[0],
          bitrate_limit: params[1],
          total_bandwidth_limit: params[2],
          per_user_bandwidth_limit: params[3],
          updated_at: params[4]
        };
        
        try {
          // Try to update first (assuming ID 1 for single settings record)
          const existingSettings = await this.knex('streaming_settings').where('id', 1).first();
          
          if (existingSettings) {
            // Update existing settings
            await this.knex('streaming_settings').where('id', 1).update(settingsData);
            return { id: 1, changes: 1 };
          } else {
            // Insert new settings with explicit ID
            const result = await this.knex('streaming_settings').insert({id: 1, ...settingsData}).returning('id');
            return { id: result[0]?.id || result[0], changes: 1 };
          }
        } catch (error) {
          // Fallback: try upsert approach
          const result = await this.knex('streaming_settings')
            .insert({id: 1, ...settingsData})
            .onConflict('id')
            .merge(['max_resolution', 'bitrate_limit', 'total_bandwidth_limit', 'per_user_bandwidth_limit', 'updated_at'])
            .returning('id');
          return { id: result[0]?.id || result[0], changes: 1 };
        }
      }


      
      // For other inserts, convert and use raw query
      const convertedSql = this.convertSQLiteToPostgreSQL(sql, params);
      const result = await this.knex.raw(convertedSql.sql, convertedSql.params);
      
      // PostgreSQL returns the inserted row, we need to extract the ID
      let id = null;
      if (result.rows && result.rows.length > 0) {
        id = result.rows[0].id;
      }
      
      return { id, changes: result.rowCount || 1 };
    } catch (error) {
      console.error('❌ Insert query failed:', error.message);
      throw error;
    }
  }

  // Update method
  async update(sql, params = []) {
    try {
      // Ensure params is always an array
      const safeParams = Array.isArray(params) ? params : [];
      
      if (this.databaseType === 'sqlite') {
        return await this.updateSQLite(sql, safeParams);
      } else if (this.databaseType === 'postgresql') {
        return await this.updatePostgreSQL(sql, safeParams);
      }
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  }

  // Delete method
  async delete(sql, params = []) {
    try {
      // Ensure params is always an array
      const safeParams = Array.isArray(params) ? params : [];
      
      if (this.databaseType === 'sqlite') {
        return await this.deleteSQLite(sql, safeParams);
      } else if (this.databaseType === 'postgresql') {
        return await this.deletePostgreSQL(sql, safeParams);
      }
    } catch (error) {
      console.error('Delete error:', error);
      throw error;
    }
  }

  async updateSQLite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async deleteSQLite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async updatePostgreSQL(sql, params = []) {
    try {
      const sqlLower = sql.toLowerCase().trim();
      

      
      // Handle media content views increment
      if (sqlLower.includes('update media_content set views = views + 1 where id = ?')) {
        const result = await this.knex('media_content')
          .where('id', params[0])
          .increment('views', 1);
        return { changes: result || 0 };
      }
      
      // Handle streaming session bandwidth updates
      if (sqlLower.includes('update streaming_sessions set bandwidth = bandwidth + ? where id = ? and status = ?')) {
        const result = await this.knex('streaming_sessions')
          .where('id', params[1])
          .where('status', params[2])
          .increment('bandwidth', params[0]);
        return { changes: result || 0 };
      }
      
      // Handle monthly bandwidth record updates
      if (sqlLower.includes('update monthly_bandwidth set') && 
          sqlLower.includes('total_bandwidth_gb = total_bandwidth_gb + ?') &&
          sqlLower.includes('total_streams = total_streams + 1') &&
          sqlLower.includes('total_duration_seconds = total_duration_seconds + ?') &&
          sqlLower.includes('updated_at = current_timestamp') &&
          sqlLower.includes('where id = ?')) {
        const result = await this.knex('monthly_bandwidth')
          .where('id', params[3])
          .increment('total_bandwidth_gb', params[0])
          .increment('total_streams', 1)
          .increment('total_duration_seconds', params[1])
          .update('updated_at', new Date());
        return { changes: result || 0 };
      }
      
      // Handle streaming settings updates
      if (sqlLower.includes('update streaming_settings set') && 
          sqlLower.includes('max_resolution = ?') &&
          sqlLower.includes('bitrate_limit = ?') &&
          sqlLower.includes('total_bandwidth_limit = ?') &&
          sqlLower.includes('per_user_bandwidth_limit = ?') &&
          sqlLower.includes('updated_at = ?') &&
          sqlLower.includes('where id = ?')) {
        const result = await this.knex('streaming_settings')
          .where('id', params[5])
          .update({
            max_resolution: params[0],
            bitrate_limit: params[1],
            total_bandwidth_limit: params[2],
            per_user_bandwidth_limit: params[3],
            updated_at: params[4]
          });
        return { changes: result || 0 };
      }
      
      // Handle user role updates
      if (sqlLower.includes('update users set role = ?') && 
          sqlLower.includes('is_admin = ?') && 
          sqlLower.includes('updated_at = current_timestamp') &&
          sqlLower.includes('where id = ?')) {
        const result = await this.knex('users')
          .where('id', params[2])
          .update({
            role: params[0],
            is_admin: params[1],
            updated_at: new Date()
          });
        return { changes: result || 0 };
      }
      
      // Handle email verification updates
      if (sqlLower.includes('update email_verifications set verified = 1 where id = ?') || 
          sqlLower.includes('update "email_verifications" set verified = 1 where id = ?') ||
          sqlLower.includes('update email_verifications set verified = 1 where id = $1') ||
          sqlLower.includes('update "email_verifications" set verified = 1 where id = $1')) {
        const result = await this.knex('email_verifications')
          .where('id', params[0])
          .update({ verified: true });
        return { changes: result || 0 };
      }
      
      // Handle email verification updates with more flexible pattern matching
      if (sqlLower.includes('update') && sqlLower.includes('email_verifications') && 
          sqlLower.includes('set verified = 1') && sqlLower.includes('where id =')) {
        const result = await this.knex('email_verifications')
          .where('id', params[0])
          .update({ verified: true });
        return { changes: result || 0 };
      }
      
      // Handle invite token usage updates
      if (sqlLower.includes('update invite_tokens set current_uses = current_uses + 1')) {
        const result = await this.knex('invite_tokens')
          .where('token', params[1])
          .update({
            current_uses: this.knex.raw('current_uses + 1'),
            used_by: params[0],
            used_at: new Date()
          });
        return { changes: result || 0 };
      }
      
      // Handle streaming session status updates
      if (sqlLower.includes('update streaming_sessions set') && sqlLower.includes('where id = ?')) {
        // Handle end_time, status, and duration updates
        if (sqlLower.includes("end_time = ?, status = 'ended', duration = ?")) {
          // Format: UPDATE streaming_sessions SET end_time = ?, status = 'ended', duration = ? WHERE id = ?
          const updateData = {
            end_time: params[0],
            status: 'ended',
            duration: params[1]
          };
          const sessionId = params[2];
          const result = await this.knex('streaming_sessions').where('id', sessionId).update(updateData);
          return { changes: result || 0 };
        }
        
        if (sqlLower.includes("end_time = ?, status = 'terminated'")) {
          if (sqlLower.includes('duration = ?')) {
            // Format: UPDATE ... SET end_time = ?, status = 'terminated', duration = ? WHERE id = ?
            const updateData = {
              end_time: params[0],
              status: 'terminated',
              duration: params[1]
            };
            const sessionId = params[2];
            const result = await this.knex('streaming_sessions').where('id', sessionId).update(updateData);
            return { changes: result || 0 };
          } else {
            // Format: UPDATE ... SET end_time = ?, status = 'terminated' WHERE id = ?
            const updateData = {
              end_time: params[0],
              status: 'terminated'
            };
            const sessionId = params[1];
            const result = await this.knex('streaming_sessions').where('id', sessionId).update(updateData);
            return { changes: result || 0 };
          }
        }
        
        // Generic end_time and status updates
        if (sqlLower.includes('end_time = ?') && sqlLower.includes('status = ?')) {
          const updateData = {};
          if (sqlLower.includes('duration = ?')) {
            // Format: UPDATE ... SET end_time = ?, status = ?, duration = ? WHERE id = ?
            updateData.end_time = params[0];
            updateData.status = params[1]; 
            updateData.duration = params[2];
            const sessionId = params[3];
            const result = await this.knex('streaming_sessions').where('id', sessionId).update(updateData);
            return { changes: result || 0 };
          } else {
            // Format: UPDATE ... SET end_time = ?, status = ? WHERE id = ?
            updateData.end_time = params[0];
            updateData.status = params[1];
            const sessionId = params[2];
            const result = await this.knex('streaming_sessions').where('id', sessionId).update(updateData);
            return { changes: result || 0 };
          }
        }
      }
      
      // Handle other streaming session updates
      if (sqlLower.includes('update streaming_sessions set') && sqlLower.includes('where id = ?')) {
        // For other streaming session updates, use raw query with proper conversion
        const convertedSql = this.convertSQLiteToPostgreSQL(sql, params);
        if (convertedSql.params.length > 0) {
          const result = await this.knex.raw(convertedSql.sql, convertedSql.params);
          return { changes: result.rowCount || 0 };
        } else {
          const result = await this.knex.raw(convertedSql.sql);
          return { changes: result.rowCount || 0 };
        }
      }
      
      // Default handling for other updates
      let convertedSql;
      try {
        convertedSql = this.convertSQLiteToPostgreSQL(sql, params);
        if (convertedSql.params.length > 0) {
          const result = await this.knex.raw(convertedSql.sql, convertedSql.params);
          return { changes: result.rowCount || 0 };
        } else {
          const result = await this.knex.raw(convertedSql.sql);
          return { changes: result.rowCount || 0 };
        }
      } catch (conversionError) {
        console.error('SQL conversion failed:', conversionError.message);
        throw conversionError;
      }
    } catch (error) {
      console.error('Update query failed:', error.message);
      throw error;
    }
  }

  async deletePostgreSQL(sql, params = []) {
    try {
      const sqlLower = sql.toLowerCase().trim();
      
      // Handle user deletes using Knex query builder
      if (sqlLower.includes('delete from users where id = ?') || 
          sqlLower.includes('delete from "users" where id = ?') ||
          sqlLower.includes('delete from users where id = $1') ||
          sqlLower.includes('delete from "users" where id = $1')) {
        const result = await this.knex('users').where('id', params[0]).del();
        return { changes: result || 0 };
      }
      
      // Handle invite token deletes using Knex query builder
      if (sqlLower.includes('delete from invite_tokens where token = ?') ||
          sqlLower.includes('delete from "invite_tokens" where token = ?')) {
        const result = await this.knex('invite_tokens').where('token', params[0]).del();
        return { changes: result || 0 };
      }
      
      // Handle email verification deletes using Knex query builder
      if (sqlLower.includes('delete from email_verifications where id = ?') ||
          sqlLower.includes('delete from "email_verifications" where id = ?')) {
        const result = await this.knex('email_verifications').where('id', params[0]).del();
        return { changes: result || 0 };
      }
      
      // Default handling for other deletes
      let convertedSql;
      try {
        convertedSql = this.convertSQLiteToPostgreSQL(sql, params);
        if (convertedSql.params.length > 0) {
          const result = await this.knex.raw(convertedSql.sql, convertedSql.params);
          return { changes: result.rowCount || 0 };
        } else {
          const result = await this.knex.raw(convertedSql.sql);
          return { changes: result.rowCount || 0 };
        }
      } catch (conversionError) {
        console.error('SQL conversion failed:', conversionError.message);
        throw conversionError;
      }
    } catch (error) {
      console.error('Delete query failed:', error.message);
      throw error;
    }
  }

  // Convert SQLite-style placeholders to PostgreSQL-style
  convertSQLiteToPostgreSQL(sql, params = []) {
    let convertedSql = sql;
    const convertedParams = [];
    let paramIndex = 1;

    // Ensure params is always an array
    const safeParams = Array.isArray(params) ? params : [];
    
    // Count placeholders in SQL
    const placeholderCount = (sql.match(/\?/g) || []).length;
    
    // Validate parameter count
    if (placeholderCount !== safeParams.length) {
      console.warn(`Parameter count mismatch: expected ${placeholderCount}, got ${safeParams.length} for SQL: ${sql}`);
    }

    // Replace ? placeholders with $1, $2, etc.
    convertedSql = convertedSql.replace(/\?/g, () => {
      if (paramIndex - 1 < safeParams.length) {
        const param = safeParams[paramIndex - 1];
        convertedParams.push(param);
        return `$${paramIndex++}`;
      } else {
        console.error(`Missing parameter for placeholder at index ${paramIndex - 1}`);
        return `$${paramIndex++}`;
      }
    });

    // Handle SQLite-specific syntax
    convertedSql = this.convertSQLiteSyntax(convertedSql);

    return {
      sql: convertedSql,
      params: convertedParams
    };
  }

  // Convert SQLite-specific syntax to PostgreSQL
  convertSQLiteSyntax(sql) {
    // Convert AUTOINCREMENT to SERIAL
    sql = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
    
    // Convert SQLite boolean comparisons to PostgreSQL
    // Handle published = 1 -> published = TRUE
    sql = sql.replace(/published\s*=\s*1/gi, 'published = TRUE');
    sql = sql.replace(/published\s*=\s*0/gi, 'published = FALSE');
    
    // Handle CASE WHEN published = 1 -> CASE WHEN published = TRUE
    sql = sql.replace(/CASE\s+WHEN\s+published\s*=\s*1/gi, 'CASE WHEN published = TRUE');
    sql = sql.replace(/CASE\s+WHEN\s+published\s*=\s*0/gi, 'CASE WHEN published = FALSE');
    
    // Handle AND published = 1 -> AND published = TRUE  
    sql = sql.replace(/AND\s+published\s*=\s*1/gi, 'AND published = TRUE');
    sql = sql.replace(/AND\s+published\s*=\s*0/gi, 'AND published = FALSE');
    
    // Convert DATETIME to TIMESTAMP
    sql = sql.replace(/DATETIME/g, 'TIMESTAMP');
    
    // Convert BOOLEAN to proper PostgreSQL boolean
    sql = sql.replace(/BOOLEAN DEFAULT (\d)/g, (match, value) => {
      return `BOOLEAN DEFAULT ${value === '1' ? 'true' : 'false'}`;
    });
    
    // Convert CURRENT_TIMESTAMP to PostgreSQL format
    sql = sql.replace(/CURRENT_TIMESTAMP/g, 'CURRENT_TIMESTAMP');
    
    // Convert SQLite datetime functions to PostgreSQL equivalents
    sql = sql.replace(/datetime\(['"]now['"]\)/g, 'NOW()');
    sql = sql.replace(/datetime\(['"]now['"],\s*['"][+\-]\d+\s+\w+['"]\)/g, (match) => {
      // Handle datetime('now', '+1 hour'), datetime('now', '-30 days'), etc.
      const intervalMatch = match.match(/['"][+\-](\d+)\s+(\w+)['"]/);
      if (intervalMatch) {
        const amount = intervalMatch[1];
        const unit = intervalMatch[2];
        const sign = match.includes('+') ? '+' : '-';
        return `NOW() ${sign} INTERVAL '${amount} ${unit}'`;
      }
      return match;
    });
    
    // Convert INSERT OR REPLACE to INSERT ... ON CONFLICT DO UPDATE
    if (sql.includes('INSERT OR REPLACE')) {
      sql = sql.replace(/INSERT OR REPLACE INTO (\w+)/g, 'INSERT INTO $1');
      // Add ON CONFLICT handling - this is a simplified version
      // More complex cases will need specific handling per table
      if (sql.includes('watch_history')) {
        sql = sql.replace(/VALUES\s*\([^)]+\)/, match => {
          return `${match} ON CONFLICT (user_id, media_id) DO UPDATE SET 
            current_time = EXCLUDED.current_time,
            duration = EXCLUDED.duration,
            progress_percentage = EXCLUDED.progress_percentage,
            completed = EXCLUDED.completed,
            last_watched = EXCLUDED.last_watched,
            updated_at = EXCLUDED.updated_at`;
        });
      }
    }
    
    // Convert INSERT OR IGNORE to INSERT ... ON CONFLICT DO NOTHING
    if (sql.includes('INSERT OR IGNORE')) {
      sql = sql.replace(/INSERT OR IGNORE INTO (\w+)/g, 'INSERT INTO $1');
      // Add appropriate ON CONFLICT handling based on the table
      if (sql.includes('transcoding_jobs')) {
        sql = sql.replace(/VALUES\s*\([^)]+\)/, match => {
          return `${match} ON CONFLICT (id) DO NOTHING`;
        });
      } else if (sql.includes('transcoded_results')) {
        sql = sql.replace(/VALUES\s*\([^)]+\)/, match => {
          return `${match} ON CONFLICT (job_id, quality) DO NOTHING`;
        });
      } else {
        // Generic fallback - add ON CONFLICT DO NOTHING
        sql = sql.replace(/VALUES\s*\([^)]+\)/, match => {
          return `${match} ON CONFLICT DO NOTHING`;
        });
      }
    }
    
    // Convert SQLite-specific status checks with string literals in double quotes
    sql = sql.replace(/status IN \("([^"]+)"(?:,\s*"([^"]+)")*\)/g, (match, ...statuses) => {
      const statusList = statuses.filter(s => s).map(s => `'${s}'`).join(', ');
      return `status IN (${statusList})`;
    });
    
    return sql;
  }

  // Close database connection
  async close() {
    try {
      if (this.databaseType === 'sqlite' && this.db) {
        return new Promise((resolve) => {
          this.db.close((err) => {
            if (err) {
              console.error('Error closing SQLite database:', err);
            } else {
            }
            resolve();
          });
        });
      } else if (this.databaseType === 'postgresql' && this.knex) {
        await this.knex.destroy();
      }
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }

  // Get database type for debugging
  getDatabaseType() {
    return this.databaseType;
  }

  // Get Knex instance for advanced operations
  getKnex() {
    return this.knex;
  }
}

// Create singleton instance
const database = new Database();

module.exports = database; 
