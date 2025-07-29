const HTTPSConfig = require('../config/https');
const fs = require('fs');
const path = require('path');

class SSLManager {
  constructor() {
    this.httpsConfig = new HTTPSConfig();
  }

  // Display certificate information
  async getCertificateStatus() {
    const certInfo = this.httpsConfig.getCertificateInfo();
    
    if (!certInfo) {
      return {
        status: 'No certificate found',
        exists: false
      };
    }

    const now = new Date();
    const expiryDate = new Date(certInfo.notAfter);
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    return {
      status: 'Certificate found',
      exists: true,
      subject: certInfo.subject,
      issuer: certInfo.issuer,
      validFrom: certInfo.notBefore,
      validUntil: certInfo.notAfter,
      daysUntilExpiry: daysUntilExpiry,
      isExpired: expiryDate <= now,
      needsRenewal: daysUntilExpiry <= 30,
      serialNumber: certInfo.serialNumber,
      fingerprint: certInfo.fingerprint
    };
  }

  // Manual certificate renewal
  async renewCertificate() {
    
    try {
      await this.httpsConfig.renewCertificates();
      return { success: true, message: 'Certificate renewal completed' };
    } catch (error) {
      console.error('❌ Certificate renewal failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Generate self-signed certificates for development
  async generateSelfSigned() {
    
    try {
      const success = await this.httpsConfig.generateSelfSignedCerts();
      if (success) {
        return { success: true, message: 'Self-signed certificates generated successfully' };
      } else {
        return { success: false, error: 'Failed to generate self-signed certificates' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Check if SSL is properly configured
  async checkSSLConfiguration() {
    const config = {
      httpsEnabled: this.httpsConfig.httpsEnabled,
      isProduction: this.httpsConfig.isProduction,
      domain: this.httpsConfig.domain,
      sslDir: this.httpsConfig.sslDir
    };

    const files = {
      certExists: fs.existsSync(this.httpsConfig.certPath),
      keyExists: fs.existsSync(this.httpsConfig.keyPath),
      chainExists: fs.existsSync(this.httpsConfig.chainPath),
      accountKeyExists: fs.existsSync(this.httpsConfig.accountKeyPath)
    };

    const certStatus = await this.getCertificateStatus();

    return {
      config,
      files,
      certificate: certStatus,
      recommendations: this.getRecommendations(config, files, certStatus)
    };
  }

  // Get SSL configuration recommendations
  getRecommendations(config, files, certStatus) {
    const recommendations = [];

    if (!config.httpsEnabled) {
      recommendations.push({
        type: 'warning',
        message: 'HTTPS is disabled. Enable it by setting HTTPS_ENABLED=true in your .env file'
      });
    }

    if (config.isProduction && config.domain === 'localhost') {
      recommendations.push({
        type: 'error',
        message: 'Production environment detected but domain is set to localhost. Set DOMAIN in your .env file'
      });
    }

    if (!files.certExists || !files.keyExists) {
      recommendations.push({
        type: 'error',
        message: 'SSL certificate files are missing. Run certificate generation or renewal'
      });
    }

    if (certStatus.exists && certStatus.needsRenewal) {
      recommendations.push({
        type: 'warning',
        message: `SSL certificate expires in ${certStatus.daysUntilExpiry} days. Consider renewing soon`
      });
    }

    if (certStatus.exists && certStatus.isExpired) {
      recommendations.push({
        type: 'error',
        message: 'SSL certificate has expired. Immediate renewal required'
      });
    }

    if (config.isProduction && !files.chainExists) {
      recommendations.push({
        type: 'warning',
        message: 'Certificate chain file not found. This may cause trust issues with some clients'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'SSL configuration looks good!'
      });
    }

    return recommendations;
  }

  // Display formatted SSL status
  async displayStatus() {
    const status = await this.checkSSLConfiguration();
    
    
    
    
    if (status.certificate.exists) {
    }
    
    status.recommendations.forEach(rec => {
      const icon = rec.type === 'error' ? '❌' : rec.type === 'warning' ? '⚠️ ' : '✅';
    });
    
    return status;
  }

  // Backup current certificates
  async backupCertificates() {
    const backupDir = path.join(this.httpsConfig.sslDir, 'backup');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);
    
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      fs.mkdirSync(backupPath, { recursive: true });
      
      const filesToBackup = [
        { src: this.httpsConfig.certPath, name: 'cert.pem' },
        { src: this.httpsConfig.keyPath, name: 'key.pem' },
        { src: this.httpsConfig.chainPath, name: 'chain.pem' },
        { src: this.httpsConfig.fullchainPath, name: 'fullchain.pem' },
        { src: this.httpsConfig.accountKeyPath, name: 'account.key' }
      ];
      
      let backedUpFiles = 0;
      filesToBackup.forEach(file => {
        if (fs.existsSync(file.src)) {
          fs.copyFileSync(file.src, path.join(backupPath, file.name));
          backedUpFiles++;
        }
      });
      
      return { success: true, backupPath, filesBackedUp: backedUpFiles };
      
    } catch (error) {
      console.error('❌ Certificate backup failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// CLI interface
if (require.main === module) {
  const sslManager = new SSLManager();
  const command = process.argv[2];
  
  async function runCommand() {
    switch (command) {
      case 'status':
        await sslManager.displayStatus();
        break;
        
      case 'renew':
        const renewResult = await sslManager.renewCertificate();
        break;
        
      case 'generate':
        const genResult = await sslManager.generateSelfSigned();
        break;
        
      case 'backup':
        const backupResult = await sslManager.backupCertificates();
        break;
        
      default:
        break;
    }
  }
  
  runCommand().catch(console.error);
}

module.exports = SSLManager; 
