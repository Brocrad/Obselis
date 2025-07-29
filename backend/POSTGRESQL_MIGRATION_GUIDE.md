# 🚀 PostgreSQL Migration Guide

## Overview

This guide will help you migrate your Media Server from SQLite to PostgreSQL for better performance, scalability, and production readiness.

## 📋 Prerequisites

### 1. PostgreSQL Installation

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download from [PostgreSQL official website](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database and user
CREATE DATABASE media_server;
CREATE USER media_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE media_server TO media_user;
GRANT ALL ON SCHEMA public TO media_user;
\q
```

### 3. Install PostgreSQL Driver

The PostgreSQL driver (`pg`) is already included in your `package.json`.

## 🔧 Configuration

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Database Configuration
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=your_secure_password

# For production, add SSL configuration
NODE_ENV=production
```

### 2. Test Configuration

```bash
# Test PostgreSQL connection
cd backend
node -e "
const DatabaseConfig = require('./src/config/database');
const config = new DatabaseConfig();
console.log('Database config:', config.getConfig());
"
```

## 🔄 Migration Process

### Phase 1: Backup Current Data

```bash
# Backup SQLite database
cp backend/database/media_server_dev.db backend/database/media_server_dev_backup.db
```

### Phase 2: Run Migration

```bash
# Navigate to backend directory
cd backend

# Run the migration script
node scripts/migrate-to-postgresql.js migrate
```

### Phase 3: Verify Migration

The migration script will automatically verify:
- All tables were created
- Row counts match between SQLite and PostgreSQL
- Data integrity is maintained

### Phase 4: Test Application

```bash
# Start the application with PostgreSQL
npm run dev
```

## 🧪 Testing Strategy

### 1. Unit Tests

```bash
# Run existing tests
npm test
```

### 2. Integration Tests

Test these key functionalities:
- User registration/login
- Media upload and processing
- Transcoding jobs
- Watch history tracking
- Admin functions

### 3. Performance Tests

```bash
# Test database connection performance
node -e "
const database = require('./src/utils/database');
const start = Date.now();
database.connect().then(() => {
  console.log('Connection time:', Date.now() - start, 'ms');
  return database.query('SELECT COUNT(*) FROM users');
}).then(result => {
  console.log('Query time:', Date.now() - start, 'ms');
  console.log('User count:', result[0].count);
  return database.close();
});
"
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure PostgreSQL is running
```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

#### 2. Authentication Failed
```
Error: password authentication failed for user "media_user"
```
**Solution:** Check user credentials and permissions
```bash
sudo -u postgres psql
\du  # List users
ALTER USER media_user WITH PASSWORD 'new_password';
```

#### 3. Permission Denied
```
Error: permission denied for table users
```
**Solution:** Grant proper permissions
```bash
sudo -u postgres psql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO media_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO media_user;
```

#### 4. SSL Issues
```
Error: no pg_hba.conf entry for host
```
**Solution:** Configure PostgreSQL authentication
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add line: host    all             all             127.0.0.1/32            md5
sudo systemctl restart postgresql
```

### Rollback Plan

If migration fails, you can rollback:

```bash
# Rollback migration
node scripts/migrate-to-postgresql.js rollback

# Restore SQLite backup
cp backend/database/media_server_dev_backup.db backend/database/media_server_dev.db

# Update environment to use SQLite
# Set DB_TYPE=sqlite in .env
```

## 📊 Performance Comparison

### Expected Improvements

1. **Concurrency**: PostgreSQL handles multiple concurrent users much better
2. **Query Performance**: Better indexing and query optimization
3. **Data Integrity**: ACID compliance and better constraint handling
4. **Scalability**: Can handle much larger datasets

### Monitoring

```bash
# Monitor PostgreSQL performance
sudo -u postgres psql
SELECT * FROM pg_stat_activity;
SELECT * FROM pg_stat_database;
```

## 🔒 Security Considerations

### 1. Network Security
```bash
# Configure PostgreSQL to only accept local connections
sudo nano /etc/postgresql/*/main/postgresql.conf
# Set: listen_addresses = 'localhost'
```

### 2. User Permissions
```bash
# Create application-specific user with minimal privileges
CREATE USER media_app WITH ENCRYPTED PASSWORD 'app_password';
GRANT CONNECT ON DATABASE media_server TO media_app;
GRANT USAGE ON SCHEMA public TO media_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO media_app;
```

### 3. SSL/TLS
```bash
# Enable SSL in production
sudo nano /etc/postgresql/*/main/postgresql.conf
# Set: ssl = on
```

## 🚀 Production Deployment

### 1. Environment Setup
```bash
# Production environment variables
NODE_ENV=production
DB_TYPE=postgresql
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=secure_production_password
```

### 2. Database Backup Strategy
```bash
# Automated backup script
#!/bin/bash
pg_dump -h localhost -U media_user media_server > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Monitoring
```bash
# Install monitoring tools
sudo apt install postgresql-contrib
# Enable pg_stat_statements for query monitoring
```

## 📈 Optimization

### 1. Connection Pooling
The application already includes connection pooling configuration in `DatabaseConfig`.

### 2. Indexing
```sql
-- Add indexes for common queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_media_content_uploaded_by ON media_content(uploaded_by);
CREATE INDEX idx_watch_history_user_media ON watch_history(user_id, media_id);
```

### 3. Query Optimization
Monitor slow queries:
```sql
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

## ✅ Migration Checklist

- [ ] PostgreSQL installed and configured
- [ ] Database and user created
- [ ] Environment variables updated
- [ ] SQLite database backed up
- [ ] Migration script executed successfully
- [ ] Data verification completed
- [ ] Application tested with PostgreSQL
- [ ] Performance benchmarks run
- [ ] Security configuration applied
- [ ] Backup strategy implemented
- [ ] Monitoring tools configured

## 🆘 Support

If you encounter issues during migration:

1. Check the migration logs in `backend/logs/migration-log.json`
2. Review PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-*.log`
3. Test database connection manually
4. Verify environment variables
5. Check file permissions

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Knex.js Documentation](https://knexjs.org/)
- [Node.js PostgreSQL Driver](https://node-postgres.com/)

---

**Note:** This migration maintains backward compatibility. You can switch between SQLite and PostgreSQL by changing the `DB_TYPE` environment variable. 