const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const acme = require('acme-client');
const cron = require('node-cron');

class HTTPSConfig {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.httpsEnabled = process.env.HTTPS_ENABLED === 'true';
    this.domain = process.env.DOMAIN || 'localhost';
    this.email = process.env.ADMIN_EMAIL || 'admin@yourdomain.com';
    this.sslOptions = null;
    this.acmeClient = null;
    
    // SSL paths
    this.sslDir = path.join(__dirname, '../../ssl');
    this.certPath = path.join(this.sslDir, 'cert.pem');
    this.keyPath = path.join(this.sslDir, 'key.pem');
    this.chainPath = path.join(this.sslDir, 'chain.pem');
    this.fullchainPath = path.join(this.sslDir, 'fullchain.pem');
    this.accountKeyPath = path.join(this.sslDir, 'account.key');
    
    if (this.httpsEnabled) {
      this.initializeSSL();
    }
  }

  async initializeSSL() {
    try {
      // Ensure SSL directory exists
      if (!fs.existsSync(this.sslDir)) {
        fs.mkdirSync(this.sslDir, { recursive: true, mode: 0o700 });
      }

      // Check if we're using Let's Encrypt or custom certificates
      if (this.isProduction && this.domain !== 'localhost') {
        await this.initializeLetsEncrypt();
      } else {
        await this.initializeSelfSigned();
      }

      // Schedule certificate renewal check
      this.scheduleCertificateRenewal();
      
    } catch (error) {
      console.error('❌ Failed to initialize SSL:', error.message);
      this.httpsEnabled = false;
    }
  }

  async initializeLetsEncrypt() {
    
    try {
      // Initialize ACME client
      await this.createAcmeClient();
      
      // Check if certificates exist and are valid
      if (await this.certificatesExistAndValid()) {
        this.loadCertificates();
        return;
      }

      // Request new certificates
      await this.requestCertificates();
      
    } catch (error) {
      console.error('❌ Let\'s Encrypt initialization failed:', error.message);
      await this.initializeSelfSigned();
    }
  }

  async createAcmeClient() {
    // Create or load account key
    let accountKey;
    
    if (fs.existsSync(this.accountKeyPath)) {
      accountKey = fs.readFileSync(this.accountKeyPath);
    } else {
      accountKey = await acme.crypto.createPrivateKey();
      fs.writeFileSync(this.accountKeyPath, accountKey, { mode: 0o600 });
    }

    // Initialize ACME client
    this.acmeClient = new acme.Client({
      directoryUrl: this.isProduction 
        ? acme.directory.letsencrypt.production 
        : acme.directory.letsencrypt.staging,
      accountKey: accountKey
    });

    // Register account if needed
    try {
      await this.acmeClient.getAccountUrl();
    } catch (error) {
      await this.acmeClient.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${this.email}`]
      });
    }
  }

  async requestCertificates() {
    // Generate certificate key
    const [certificateKey, csr] = await acme.crypto.createCsr({
      commonName: this.domain,
      altNames: [`www.${this.domain}`]
    });

    // Request certificate
    const certificate = await this.acmeClient.auto({
      csr,
      email: this.email,
      termsOfServiceAgreed: true,
      challengeCreateFn: this.createChallenge.bind(this),
      challengeRemoveFn: this.removeChallenge.bind(this)
    });

    // Save certificates
    fs.writeFileSync(this.keyPath, certificateKey, { mode: 0o600 });
    fs.writeFileSync(this.certPath, certificate.cert, { mode: 0o644 });
    fs.writeFileSync(this.chainPath, certificate.chain, { mode: 0o644 });
    fs.writeFileSync(this.fullchainPath, certificate.cert + certificate.chain, { mode: 0o644 });

    this.loadCertificates();
  }

  async createChallenge(authz, challenge, keyAuthorization) {
    
    if (challenge.type === 'http-01') {
      // Create challenge directory
      const challengeDir = path.join(__dirname, '../../.well-known/acme-challenge');
      if (!fs.existsSync(challengeDir)) {
        fs.mkdirSync(challengeDir, { recursive: true });
      }
      
      // Write challenge file
      const challengePath = path.join(challengeDir, challenge.token);
      fs.writeFileSync(challengePath, keyAuthorization);
      
    }
  }

  async removeChallenge(authz, challenge, keyAuthorization) {
    
    if (challenge.type === 'http-01') {
      const challengePath = path.join(__dirname, '../../.well-known/acme-challenge', challenge.token);
      if (fs.existsSync(challengePath)) {
        const database = require('../utils/database');
        await database.insert(
          `INSERT INTO deletion_schedule \
           (file_path, file_type, media_id, scheduled_for, reason) \
           VALUES (?, ?, NULL, ?, ?)`,
          [challengePath, 'acme_challenge', null, new Date().toISOString(), 'acme_challenge_removed']
        );
      }
    }
  }

  async initializeSelfSigned() {
    
    // Check if self-signed certificates exist
    if (fs.existsSync(this.certPath) && fs.existsSync(this.keyPath)) {
      this.loadCertificates();
      return;
    }

    // Generate self-signed certificates
    if (await this.generateSelfSignedCerts()) {
      this.loadCertificates();
    } else {
      throw new Error('Failed to generate self-signed certificates');
    }
  }

  loadCertificates() {
    try {
      this.sslOptions = {
        key: fs.readFileSync(this.keyPath),
        cert: fs.readFileSync(this.certPath)
      };

      // Add chain if available
      if (fs.existsSync(this.chainPath)) {
        this.sslOptions.ca = fs.readFileSync(this.chainPath);
      }

    } catch (error) {
      console.error('❌ Failed to load SSL certificates:', error.message);
      this.httpsEnabled = false;
    }
  }

  async certificatesExistAndValid() {
    if (!fs.existsSync(this.certPath) || !fs.existsSync(this.keyPath)) {
      return false;
    }

    try {
      const cert = fs.readFileSync(this.certPath, 'utf8');
      const certInfo = await acme.crypto.readCertificateInfo(cert);
      
      // Check if certificate expires within 30 days
      const expiryDate = new Date(certInfo.notAfter);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      if (expiryDate <= thirtyDaysFromNow) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error checking certificate validity:', error.message);
      return false;
    }
  }

  scheduleCertificateRenewal() {
    // Check for renewal every day at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.renewCertificatesIfNeeded();
    });

  }

  async renewCertificatesIfNeeded() {
    if (!this.isProduction || this.domain === 'localhost') {
      return; // Skip renewal for development
    }

    try {
      if (!(await this.certificatesExistAndValid())) {
        await this.requestCertificates();
        
        // Reload certificates in the running server
        this.loadCertificates();
        
        // For now, log a message
      }
    } catch (error) {
      console.error('❌ Certificate renewal failed:', error.message);
    }
  }

  createServer(app) {
    if (this.httpsEnabled && this.sslOptions) {
      // Create HTTPS server
      const httpsServer = https.createServer(this.sslOptions, app);
      
      // Also create HTTP server for Let's Encrypt challenges and redirects
      const httpApp = require('express')();
      
      // Serve ACME challenges
      httpApp.use('/.well-known/acme-challenge', require('express').static(
        path.join(__dirname, '../../.well-known/acme-challenge')
      ));
      
      // Redirect all other HTTP traffic to HTTPS
      httpApp.use('*', (req, res) => {
        res.redirect(301, `https://${req.get('host')}${req.url}`);
      });
      
      // Start HTTP server on port 80 (only in production)
      if (this.isProduction) {
        const httpServer = http.createServer(httpApp);
        httpServer.listen(80, () => {
        });
      } else {
      }
      
      return httpsServer;
    }
    // Always return an HTTP server instance, never just the Express app
    return http.createServer(app);
  }

  getSecurityHeaders() {
    const headers = {};
    
    if (this.httpsEnabled) {
      // HSTS (HTTP Strict Transport Security)
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
      
      // Enhanced CSP for HTTPS
      headers['Content-Security-Policy'] = 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https:; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' https:; " +
        "connect-src 'self' https:; " +
        "media-src 'self' https:; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "upgrade-insecure-requests";
      
      // Additional security headers
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'DENY';
      headers['X-XSS-Protection'] = '1; mode=block';
      headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    }
    
    return headers;
  }

  // Middleware to redirect HTTP to HTTPS in production
  redirectToHTTPS() {
    return (req, res, next) => {
      if (this.isProduction && this.httpsEnabled && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
      }
      next();
    };
  }

  // Generate self-signed certificates for development
  async generateSelfSignedCerts() {
    try {
      
      // Try Node.js crypto method first (works without OpenSSL binary)
      if (await this.generateCertsWithNodeCrypto()) {
        return true;
      }
      
      // Fallback to OpenSSL command if available
      return await this.generateCertsWithOpenSSL();
      
    } catch (error) {
      console.error('❌ Failed to generate SSL certificates:', error.message);
      return false;
    }
  }

  // Generate certificates using Node.js crypto (no OpenSSL binary required)
  async generateCertsWithNodeCrypto() {
    try {
      const crypto = require('crypto');
      const forge = require('node-forge');
      
      
      // Generate a key pair
      const keys = forge.pki.rsa.generateKeyPair(2048);
      
      // Create a certificate
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
      
      // Set certificate attributes
      const attrs = [{
        name: 'countryName',
        value: 'US'
      }, {
        name: 'stateOrProvinceName',
        value: 'Development'
      }, {
        name: 'localityName',
        value: 'Local'
      }, {
        name: 'organizationName',
        value: 'Media-Server'
      }, {
        name: 'commonName',
        value: 'localhost'
      }];
      
      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      
      // Add extensions for localhost and common development domains
      cert.setExtensions([{
        name: 'basicConstraints',
        cA: true
      }, {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
      }, {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
      }, {
        name: 'nsCertType',
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true
      }, {
        name: 'subjectAltName',
        altNames: [{
          type: 2, // DNS
          value: 'localhost'
        }, {
          type: 2, // DNS
          value: '*.localhost'
        }, {
          type: 7, // IP
          ip: '127.0.0.1'
        }, {
          type: 7, // IP
          ip: '::1'
        }]
      }]);
      
      // Self-sign certificate
      cert.sign(keys.privateKey);
      
      // Convert to PEM format
      const certPem = forge.pki.certificateToPem(cert);
      const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
      
      // Write files
      fs.writeFileSync(this.certPath, certPem, { mode: 0o644 });
      fs.writeFileSync(this.keyPath, keyPem, { mode: 0o600 });
      
      
      return true;
      
    } catch (error) {
      return false;
    }
  }

  // Generate certificates using OpenSSL command (fallback)
  async generateCertsWithOpenSSL() {
    const { execSync } = require('child_process');
    
    try {
      
      // Generate private key
      execSync(`openssl genrsa -out "${this.keyPath}" 2048`, { stdio: 'pipe' });
      
      // Generate certificate with SAN for localhost and common development domains
      const subj = '/C=US/ST=Development/L=Local/O=Media-Server/CN=localhost';
      const san = 'DNS:localhost,DNS:*.localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:::1';
      
      execSync(`openssl req -new -x509 -key "${this.keyPath}" -out "${this.certPath}" -days 365 -subj "${subj}" -extensions v3_req -config <(echo '[req]'; echo 'distinguished_name=req'; echo '[v3_req]'; echo 'subjectAltName=${san}')`, 
        { stdio: 'pipe', shell: '/bin/bash' });
      
      // Set proper permissions
      fs.chmodSync(this.keyPath, 0o600);
      fs.chmodSync(this.certPath, 0o644);
      
      
      return true;
    } catch (error) {
      
      try {
        // Fallback method without SAN
        execSync(`openssl req -new -x509 -key "${this.keyPath}" -out "${this.certPath}" -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`, { stdio: 'pipe' });
        
        fs.chmodSync(this.keyPath, 0o600);
        fs.chmodSync(this.certPath, 0o644);
        
        return true;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  // Manual certificate renewal trigger
  async renewCertificates() {
    await this.renewCertificatesIfNeeded();
  }

  // Get certificate information
  getCertificateInfo() {
    if (!fs.existsSync(this.certPath)) {
      return null;
    }

    try {
      const cert = fs.readFileSync(this.certPath, 'utf8');
      return acme.crypto.readCertificateInfo(cert);
    } catch (error) {
      console.error('Error reading certificate info:', error.message);
      return null;
    }
  }
}

module.exports = HTTPSConfig; 
