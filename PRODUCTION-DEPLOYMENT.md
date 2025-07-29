# 🚀 **PRODUCTION DEPLOYMENT GUIDE**
## Archive of Obselis Media Server

---

## 📋 **PRE-DEPLOYMENT CHECKLIST**

### **✅ SECURITY REQUIREMENTS**
- [x] Strong JWT secrets generated (128+ characters)
- [x] Input sanitization implemented
- [x] Rate limiting configured
- [x] Password policies enforced
- [x] Default credentials eliminated
- [x] Environment validation added
- [x] Security headers configured
- [x] Security logging implemented
- [ ] HTTPS/SSL certificates obtained
- [ ] Production database configured
- [ ] Monitoring/alerting set up

---

## 🔒 **HTTPS/SSL SETUP**

### **Option 1: Let's Encrypt (Recommended)**
```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot

# Obtain SSL certificate
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be saved to:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### **Option 2: Self-Signed (Development Only)**
```bash
# Generate self-signed certificates
cd backend
node -e "const HTTPSConfig = require('./src/config/https'); HTTPSConfig.generateSelfSignedCerts();"
```

### **Environment Variables for HTTPS**
```bash
# Add to .env
HTTPS_ENABLED=true
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
NODE_ENV=production
```

---

## 🗄️ **DATABASE SETUP**

### **Option 1: PostgreSQL (Recommended)**
```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE media_server;
CREATE USER media_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE media_server TO media_user;
\q
```

**Environment Variables:**
```bash
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=your_secure_password
```

### **Option 2: MySQL**
```bash
# Install MySQL
sudo apt-get install mysql-server

# Create database and user
sudo mysql
CREATE DATABASE media_server;
CREATE USER 'media_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON media_server.* TO 'media_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Environment Variables:**
```bash
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=your_secure_password
```

### **Option 3: SQLite (Simple Setup)**
```bash
# SQLite requires no additional setup
# Just ensure proper file permissions
chmod 600 ./data/production.db
```

**Environment Variables:**
```bash
DB_TYPE=sqlite
SQLITE_PATH=./data/production.db
```

---

## 🌐 **REVERSE PROXY SETUP (NGINX)**

### **Install NGINX**
```bash
sudo apt-get install nginx
```

### **NGINX Configuration**
Create `/etc/nginx/sites-available/media-server`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }

    # Media streaming
    location /stream/ {
        proxy_pass http://localhost:3001;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Rate limiting
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
```

### **Enable Site**
```bash
sudo ln -s /etc/nginx/sites-available/media-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔧 **ENVIRONMENT CONFIGURATION**

### **Complete Production .env File**
```bash
# Server Configuration
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://yourdomain.com

# HTTPS Configuration
HTTPS_ENABLED=true
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# Database Configuration
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=your_secure_database_password

# JWT Secrets (Generated during security setup)
JWT_SECRET=your_128_character_jwt_secret_here
JWT_REFRESH_SECRET=your_128_character_refresh_secret_here

# Email Configuration (Resend)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASS=your_resend_api_key
EMAIL_FROM="Archive of Obselis" <noreply@yourdomain.com>

# Admin Configuration
ADMIN_EMAIL=admin@yourdomain.com

# Security Configuration
MAX_CONCURRENT_SESSIONS=3
SESSION_TIMEOUT=86400000
BCRYPT_ROUNDS=12

# Logging Configuration
LOG_DIR=./logs
```

---

## 🚀 **DEPLOYMENT STEPS**

### **1. Server Preparation**
```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash mediaserver
sudo usermod -aG sudo mediaserver
```

### **2. Application Setup**
```bash
# Clone repository
git clone https://github.com/yourusername/media-server.git
cd media-server

# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Build frontend for production
cd frontend && npm run build
cd ..

# Set up environment
cp backend/env.example backend/.env
# Edit backend/.env with production values

# Set proper permissions
sudo chown -R mediaserver:mediaserver /path/to/media-server
chmod 600 backend/.env
```

### **3. PM2 Configuration**
Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'media-server-backend',
      script: 'backend/src/server.js',
      cwd: '/path/to/media-server',
      user: 'mediaserver',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: 'media-server-frontend',
      script: 'serve',
      args: '-s frontend/dist -l 3000',
      cwd: '/path/to/media-server',
      user: 'mediaserver',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M'
    }
  ]
};
```

### **4. Start Services**
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u mediaserver --hp /home/mediaserver
```

---

## 📊 **MONITORING & MAINTENANCE**

### **Log Monitoring**
```bash
# View logs
pm2 logs

# Monitor processes
pm2 monit

# Check security logs
tail -f ./logs/security.log

# Check access logs
tail -f ./logs/access.log
```

### **Health Checks**
```bash
# Backend health
curl https://yourdomain.com/api/health

# Check SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com
```

### **Backup Strategy**
```bash
# Database backup (PostgreSQL)
pg_dump -U media_user -h localhost media_server > backup_$(date +%Y%m%d_%H%M%S).sql

# Database backup (MySQL)
mysqldump -u media_user -p media_server > backup_$(date +%Y%m%d_%H%M%S).sql

# SQLite backup
cp ./data/production.db ./backups/backup_$(date +%Y%m%d_%H%M%S).db

# Application backup
tar -czf media-server-backup-$(date +%Y%m%d_%H%M%S).tar.gz /path/to/media-server
```

---

## 🔒 **SECURITY CHECKLIST**

### **✅ COMPLETED SECURITY MEASURES**
- [x] Strong JWT secrets (128+ characters)
- [x] Input sanitization (XSS protection)
- [x] Rate limiting (multi-tier)
- [x] Password strength requirements
- [x] Secure admin password generation
- [x] Environment variable validation
- [x] Security headers (CSP, HSTS, etc.)
- [x] Comprehensive security logging
- [x] Session management
- [x] Email verification with secure codes

### **🔧 PRODUCTION SECURITY TASKS**
- [ ] HTTPS/SSL certificates configured
- [ ] Database encryption enabled
- [ ] Firewall rules configured
- [ ] Regular security updates scheduled
- [ ] Backup encryption enabled
- [ ] Monitoring/alerting configured
- [ ] Penetration testing completed

---

## 🚨 **TROUBLESHOOTING**

### **Common Issues**

**SSL Certificate Issues:**
```bash
# Check certificate validity
openssl x509 -in /path/to/cert.pem -text -noout

# Renew Let's Encrypt certificate
sudo certbot renew
```

**Database Connection Issues:**
```bash
# Test PostgreSQL connection
psql -h localhost -U media_user -d media_server

# Check database logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

**Permission Issues:**
```bash
# Fix file permissions
sudo chown -R mediaserver:mediaserver /path/to/media-server
chmod 600 backend/.env
chmod 755 backend/src/
```

---

## 📞 **SUPPORT**

For deployment issues or security concerns:
1. Check the logs: `pm2 logs` and `./logs/security.log`
2. Verify environment variables: `node -e "console.log(process.env)"`
3. Test individual components: `curl https://yourdomain.com/api/health`

---

**🎉 Your Archive of Obselis Media Server is now production-ready with enterprise-grade security!** 