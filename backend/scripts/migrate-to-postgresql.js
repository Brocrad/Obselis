#!/usr/bin/env node

const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
require('dotenv').config();

class PostgreSQLMigration {
  constructor() {
    this.sqliteDb = null;
    this.pgClient = null;
    this.migrationLog = [];
  }

  async initialize() {
    console.log('🚀 Starting PostgreSQL migration...');
    
    // Initialize SQLite connection
    const sqlitePath = process.env.NODE_ENV === 'production' 
      ? path.join(__dirname, '../database/media_server.db')
      : path.join(__dirname, '../database/media_server_dev.db');
    
    this.sqliteDb = new sqlite3.Database(sqlitePath);
    
    // Initialize PostgreSQL connection
    this.pgClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'media_server',
      user: process.env.DB_USER || 'media_user',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    await this.pgClient.connect();
    console.log('✅ Database connections established');
  }

  async migrate() {
    try {
      await this.initialize();
      
      // Get all tables from SQLite
      const sqliteTables = await this.getSQLiteTables();
      console.log(`📋 Found ${sqliteTables.length} tables in SQLite`);
      
      // Create tables in PostgreSQL using Knex migrations
      await this.runKnexMigrations();
      
      // Get tables that exist in PostgreSQL
      const postgresTables = await this.getPostgreSQLTables();
      console.log(`📋 Found ${postgresTables.length} tables in PostgreSQL`);
      
      // Find tables that exist in both databases
      const commonTables = sqliteTables.filter(table => postgresTables.includes(table));
      console.log(`📋 Found ${commonTables.length} common tables to migrate`);
      
      // Define table migration order to handle foreign key dependencies
      const tableOrder = [
        'users',                    // Must be first - other tables depend on it
        'streaming_sessions',       // Depends on users
        'streaming_settings',       // Depends on users  
        'watch_history',           // Depends on users
        'monthly_bandwidth',       // Depends on users
        // Add any other tables that don't have dependencies
        ...commonTables.filter(table => !['users', 'streaming_sessions', 'streaming_settings', 'watch_history', 'monthly_bandwidth'].includes(table))
      ];
      
      // Filter to only include tables that exist in both databases
      const orderedTables = tableOrder.filter(table => commonTables.includes(table));
      console.log(`📋 Migrating tables in dependency order: ${orderedTables.join(', ')}`);
      
      // Migrate data for each table in the correct order
      for (const table of orderedTables) {
        await this.migrateTable(table);
      }
      
      // Verify migration
      await this.verifyMigration(commonTables);
      
      console.log('✅ Migration completed successfully!');
      this.saveMigrationLog();
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      await this.rollback();
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async getSQLiteTables() {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, (err, tables) => {
        if (err) reject(err);
        else resolve(tables.map(t => t.name));
      });
    });
  }

  async runKnexMigrations() {
    console.log('🔄 Running Knex migrations...');
    
    const knex = require('knex')({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'media_server',
        user: process.env.DB_USER || 'media_user',
        password: process.env.DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      },
      migrations: {
        directory: './database/migrations'
      },
      seeds: {
        directory: './database/seeds'
      }
    });
    
    try {
      await knex.migrate.latest();
      console.log('✅ Knex migrations completed');
    } finally {
      await knex.destroy();
    }
  }

  async migrateTable(tableName) {
    console.log(`📦 Migrating table: ${tableName}`);
    
    // Get table structure
    const structure = await this.getTableStructure(tableName);
    
    // Get data from SQLite
    const data = await this.getTableData(tableName);
    
    if (data.length === 0) {
      console.log(`   ⚠️  Table ${tableName} is empty, skipping data migration`);
      return;
    }
    
    // Insert data into PostgreSQL
    await this.insertDataToPostgreSQL(tableName, data, structure);
    
    console.log(`   ✅ Migrated ${data.length} rows from ${tableName}`);
    this.migrationLog.push({
      table: tableName,
      rows: data.length,
      timestamp: new Date().toISOString()
    });
  }

  async getTableStructure(tableName) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) reject(err);
        else resolve(columns);
      });
    });
  }

  async getTableData(tableName) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async insertDataToPostgreSQL(tableName, data, structure) {
    if (data.length === 0) return;
    
    // Get PostgreSQL table columns
    const pgColumns = await this.pgClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tableName]);
    
    const pgColumnNames = pgColumns.rows.map(row => row.column_name);
    
    // Get SQLite column names and filter to only common columns
    const sqliteColumns = structure.map(col => col.name);
    const columns = sqliteColumns.filter(col => pgColumnNames.includes(col));
    
    if (columns.length === 0) {
      console.log(`   ⚠️  No common columns found for table ${tableName}, skipping`);
      return;
    }
    
    console.log(`   📋 Migrating columns: ${columns.join(', ')}`);
    const columnList = columns.map(col => `"${col}"`).join(', ');
    
    // Insert rows one by one to avoid complex batch insert issues
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const query = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    
    for (const row of data) {
      const values = columns.map(col => {
        let value = row[col];
        
        // Handle SQLite-specific data types
        if (value === null || value === undefined) {
          return null;
        }
        
        // Convert SQLite boolean (0/1) to PostgreSQL boolean
        if (typeof value === 'number' && (value === 0 || value === 1)) {
          const column = structure.find(c => c.name === col);
          if (column && column.type.toLowerCase().includes('boolean')) {
            return value === 1;
          }
        }
        
        // Handle JSON strings
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          try {
            return JSON.parse(value);
          } catch {
            // Not valid JSON, keep as string
          }
        }
        
        return value;
      });
      
      await this.pgClient.query(query, values);
    }
  }

  async verifyMigration(tables) {
    console.log('🔍 Verifying migration...');
    
    for (const table of tables) {
      const sqliteCount = await this.getSQLiteRowCount(table);
      const pgCount = await this.getPostgreSQLRowCount(table);
      
      if (sqliteCount !== pgCount) {
        console.warn(`   ⚠️  Row count mismatch for ${table}: SQLite=${sqliteCount}, PostgreSQL=${pgCount}`);
      } else {
        console.log(`   ✅ ${table}: ${sqliteCount} rows verified`);
      }
    }
  }

  async getSQLiteRowCount(tableName) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  async getPostgreSQLRowCount(tableName) {
    const result = await this.pgClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    return parseInt(result.rows[0].count);
  }

  async rollback() {
    console.log('🔄 Rolling back migration...');
    
    if (this.pgClient) {
      // Drop all tables
      const tables = await this.getPostgreSQLTables();
      for (const table of tables) {
        await this.pgClient.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
      console.log('✅ Rollback completed');
    }
  }

  async getPostgreSQLTables() {
    const result = await this.pgClient.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'knex_%'
    `);
    return result.rows.map(row => row.tablename);
  }

  saveMigrationLog() {
    const logPath = path.join(__dirname, '../logs/migration-log.json');
    const logData = {
      timestamp: new Date().toISOString(),
      tables: this.migrationLog,
      totalRows: this.migrationLog.reduce((sum, table) => sum + table.rows, 0)
    };
    
    fs.writeFile(logPath, JSON.stringify(logData, null, 2))
      .then(() => console.log(`📝 Migration log saved to ${logPath}`))
      .catch(err => console.error('Failed to save migration log:', err));
  }

  async cleanup() {
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    if (this.pgClient) {
      await this.pgClient.end();
    }
    console.log('🧹 Cleanup completed');
  }
}

// CLI interface
if (require.main === module) {
  const migration = new PostgreSQLMigration();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      migration.migrate()
        .then(() => {
          console.log('🎉 Migration completed successfully!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('💥 Migration failed:', error);
          process.exit(1);
        });
      break;
      
    case 'rollback':
      migration.rollback()
        .then(() => {
          console.log('🔄 Rollback completed');
          process.exit(0);
        })
        .catch((error) => {
          console.error('💥 Rollback failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log(`
Usage: node migrate-to-postgresql.js <command>

Commands:
  migrate   - Migrate data from SQLite to PostgreSQL
  rollback  - Rollback migration (drop all PostgreSQL tables)

Environment variables:
  DB_HOST     - PostgreSQL host (default: localhost)
  DB_PORT     - PostgreSQL port (default: 5432)
  DB_NAME     - PostgreSQL database name (default: media_server)
  DB_USER     - PostgreSQL username (default: media_user)
  DB_PASSWORD - PostgreSQL password (required)
  NODE_ENV    - Environment (development/production)
      `);
      process.exit(1);
  }
}

module.exports = PostgreSQLMigration; 