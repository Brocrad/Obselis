# 🔒 SSL/HTTPS Setup Guide

This guide covers setting up SSL/HTTPS for the Media Server with automatic certificate renewal using Let's Encrypt.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Development Setup](#development-setup)
3. [Production Setup](#production-setup)
4. [Certificate Management](#certificate-management)
5. [Troubleshooting](#troubleshooting)
6. [Security Best Practices](#security-best-practices)

## 🚀 Quick Start

### For Development (Self-Signed Certificates)

```bash
# 1. Install dependencies
npm install

# 2. Generate self-signed certificates
npm run ssl:generate

# 3. Enable HTTPS in your .env file
HTTPS_ENABLED=true

# 4. Start the server
npm run dev
```

### For Production (Let's Encrypt)

```bash
# 1. Configure your domain in .env
HTTPS_ENABLED=true
DOMAIN=yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
NODE_ENV=production

# 2. Start the server (certificates will be auto-generated)
npm start
```

## 🛠️ Development Setup

### Prerequisites

- OpenSSL installed on your system
- Node.js and npm

### Step 1: Generate Self-Signed Certificates

```bash
# Generate certificates for development
npm run ssl:generate

# Check SSL status
npm run ssl:status
```

### Step 2: Configure Environment

Add to your `.env` file:

```env
HTTPS_ENABLED=true
DOMAIN=localhost
```

### Step 3: Start Development Server

```bash
npm run dev
```

Your server will be available at:
- HTTPS: `https://localhost:3001`
- HTTP: `http://localhost:3001` (redirects to HTTPS)

### Browser Security Warning

Since self-signed certificates aren't trusted by browsers, you'll see a security warning. This is normal for development. Click "Advanced" → "Proceed to localhost" to continue.

## 🌐 Production Setup

### Prerequisites

- Domain name pointing to your server
- Ports 80 and 443 open on your server
- Server accessible from the internet

### Step 1: DNS Configuration

Ensure your domain points to your server:

```bash
# Check DNS resolution
nslookup yourdomain.com
dig yourdomain.com
```

### Step 2: Environment Configuration

Configure your `.env` file:

```env
# Production SSL Configuration
NODE_ENV=production
HTTPS_ENABLED=true
DOMAIN=yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com

# Server Configuration
PORT=443
```

### Step 3: Start Production Server

```bash
# Start the server
npm start
```

The server will:
1. Automatically request certificates from Let's Encrypt
2. Set up HTTP→HTTPS redirects
3. Schedule automatic certificate renewal

### Step 4: Verify SSL Setup

```bash
# Check SSL status
npm run ssl:status

# Test your domain
curl -I https://yourdomain.com
```

## 🔧 Certificate Management

### SSL Manager Commands

```bash
# Check SSL configuration and certificate status
npm run ssl:status

# Generate self-signed certificates (development)
npm run ssl:generate

# Manually renew certificates
npm run ssl:renew

# Backup current certificates
npm run ssl:backup

# Complete SSL setup (generate + status)
npm run setup:ssl
```

### Manual Certificate Management

```bash
# Using the SSL manager directly
node src/utils/sslManager.js status
node src/utils/sslManager.js generate
node src/utils/sslManager.js renew
node src/utils/sslManager.js backup
```

### Automatic Renewal

Certificates are automatically checked for renewal daily at 2 AM. The system will:

1. Check if certificates expire within 30 days
2. Request new certificates from Let's Encrypt if needed
3. Update certificate files
4. Log renewal status

### Certificate Backup

Before any renewal, backup your certificates:

```bash
npm run ssl:backup
```

Backups are stored in `ssl/backup/` with timestamps.

## 🔍 Troubleshooting

### Common Issues

#### 1. "SSL certificate files not found"

**Solution:**
```bash
# For development
npm run ssl:generate

# For production, ensure domain is configured
DOMAIN=yourdomain.com npm start
```

#### 2. "ACME challenge failed"

**Causes:**
- Domain not pointing to server
- Ports 80/443 not accessible
- Firewall blocking connections

**Solution:**
```bash
# Check domain resolution
nslookup yourdomain.com

# Check port accessibility
telnet yourdomain.com 80
telnet yourdomain.com 443

# Check firewall (Ubuntu/Debian)
sudo ufw status
sudo ufw allow 80
sudo ufw allow 443
```

#### 3. "Certificate renewal failed"

**Solution:**
```bash
# Check SSL status for details
npm run ssl:status

# Backup current certificates
npm run ssl:backup

# Try manual renewal
npm run ssl:renew
```

#### 4. Browser shows "Not Secure"

**For Development:**
- Normal with self-signed certificates
- Click "Advanced" → "Proceed to localhost"

**For Production:**
- Check certificate validity: `npm run ssl:status`
- Verify domain configuration
- Check for mixed content (HTTP resources on HTTPS page)

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=ssl,acme,https
```

### Log Files

Check server logs for SSL-related messages:

```bash
# View recent logs
tail -f logs/app.log

# Search for SSL errors
grep -i ssl logs/app.log
grep -i certificate logs/app.log
```

## 🛡️ Security Best Practices

### 1. Certificate Security

- **Never commit certificates to version control**
- **Set proper file permissions:**
  ```bash
  chmod 600 ssl/key.pem ssl/account.key
  chmod 644 ssl/cert.pem ssl/chain.pem
  ```
- **Regular backups:** `npm run ssl:backup`

### 2. Environment Security

```env
# Use strong, unique values
JWT_SECRET=your_64_character_secret_here
JWT_REFRESH_SECRET=your_64_character_refresh_secret_here

# Production-only settings
NODE_ENV=production
HTTPS_ENABLED=true
```

### 3. Server Security

- **Keep dependencies updated:** `npm audit fix`
- **Use a reverse proxy:** Nginx or Apache
- **Enable firewall:** Only allow necessary ports
- **Regular security updates:** Keep OS updated

### 4. Monitoring

- **Certificate expiry monitoring**
- **SSL Labs testing:** https://www.ssllabs.com/ssltest/
- **Security headers check:** https://securityheaders.com/

## 📊 SSL Configuration Status

Use the SSL manager to check your configuration:

```bash
npm run ssl:status
```

Example output:

```
🔒 SSL CONFIGURATION STATUS
================================

📋 Configuration:
   HTTPS Enabled: ✅
   Environment: Production
   Domain: yourdomain.com
   SSL Directory: /path/to/ssl

📁 Certificate Files:
   Certificate: ✅ /path/to/ssl/cert.pem
   Private Key: ✅ /path/to/ssl/key.pem
   Chain: ✅ /path/to/ssl/chain.pem
   Account Key: ✅ /path/to/ssl/account.key

📜 Certificate Information:
   Subject: CN=yourdomain.com
   Issuer: Let's Encrypt Authority X3
   Valid From: 2024-01-01T00:00:00.000Z
   Valid Until: 2024-04-01T00:00:00.000Z
   Days Until Expiry: 45
   Status: ✅ Valid

💡 Recommendations:
   ✅ SSL configuration looks good!
```

## 🆘 Support

If you encounter issues:

1. **Check the troubleshooting section above**
2. **Run SSL status check:** `npm run ssl:status`
3. **Check server logs for errors**
4. **Verify domain and DNS configuration**
5. **Ensure ports 80 and 443 are accessible**

For additional help, check the server logs and SSL configuration status for specific error messages and recommendations. 