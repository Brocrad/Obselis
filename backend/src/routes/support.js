const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const adminWhitelistService = require('../services/adminWhitelistService');

/**
 * POST /api/support/contact
 * Send a support email to QuietQuill
 */
router.post('/contact', authenticateToken, async (req, res) => {
  try {
    const { name, email, subject, message, errorDetails } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Get admin emails for forwarding
    const adminEmails = await adminWhitelistService.getAdminEmailList();
    
    if (adminEmails.length === 0) {
      console.warn('⚠️ No admin emails found in whitelist for support forwarding');
      return res.status(500).json({
        success: false,
        message: 'Support system temporarily unavailable. Please try again later.'
      });
    }

    // Prepare email content
    const emailSubject = subject || '📜 Summons from the Archive - Support Beacon';
    const emailText = `
📜 SUMMONS FROM THE ARCHIVE - Archive of Obselis
===============================================

👤 SEEKER'S IDENTITY
--------------------
Name: ${name}
Email: ${email}
Subject: ${subject || 'Support Request'}

💬 SEEKER'S PLEA
----------------
${message}

${errorDetails ? `
⚠️ MYSTICAL DISTURBANCE
-----------------------
${errorDetails}
` : ''}

🔧 ARCANE TRACES
----------------
Timestamp: ${new Date().toISOString()}
IP Address: ${req.ip}
URL: ${req.headers.referer || 'Unknown'}
User Agent: ${req.headers['user-agent']}

===============================================
Transcribed by QuietQuill, Keeper of the Archive
Archive of Obselis • Support Beacon
    `.trim();
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Support Request - Archive of Obselis</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; position: relative; overflow: hidden;">
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);"></div>
            <div style="position: relative; z-index: 1;">
              <div style="font-size: 48px; margin-bottom: 10px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📧</div>
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                📜 Summons from the Archive
              </h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                Archive of Obselis • Support Beacon
              </p>
            </div>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px;">
            
            <!-- User Information -->
            <div style="background-color: #334155; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #667eea; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h3 style="color: #e2e8f0; margin: 0 0 15px 0; font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">👤</span>
                Seeker's Identity
              </h3>
              <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                <p style="margin: 8px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 60px;">Name:</span>
                  <span style="color: #f1f5f9;">${name}</span>
                </p>
                <p style="margin: 8px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 60px;">Email:</span>
                  <span style="color: #60a5fa; text-decoration: underline;">${email}</span>
                </p>
                <p style="margin: 8px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 60px;">Subject:</span>
                  <span style="color: #f1f5f9;">${subject || 'Support Request'}</span>
                </p>
              </div>
            </div>
            
            <!-- Message -->
            <div style="background-color: #334155; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #10b981; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h3 style="color: #e2e8f0; margin: 0 0 15px 0; font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">💬</span>
                Seeker's Plea
              </h3>
              <div style="background-color: #475569; border-radius: 6px; padding: 15px; margin-top: 10px; border: 1px solid #64748b;">
                <p style="color: #e2e8f0; margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${message}</p>
              </div>
            </div>
            
            ${errorDetails ? `
            <!-- Error Details -->
            <div style="background-color: #334155; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #f59e0b; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h3 style="color: #e2e8f0; margin: 0 0 15px 0; font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">⚠️</span>
                Mystical Disturbance
              </h3>
              <div style="background-color: #451a03; border-radius: 6px; padding: 15px; margin-top: 10px; border: 1px solid #92400e;">
                <pre style="color: #fbbf24; margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; overflow-x: auto; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${errorDetails}</pre>
              </div>
            </div>
            ` : ''}
            
            <!-- Technical Information -->
            <div style="background-color: #334155; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #8b5cf6; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h3 style="color: #e2e8f0; margin: 0 0 15px 0; font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">🔧</span>
                Arcane Traces
              </h3>
              <div style="color: #cbd5e1; font-size: 12px; line-height: 1.5;">
                <p style="margin: 6px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 80px;">Timestamp:</span>
                  <span style="color: #94a3b8; font-family: monospace;">${new Date().toISOString()}</span>
                </p>
                <p style="margin: 6px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 80px;">IP Address:</span>
                  <span style="color: #60a5fa; font-family: monospace;">${req.ip}</span>
                </p>
                <p style="margin: 6px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 80px;">URL:</span>
                  <span style="color: #60a5fa; font-family: monospace;">${req.headers.referer || 'Unknown'}</span>
                </p>
                <p style="margin: 6px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #e2e8f0; font-weight: 600; min-width: 80px;">User Agent:</span>
                  <span style="color: #94a3b8; font-family: monospace; font-size: 11px;">${req.headers['user-agent']}</span>
                </p>
              </div>
            </div>
            
          </div>
          
          <!-- Footer -->
          <div style="background-color: #0f172a; padding: 20px; text-align: center; border-top: 1px solid #334155;">
            <div style="color: #64748b; font-size: 12px; line-height: 1.4;">
              <div style="margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span style="font-size: 16px;">📜</span>
                <span>This summons was received through the Archive of Obselis support beacon</span>
              </div>
              <div style="color: #475569; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span style="font-size: 14px;">👑</span>
                <span>Transcribed by QuietQuill, Keeper of the Archive</span>
              </div>
            </div>
          </div>
          
        </div>
      </body>
      </html>
    `;

    // Send the email to all admin emails
    console.log(`📧 Attempting to send support email to ${adminEmails.length} admin(s): ${adminEmails.join(', ')}`);
    
    const emailResult = await emailService.sendEmail(
      adminEmails.join(', '), // to
      emailSubject,           // subject
      emailText,              // text
      emailHtml,              // html
      '"QuietQuill of Obselis" <QuietQuill@archiveofobselis.com>' // from
    );

    // Check if email was sent successfully
    if (!emailResult.success) {
      console.error('Failed to send support email:', emailResult.error);
      throw new Error(`Email sending failed: ${emailResult.error}`);
    }
    
    console.log(`✅ Support email sent successfully. Message ID: ${emailResult.messageId}`);

    // Log the support request with error code if present
    const errorCodeMatch = message.match(/Error Code: ([A-Z0-9-]+)/);
    const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'NO_CODE';
    
    console.log(`📧 Support email sent from ${email} to ${adminEmails.length} admin(s): ${adminEmails.join(', ')}`);
    console.log(`🔍 Error Code: ${errorCode}`);
    
    // Log detailed error information for debugging
    if (errorCode !== 'NO_CODE') {
      console.log(`🔧 Error Details for ${errorCode}:`, {
        timestamp: new Date().toISOString(),
        userEmail: email,
        adminRecipients: adminEmails,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        referer: req.headers.referer,
        errorDetails: errorDetails || 'No additional details'
      });
    }

    res.json({
      success: true,
      message: 'Support message sent successfully'
    });

  } catch (error) {
    console.error('Error sending support email:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send support message. Please try again later.'
    });
  }
});

/**
 * GET /api/support/status
 * Check if support system is available
 */
router.get('/status', async (req, res) => {
  try {
    const adminEmails = await adminWhitelistService.getAdminEmailList();
    const stats = await adminWhitelistService.getWhitelistStats();
    
    res.json({
      success: true,
      message: 'Support system is available',
      adminCount: adminEmails.length,
      whitelistStats: stats,
      systemStatus: adminEmails.length > 0 ? 'operational' : 'no_admins_configured'
    });
  } catch (error) {
    console.error('Error getting support status:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to check support system status'
    });
  }
});

/**
 * GET /api/support/whitelist
 * Get admin whitelist (admin only)
 */
router.get('/whitelist', authenticateToken, async (req, res) => {
  try {
    // Check if current user is admin
    const isAdmin = await adminWhitelistService.isAdmin(req.user.id);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const adminEmails = await adminWhitelistService.getAdminEmails();
    const additionalEmails = await adminWhitelistService.getAdditionalSupportEmails();
    const stats = await adminWhitelistService.getWhitelistStats();
    
    res.json({
      success: true,
      admins: adminEmails,
      additionalEmails: additionalEmails,
      stats: stats
    });
  } catch (error) {
    console.error('Error getting admin whitelist:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to retrieve admin whitelist'
    });
  }
});

/**
 * POST /api/support/whitelist/refresh
 * Manually refresh the admin whitelist cache (admin only)
 */
router.post('/whitelist/refresh', authenticateToken, async (req, res) => {
  try {
    // Check if current user is admin
    const isAdmin = await adminWhitelistService.isAdmin(req.user.id);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    adminWhitelistService.clearCache();
    const adminEmails = await adminWhitelistService.getAdminEmails();
    
    res.json({
      success: true,
      message: 'Admin whitelist cache refreshed successfully',
      adminCount: adminEmails.length
    });
  } catch (error) {
    console.error('Error refreshing admin whitelist:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to refresh admin whitelist'
    });
  }
});

/**
 * POST /api/support/emails/add
 * Add an email to the support whitelist (admin only)
 */
router.post('/emails/add', authenticateToken, async (req, res) => {
  try {
    // Check if current user is admin
    const isAdmin = await adminWhitelistService.isAdmin(req.user.id);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    const result = await adminWhitelistService.addSupportEmail(email, name, req.user.id);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error adding support email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to add email to support whitelist'
    });
  }
});

/**
 * DELETE /api/support/emails/:emailId
 * Remove an email from the support whitelist (admin only)
 */
router.delete('/emails/:emailId', authenticateToken, async (req, res) => {
  try {
    // Check if current user is admin
    const isAdmin = await adminWhitelistService.isAdmin(req.user.id);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const emailId = parseInt(req.params.emailId);
    if (isNaN(emailId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email ID'
      });
    }

    const result = await adminWhitelistService.removeSupportEmail(emailId, req.user.id);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error removing support email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to remove email from support whitelist'
    });
  }
});

module.exports = router; 