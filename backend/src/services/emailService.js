const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  // Initialize email transporter
  initializeTransporter() {
    // Check if SMTP credentials are provided (for real email sending)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Use real SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Development: Create test account or use console
      this.createTestAccount();
    }
  }

  // Create test account for development
  async createTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });

    } catch (error) {
      console.error('Failed to create test email account:', error);
      // Fallback to console logging
      this.transporter = null;
    }
  }

  // Generate verification code
  generateVerificationCode() {
    // Use cryptographically secure random generation
    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(3); // 3 bytes = 24 bits
    const code = parseInt(randomBytes.toString('hex'), 16) % 900000 + 100000;
    return code.toString().padStart(6, '0');
  }

  // Send verification email
  async sendVerificationEmail(email, code, username) {
    const subject = 'Verify Your Email - Archive of Obselis';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; text-align: center;">Welcome to Archive of Obselis!</h2>
        <p>Hi ${username},</p>
        <p>Thank you for registering! To complete your account setup, please verify your email address using the code below:</p>
        
        <div style="background-color: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 4px;">${code}</h1>
        </div>
        
        <p>This verification code will expire in 10 minutes for security reasons.</p>
        <p>If you didn't create this account, please ignore this email.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">
          This is an automated message from Archive of Obselis. Please do not reply to this email.
        </p>
      </div>
    `;

    const text = `
      Welcome to Archive of Obselis!
      
      Hi ${username},
      
      Thank you for registering! To complete your account setup, please verify your email address using this code:
      
      ${code}
      
      This verification code will expire in 10 minutes for security reasons.
      If you didn't create this account, please ignore this email.
    `;

    // Use keymaster@archiveofobselis.com for verification emails
    return await this.sendEmail(
      email, 
      subject, 
      text, 
      html,
      '"Keymaster of Obselis" <keymaster@archiveofobselis.com>' // Custom sender for verification codes
    );
  }

  // Send email
  async sendEmail(to, subject, text, html, from) {
    if (!this.transporter) {
      // Fallback: Log to console in development
      console.log('📧 [DEV] Email would be sent (no transporter configured):', {
        to,
        subject,
        from: from || process.env.EMAIL_FROM || '"Archive of Obselis" <noreply@archiveofobselis.com>'
      });
      return { success: true, messageId: 'console-log' };
    }

    try {
      const mailOptions = {
        from: from || process.env.EMAIL_FROM || '"Archive of Obselis" <noreply@archiveofobselis.com>',
        to,
        subject,
        text,
        html
      };

      console.log('📧 Sending email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        hasText: !!mailOptions.text,
        hasHtml: !!mailOptions.html
      });

      const info = await this.transporter.sendMail(mailOptions);

      console.log('📧 Email sent successfully:', {
        messageId: info.messageId,
        response: info.response
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send email:', error);
      console.error('Email error details:', {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
      return { success: false, error: error.message };
    }
  }

  // Verify transporter configuration
  async verifyConnection() {
    if (!this.transporter) {
      return { success: false, error: 'No transporter configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(email, resetToken, username) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: '"Warden of Obselis" <warden@archiveofobselis.com>', // Custom sender for password resets
      to: email,
      subject: 'Password Reset Request - Archive of Obselis',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">🔐 Password Reset</h1>
              <p style="color: #666; margin: 10px 0 0 0;">Archive of Obselis</p>
            </div>
            
            <div style="margin-bottom: 30px;">
              <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 0 0 15px 0;">
                Hello <strong>${username}</strong>,
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 0 0 15px 0;">
                We received a request to reset your password for your Archive of Obselis account. If you didn't make this request, you can safely ignore this email.
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 0 0 25px 0;">
                To reset your password, click the button below:
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 10px 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #007bff; font-size: 14px; word-break: break-all; margin: 0 0 15px 0;">
                ${resetUrl}
              </p>
              <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0;">
                This password reset link will expire in 1 hour for security reasons.
              </p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This is an automated message from Archive of Obselis. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info)
      };
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send password change verification email
  async sendPasswordChangeEmail(email, changeToken, username) {
    const changeUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/change-password?token=${changeToken}`;
    
    const mailOptions = {
      from: '"Warden of Obselis" <warden@archiveofobselis.com>', // Custom sender for password changes
      to: email,
      subject: 'Password Change Verification - Archive of Obselis',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">🔒 Password Change Request</h1>
              <p style="color: #666; margin: 10px 0 0 0;">Archive of Obselis</p>
            </div>
            
            <div style="margin-bottom: 30px;">
              <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 0 0 15px 0;">
                Hello <strong>${username}</strong>,
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 0 0 15px 0;">
                You requested to change your password for your Archive of Obselis account. For security reasons, we need to verify this request via email.
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 0 0 25px 0;">
                To proceed with changing your password, click the button below:
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${changeUrl}" 
                 style="display: inline-block; background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Change Password
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 10px 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #007bff; font-size: 14px; word-break: break-all; margin: 0 0 15px 0;">
                ${changeUrl}
              </p>
              <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 15px 0;">
                This password change link will expire in 15 minutes for security reasons.
              </p>
              <p style="color: #e74c3c; font-size: 14px; line-height: 1.5; margin: 0;">
                <strong>Important:</strong> If you didn't request this password change, please ignore this email and consider changing your password immediately.
              </p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                This is an automated message from Archive of Obselis. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info)
      };
    } catch (error) {
      console.error('❌ Failed to send password change email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService();
