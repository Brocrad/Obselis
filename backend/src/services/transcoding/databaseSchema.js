const database = require('../../utils/database');

async function createTranscodingTables() {
  
  try {
    // Check if we're using PostgreSQL or SQLite
    const isPostgreSQL = database.getDatabaseType() === 'postgresql';
    
    // Drop existing tables if they exist (to ensure clean schema)
    await database.query(`DROP TABLE IF EXISTS transcoding_jobs CASCADE`);
    await database.query(`DROP TABLE IF EXISTS transcoded_results CASCADE`);
    await database.query(`DROP TABLE IF EXISTS progress_history CASCADE`);
    await database.query(`DROP TABLE IF EXISTS system_performance CASCADE`);
    await database.query(`DROP TABLE IF EXISTS cleanup_log CASCADE`);
    
    // 1. Transcoding Jobs Table
    const jobsTableSQL = isPostgreSQL ? `
      CREATE TABLE IF NOT EXISTS transcoding_jobs (
        id TEXT PRIMARY KEY,
        input_path TEXT NOT NULL,
        qualities TEXT NOT NULL, -- JSON array of quality levels
        status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'analyzing', 'transcoding', 'completed', 'failed', 'cancelled')),
        progress INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        settings TEXT, -- JSON object of transcoding settings
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS transcoding_jobs (
        id TEXT PRIMARY KEY,
        input_path TEXT NOT NULL,
        qualities TEXT NOT NULL, -- JSON array of quality levels
        status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'analyzing', 'transcoding', 'completed', 'failed', 'cancelled')),
        progress INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        settings TEXT, -- JSON object of transcoding settings
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await database.query(jobsTableSQL);
    
    // 2. Transcoding Results Table
    const resultsTableSQL = isPostgreSQL ? `
      CREATE TABLE IF NOT EXISTS transcoded_results (
        id SERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        quality TEXT NOT NULL,
        original_path TEXT NOT NULL,
        transcoded_path TEXT NOT NULL,
        original_size INTEGER NOT NULL,
        transcoded_size INTEGER NOT NULL,
        compression_ratio REAL NOT NULL,
        space_saved INTEGER NOT NULL,
        checksum TEXT,
        processing_time INTEGER, -- in milliseconds
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES transcoding_jobs(id) ON DELETE CASCADE
      )
    ` : `
      CREATE TABLE IF NOT EXISTS transcoded_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        quality TEXT NOT NULL,
        original_path TEXT NOT NULL,
        transcoded_path TEXT NOT NULL,
        original_size INTEGER NOT NULL,
        transcoded_size INTEGER NOT NULL,
        compression_ratio REAL NOT NULL,
        space_saved INTEGER NOT NULL,
        checksum TEXT,
        processing_time INTEGER, -- in milliseconds
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES transcoding_jobs(id) ON DELETE CASCADE
      )
    `;
    await database.query(resultsTableSQL);
    
    // 3. Storage Analytics Table (enhanced)
    const analyticsTableSQL = isPostgreSQL ? `
      CREATE TABLE IF NOT EXISTS storage_analytics (
        id SERIAL PRIMARY KEY,
        metric_name TEXT NOT NULL,
        metric_value TEXT NOT NULL, -- JSON object
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS storage_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value TEXT NOT NULL, -- JSON object
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `;
    await database.query(analyticsTableSQL);
    
    // 4. Progress History Table
    const historyTableSQL = isPostgreSQL ? `
      CREATE TABLE IF NOT EXISTS progress_history (
        id SERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        phase TEXT,
        error_message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES transcoding_jobs(id) ON DELETE CASCADE
      )
    ` : `
      CREATE TABLE IF NOT EXISTS progress_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        phase TEXT,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES transcoding_jobs(id) ON DELETE CASCADE
      )
    `;
    await database.query(historyTableSQL);
    
    // 5. System Performance Table
    const performanceTableSQL = isPostgreSQL ? `
      CREATE TABLE IF NOT EXISTS system_performance (
        id SERIAL PRIMARY KEY,
        metric_type TEXT NOT NULL, -- 'transcoder', 'storage', 'cleanup'
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS system_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL, -- 'transcoder', 'storage', 'cleanup'
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await database.query(performanceTableSQL);
    
    // 6. Cleanup Log Table
    const cleanupTableSQL = isPostgreSQL ? `
      CREATE TABLE IF NOT EXISTS cleanup_log (
        id SERIAL PRIMARY KEY,
        cleanup_type TEXT NOT NULL, -- 'corrupted', 'orphaned', 'temp', 'database'
        files_cleaned INTEGER DEFAULT 0,
        space_freed INTEGER DEFAULT 0,
        records_cleaned INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        duration INTEGER, -- in milliseconds
        details TEXT, -- JSON object with detailed results
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS cleanup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cleanup_type TEXT NOT NULL, -- 'corrupted', 'orphaned', 'temp', 'database'
        files_cleaned INTEGER DEFAULT 0,
        space_freed INTEGER DEFAULT 0,
        records_cleaned INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        duration INTEGER, -- in milliseconds
        details TEXT, -- JSON object with detailed results
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await database.query(cleanupTableSQL);
    
    
    // Create indexes for better performance (after all tables are created)
    await database.query(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON transcoding_jobs(status)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_jobs_priority ON transcoding_jobs(priority)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON transcoding_jobs(created_at)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_results_job_id ON transcoded_results(job_id)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_results_quality ON transcoded_results(quality)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_metric_name ON storage_analytics(metric_name)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_expires_at ON storage_analytics(expires_at)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_job_id ON progress_history(job_id)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_timestamp ON progress_history(timestamp)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_metric_type ON system_performance(metric_type)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_perf_timestamp ON system_performance(timestamp)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_cleanup_type ON cleanup_log(cleanup_type)`);
    await database.query(`CREATE INDEX IF NOT EXISTS idx_cleanup_timestamp ON cleanup_log(timestamp)`);
    
    // Migrate existing data if needed
    await migrateExistingData();
    
  } catch (error) {
    console.error('❌ Failed to create transcoding tables:', error);
    throw error;
  }
}

