require('dotenv').config();

const DatabaseConfig = require('./src/config/database');

const dbConfig = new DatabaseConfig();
const config = dbConfig.getConfig();

module.exports = {
  development: {
    client: config.type === 'postgresql' ? 'pg' : 'sqlite3',
    connection: config.type === 'postgresql' ? {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.options.ssl
    } : {
      filename: process.env.DATABASE_PATH || './database/media_server_dev.db'
    },
    useNullAsDefault: config.type === 'sqlite',
    pool: config.type === 'postgresql' ? {
      min: 2,
      max: 10,
      idleTimeoutMillis: 10000
    } : undefined,
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  },
  
  production: {
    client: config.type === 'postgresql' ? 'pg' : 'sqlite3',
    connection: config.type === 'postgresql' ? {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.options.ssl
    } : {
      filename: process.env.DATABASE_PATH || './database/media_server.db'
    },
    useNullAsDefault: config.type === 'sqlite',
    pool: config.type === 'postgresql' ? {
      min: 2,
      max: 10,
      idleTimeoutMillis: 10000
    } : undefined,
    migrations: {
      directory: './database/migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  }
}; 