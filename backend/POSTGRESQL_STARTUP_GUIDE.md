# 🗄️ PostgreSQL Startup Guide for Media Server

## 📋 Quick Start

### Option 1: Automated Setup (Recommended)
```bash
cd backend
npm run db:setup-local-postgresql
```

### Option 2: Manual Setup
Follow the detailed steps below.

---

## 🚀 Installation & Setup

### 1. Install PostgreSQL

**Windows:**
1. Download from [PostgreSQL official website](https://www.postgresql.org/download/windows/)
2. Run the installer (default port: 5432)
3. Remember the password you set for the `postgres` user
4. Add PostgreSQL to your PATH: `C:\Program Files\PostgreSQL\17\bin`

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Verify Installation
```bash
psql --version
```

---

## 🔧 Database Setup

### Automated Setup (Recommended)
```bash
cd backend
npm run db:setup-local-postgresql
```

This script will:
- ✅ Check PostgreSQL installation
- ✅ Create `media_server` database
- ✅ Create `media_user` with password `media_password`
- ✅ Grant necessary permissions
- ✅ Create `.env.postgresql-local` configuration file

### Manual Setup

**Step 1: Connect to PostgreSQL**
```bash
# Windows (as Administrator)
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres

# macOS/Linux
sudo -u postgres psql
```

**Step 2: Create Database and User**
```sql
-- Create database
CREATE DATABASE media_server;

-- Create user
CREATE USER media_user WITH PASSWORD 'media_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE media_server TO media_user;
GRANT ALL ON SCHEMA public TO media_user;

-- Exit psql
\q
```

---

## ⚙️ Configuration

### 1. Environment Setup

Copy the generated `.env.postgresql-local` to `.env`:
```bash
cp .env.postgresql-local .env
```

Or manually add to your `.env` file:
```bash
# Database Configuration
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=media_password

# Environment
NODE_ENV=development
```

### 2. Test Connection
```bash
npm run db:test-connection
```

Expected output: `✅ Database connection successful`

---

## 🔄 Migration from SQLite

### 1. Backup Current Data
```bash
# Backup SQLite database
cp database/media_server_dev.db database/media_server_dev_backup.db
```

### 2. Run Migration
```bash
npm run db:migrate-to-postgresql
```

### 3. Verify Migration
The script will automatically verify:
- ✅ All tables created
- ✅ Row counts match
- ✅ Data integrity maintained

---

## 🚀 Starting the Server

### 1. Start PostgreSQL Service

**Windows:**
```bash
# PostgreSQL should start automatically with Windows
# To check status:
services.msc
# Look for "postgresql-x64-17" service
```

**macOS:**
```bash
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo systemctl start postgresql
sudo systemctl status postgresql
```

### 2. Start Media Server
```bash
cd backend
npm run dev
```

---

## 🔍 Troubleshooting

### Connection Issues

**Error: "connection refused"**
```bash
# Check if PostgreSQL is running
# Windows:
services.msc
# Look for "postgresql-x64-17"

# macOS:
brew services list | grep postgresql

# Linux:
sudo systemctl status postgresql
```

**Error: "authentication failed"**
```bash
# Reset postgres user password
sudo -u postgres psql
ALTER USER postgres PASSWORD 'new_password';
\q
```

**Error: "database does not exist"**
```bash
# Create database manually
sudo -u postgres createdb media_server
```

### Permission Issues

**Error: "permission denied"**
```bash
# Grant permissions again
sudo -u postgres psql -d media_server
GRANT ALL PRIVILEGES ON DATABASE media_server TO media_user;
GRANT ALL ON SCHEMA public TO media_user;
\q
```

### Port Issues

**Error: "port 5432 already in use"**
```bash
# Check what's using the port
netstat -an | grep 5432

# Kill the process or change PostgreSQL port
# Edit postgresql.conf and change port = 5433
```

---

## 📊 Database Management

### Useful Commands

**Connect to Database:**
```bash
psql -h localhost -U media_user -d media_server
```

**List Tables:**
```sql
\dt
```

**View Table Structure:**
```sql
\d table_name
```

**Backup Database:**
```bash
pg_dump -h localhost -U media_user media_server > backup.sql
```

**Restore Database:**
```bash
psql -h localhost -U media_user media_server < backup.sql
```

---

## 🔒 Security Notes

### Production Setup
1. **Change default passwords**
2. **Use SSL connections**
3. **Restrict network access**
4. **Regular backups**
5. **Update PostgreSQL regularly**

### Environment Variables for Production
```bash
DB_TYPE=postgresql
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=media_server
DB_USER=your_user
DB_PASSWORD=your_secure_password
NODE_ENV=production
DB_SSL=true
```

---

## 📝 Quick Reference

| Command | Description |
|---------|-------------|
| `npm run db:setup-local-postgresql` | Automated PostgreSQL setup |
| `npm run db:test-connection` | Test database connection |
| `npm run db:migrate-to-postgresql` | Migrate from SQLite |
| `npm run dev` | Start development server |
| `psql --version` | Check PostgreSQL version |
| `brew services start postgresql` | Start PostgreSQL (macOS) |
| `sudo systemctl start postgresql` | Start PostgreSQL (Linux) |

---

## 🆘 Getting Help

### Common Issues
1. **PostgreSQL not starting** - Check service status
2. **Connection refused** - Verify PostgreSQL is running
3. **Authentication failed** - Check username/password
4. **Permission denied** - Verify user permissions

### Useful Resources
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Knex.js Documentation](https://knexjs.org/)
- [Node.js pg Driver](https://node-postgres.com/)

---

## ✅ Verification Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `media_server` created
- [ ] User `media_user` created with proper permissions
- [ ] Environment variables configured
- [ ] Connection test successful
- [ ] Migration completed (if migrating from SQLite)
- [ ] Media server starts without errors
- [ ] Database tables created and accessible

---

**🎉 You're ready to use PostgreSQL with your Media Server!** 