async function migrateExistingData() {
  
  try {
    // Check if old transcoded_files table exists
    let oldTableExists = [];
    try {
      if (database.getDatabaseType() === 'sqlite') {
        oldTableExists = await database.query(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='transcoded_files'
        `);
      } else {
        // PostgreSQL
        oldTableExists = await database.query(`
          SELECT tablename as name FROM pg_tables 
          WHERE schemaname = 'public' AND tablename = 'transcoded_files'
        `);
      }
    } catch (error) {
      oldTableExists = [];
    }
    
    if (oldTableExists.length > 0) {
      
      // Get existing transcoded files
      const existingFiles = await database.query(`
        SELECT * FROM transcoded_files WHERE is_active = true
      `);
      
      if (existingFiles.length > 0) {
        
        for (const file of existingFiles) {
          // Create a synthetic job record
          const jobId = `migrated_${file.id}`;
          
          // Check if we're using PostgreSQL
          const isPostgreSQL = database.getDatabaseType() === 'postgresql';
          
          if (isPostgreSQL) {
            await database.query(`
              INSERT INTO transcoding_jobs (
                id, input_path, qualities, status, created_at, completed_at
              ) VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (id) DO NOTHING
            `, [
              jobId,
              file.original_path,
              JSON.stringify([file.quality_level]),
              'completed',
              file.transcoded_at || new Date().toISOString(),
              file.transcoded_at || new Date().toISOString()
            ]);
            
            // Create result record
            await database.query(`
              INSERT INTO transcoded_results (
                job_id, quality, original_path, transcoded_path,
                original_size, transcoded_size, compression_ratio,
                space_saved, checksum, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (job_id, quality) DO NOTHING
            `, [
              jobId,
              file.quality_level,
              file.original_path,
              file.transcoded_path,
              file.original_size,
              file.transcoded_size,
              file.compression_ratio,
              file.original_size - file.transcoded_size,
              file.checksum,
              file.transcoded_at || new Date().toISOString()
            ]);
          } else {
            // SQLite
            await database.query(`
              INSERT OR IGNORE INTO transcoding_jobs (
                id, input_path, qualities, status, created_at, completed_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
              jobId,
              file.original_path,
              JSON.stringify([file.quality_level]),
              'completed',
              file.transcoded_at || new Date().toISOString(),
              file.transcoded_at || new Date().toISOString()
            ]);
            
            // Create result record
            await database.query(`
              INSERT OR IGNORE INTO transcoded_results (
                job_id, quality, original_path, transcoded_path,
                original_size, transcoded_size, compression_ratio,
                space_saved, checksum, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              jobId,
              file.quality_level,
              file.original_path,
              file.transcoded_path,
              file.original_size,
              file.transcoded_size,
              file.compression_ratio,
              file.original_size - file.transcoded_size,
              file.checksum,
              file.transcoded_at || new Date().toISOString()
            ]);
          }
        }
        
      }
    }
    
  } catch (error) {
    console.error('❌ Data migration failed:', error);
    // Don't throw error - migration failure shouldn't prevent new system from working
  }
}

async function dropOldTables() {
  
  try {
    // Drop old tables if they exist
    await database.query(`DROP TABLE IF EXISTS transcoded_files`);
    await database.query(`DROP TABLE IF EXISTS deletion_schedule`);
    
  } catch (error) {
    console.error('❌ Failed to drop old tables:', error);
    throw error;
  }
}

async function getTableInfo() {
  try {
    let tables = [];
    const isPostgreSQL = database.getDatabaseType() === 'postgresql';
    
    if (!isPostgreSQL) {
      tables = await database.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE '%transcod%'
        ORDER BY name
      `);
    } else {
      // PostgreSQL
      tables = await database.query(`
        SELECT tablename as name FROM pg_tables 
        WHERE schemaname = 'public' AND tablename LIKE '%transcod%'
        ORDER BY tablename
      `);
    }
    
    const tableInfo = {};
    
    for (const table of tables) {
      let columns = [];
      
      if (!isPostgreSQL) {
        // SQLite
        columns = await database.query(`PRAGMA table_info(${table.name})`);
        tableInfo[table.name] = columns.map(col => ({
          name: col.name,
          type: col.type,
          notNull: col.notnull === 1,
          primaryKey: col.pk === 1
        }));
      } else {
        // PostgreSQL
        columns = await database.query(`
          SELECT 
            column_name as name,
            data_type as type,
            is_nullable = 'NO' as notNull,
            CASE WHEN constraint_type = 'PRIMARY KEY' THEN true ELSE false END as primaryKey
          FROM information_schema.columns 
          LEFT JOIN information_schema.key_column_usage kcu 
            ON columns.column_name = kcu.column_name 
            AND columns.table_name = kcu.table_name
          LEFT JOIN information_schema.table_constraints tc 
            ON kcu.constraint_name = tc.constraint_name
          WHERE columns.table_name = $1
          ORDER BY ordinal_position
        `, [table.name]);
        
        tableInfo[table.name] = columns.map(col => ({
          name: col.name,
          type: col.type,
          notNull: col.notnull,
          primaryKey: col.primarykey
        }));
      }
    }
    
    return tableInfo;
  } catch (error) {
    console.error('❌ Failed to get table info:', error);
    return {};
  }
}

module.exports = {
  createTranscodingTables,
  migrateExistingData,
  dropOldTables,
  getTableInfo
}; 
