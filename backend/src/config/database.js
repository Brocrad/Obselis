const path = require('path');

class DatabaseConfig {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.databaseType = process.env.DB_TYPE || 'sqlite';
    this.config = this.getConfig();
  }

  getConfig() {
    switch (this.databaseType.toLowerCase()) {
      case 'postgresql':
      case 'postgres':
        return this.getPostgreSQLConfig();
      
      case 'mysql':
        return this.getMySQLConfig();
      
      case 'sqlite':
      default:
        return this.getSQLiteConfig();
    }
  }

  getSQLiteConfig() {
    const dbPath = this.environment === 'production' 
      ? process.env.SQLITE_PATH || './data/production.db'
      : './data/media_server.db';

    return {
      type: 'sqlite',
      database: dbPath,
      options: {
        // Enable WAL mode for better concurrency
        pragma: {
          journal_mode: 'WAL',
          synchronous: 'NORMAL',
          cache_size: -64000, // 64MB cache
          temp_store: 'MEMORY',
          mmap_size: 268435456, // 256MB
          optimize: true
        }
      }
    };
  }

  getPostgreSQLConfig() {
    return {
      type: 'postgresql',
      host: process.env.DB_HOST || '127.0.0.1', // Use IPv4 instead of localhost
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'media_server',
      username: process.env.DB_USER || 'media_user',
      password: process.env.DB_PASSWORD,
      options: {
        ssl: this.environment === 'production' ? {
          rejectUnauthorized: false // Set to true with proper certificates
        } : false,
        pool: {
          min: 2,
          max: 10,
          acquire: 30000,
          idle: 10000
        },
        dialectOptions: {
          connectTimeout: 60000,
          acquireTimeout: 60000,
          timeout: 60000
        }
      }
    };
  }

  getMySQLConfig() {
    return {
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      database: process.env.DB_NAME || 'media_server',
      username: process.env.DB_USER || 'media_user',
      password: process.env.DB_PASSWORD,
      options: {
        ssl: this.environment === 'production' ? {
          rejectUnauthorized: false // Set to true with proper certificates
        } : false,
        pool: {
          min: 2,
          max: 10,
          acquire: 30000,
          idle: 10000
        },
        dialectOptions: {
          connectTimeout: 60000,
          acquireTimeout: 60000,
          timeout: 60000,
          charset: 'utf8mb4'
        }
      }
    };
  }

  // Validate database configuration
  validate() {
    const errors = [];

    if (this.databaseType !== 'sqlite') {
      if (!process.env.DB_PASSWORD) {
        errors.push('DB_PASSWORD is required for production databases');
      }
      
      if (!process.env.DB_NAME) {
        errors.push('DB_NAME is required for production databases');
      }
      
      if (!process.env.DB_USER) {
        errors.push('DB_USER is required for production databases');
      }
    }

    if (this.environment === 'production' && this.databaseType === 'sqlite') {
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Get connection string for logging (without password)
  getConnectionString() {
    switch (this.databaseType) {
      case 'postgresql':
        return `postgresql://${this.config.username}@${this.config.host}:${this.config.port}/${this.config.database}`;
      
      case 'mysql':
        return `mysql://${this.config.username}@${this.config.host}:${this.config.port}/${this.config.database}`;
      
      case 'sqlite':
      default:
        return `sqlite://${this.config.database}`;
    }
  }

  // Database security recommendations
  getSecurityRecommendations() {
    const recommendations = [];

    if (this.environment === 'production') {
      if (this.databaseType !== 'sqlite') {
        recommendations.push('✅ Using production database (PostgreSQL/MySQL)');
        
        if (this.config.options.ssl) {
          recommendations.push('✅ SSL/TLS encryption enabled');
        } else {
          recommendations.push('⚠️  Consider enabling SSL/TLS encryption');
        }
        
        recommendations.push('💡 Ensure database user has minimal required privileges');
        recommendations.push('💡 Enable database audit logging');
        recommendations.push('💡 Set up database backups');
        recommendations.push('💡 Configure database firewall rules');
      } else {
        recommendations.push('⚠️  Using SQLite in production');
        recommendations.push('💡 Consider migrating to PostgreSQL or MySQL');
        recommendations.push('💡 Ensure database file has proper permissions (600)');
        recommendations.push('💡 Set up regular database backups');
      }
    } else {
      recommendations.push('ℹ️  Development environment detected');
      recommendations.push('💡 Use PostgreSQL/MySQL in production');
    }

    return recommendations;
  }
}

module.exports = DatabaseConfig; 
