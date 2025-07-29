const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const database = require('../utils/database');
const emailService = require('./emailService');
const sessionService = require('./sessionService');

// Authentication service - no debug logs for security
class AuthService {
  // Generate JWT token
  generateToken(user, sessionId = null) {
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'user',
      is_admin: user.is_admin, // Keep for backward compatibility
      tokenVersion: user.token_version || null,
      sessionId: sessionId
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'media-server'
    });
  }

  // Generate refresh token
  generateRefreshToken(user) {
    const payload = {
      id: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: 'media-server'
    });
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // Verify token and check if it's still valid (not invalidated by logout all devices)
  async verifyTokenWithUser(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user data to check token version
      const userData = await this.findUserById(decoded.id);
      if (!userData) {
        throw new Error('User not found');
      }

      // If user has a token_version and it doesn't match the token's version, token is invalid
      if (userData.token_version && decoded.tokenVersion !== userData.token_version) {
        throw new Error('Token has been invalidated');
      }

      // If token has a session ID, validate the session
      // Note: Older tokens might not have sessionId, so we only validate if it exists
      if (decoded.sessionId) {
        const session = await sessionService.getSessionById(decoded.sessionId);
        if (!session || session.user_id !== decoded.id) {
          throw new Error('Session has been invalidated');
        }
        
        // Update session activity
        await sessionService.updateSessionActivity(decoded.sessionId);
      }
      // If no sessionId in token, it's an older token - still valid but no session tracking

      return decoded;
    } catch (error) {
      console.error('🚨 Token verification error:', error.message);
      throw new Error('Invalid token');
    }
  }

  // Step 1: Validate invite code and prepare for registration
  async validateInviteForRegistration(inviteCode) {
    const invite = await this.validateInviteToken(inviteCode);
    if (!invite) {
      throw new Error('Invalid or expired invite code');
    }
    return { valid: true, invite };
  }

  // Step 2: Create email verification record and send verification email
  async initiateEmailVerification(username, email, password, inviteCode) {
    // Validate invite code first
    const invite = await this.validateInviteToken(inviteCode);
    if (!invite) {
      throw new Error('Invalid or expired invite code');
    }

    // Validate input
    const userData = { username, email, password };
    const validation = User.validate(userData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // Check if user already exists
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const existingUsername = await this.findUserByUsername(username);
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Hash password
    const passwordHash = await User.hashPassword(password);

    // Generate verification code
    const verificationCode = emailService.generateVerificationCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

    // Clean up any existing verification records for this email
    await database.knex('email_verifications').where('email', email).del();

    // Store verification data
    const sql = `
      INSERT INTO email_verifications (email, code, username, password_hash, invite_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await database.insert(sql, [
      email,
      verificationCode,
      username,
      passwordHash,
      inviteCode,
      expiresAt.toISOString()
    ]);

    // Send verification email
    const emailResult = await emailService.sendVerificationEmail(email, verificationCode, username);
    
    if (!emailResult.success) {
      throw new Error('Failed to send verification email. Please try again.');
    }

    return {
      message: 'Verification email sent. Please check your email and enter the verification code.',
      email: email
    };
  }

  // Step 3: Verify email code and complete registration
  async completeEmailVerification(email, code) {
    // Find verification record
    const sql = `
      SELECT * FROM email_verifications 
      WHERE email = ? AND code = ? AND verified = false AND expires_at > NOW()
    `;
    
    const verifications = await database.query(sql, [email, code]);
    const verification = verifications[0];

    if (!verification) {
      throw new Error('Invalid or expired verification code');
    }




    // Validate invite code is still valid
    const invite = await this.validateInviteToken(verification.invite_token);
    if (!invite) {
      throw new Error('Invite code has expired during verification process');
    }

    // Create the user account
    const userSql = `
      INSERT INTO users (username, email, password_hash, is_admin, email_verified, email_verified_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `;
    
    const result = await database.insert(userSql, [
      verification.username,
      verification.email,
      verification.password_hash,
      false // Regular users are not admin by default
    ]);



    // Mark verification as used
    await database.knex('email_verifications')
      .where('id', verification.id)
      .update({ verified: true });

    // Mark invite as used
    await this.useInviteToken(verification.invite_token, result.id);

    // Get the created user
    const newUser = await this.findUserById(result.id);
    const user = new User(newUser);

    // Generate tokens for immediate login
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      message: 'Email verified and registration completed successfully',
      user: user.toSafeObject(),
      token,
      refreshToken
    };
  }

  // Legacy register method for admin creation
  async registerAdmin(userData) {
    // Validate input
    const validation = User.validate(userData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // Check if user already exists
    const existingUser = await this.findUserByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const existingUsername = await this.findUserByUsername(userData.username);
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Hash password
    const passwordHash = await User.hashPassword(userData.password);

    // Insert user into database
    const sql = `
      INSERT INTO users (username, email, password_hash, is_admin, email_verified, email_verified_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `;
    
    const result = await database.insert(sql, [
      userData.username,
      userData.email,
      passwordHash,
      userData.is_admin || false
    ]);

    // Get the created user
    const newUser = await this.findUserById(result.id);
    return new User(newUser);
  }

  // Login user
  async login(email, password, req) {
    // Find user by email
    const userData = await this.findUserByEmail(email);
    if (!userData) {
      throw new Error('Invalid email or password');
    }

    const user = new User(userData);

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is disabled');
    }

    // Check if email is verified (except for admin users created before email verification was implemented)
    if (!user.email_verified && !user.is_admin) {
      throw new Error('Please verify your email address before logging in');
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Create session
    const sessionId = await sessionService.createSession(user.id, req);

    // Generate tokens with session ID
    const token = this.generateToken(user, sessionId);
    const refreshToken = this.generateRefreshToken(user);

    return {
      user: user.toSafeObject(),
      token,
      refreshToken,
      sessionId
    };
  }

  // Find user by ID
  async findUserById(id) {
    const sql = 'SELECT * FROM users WHERE id = ?';
    const users = await database.query(sql, [id]);
    return users[0] || null;
  }

  // Find user by email
  async findUserByEmail(email) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const users = await database.query(sql, [email]);
    return users[0] || null;
  }

  // Find user by username
  async findUserByUsername(username) {
    const sql = 'SELECT * FROM users WHERE username = ?';
    const users = await database.query(sql, [username]);
    return users[0] || null;
  }

  // Check if username is available
  async isUsernameAvailable(username) {
    const user = await this.findUserByUsername(username);
    return user === null;
  }

  // Get count of admin users
  async getAdminCount() {
    const sql = 'SELECT COUNT(*) as count FROM users WHERE is_admin = true';
    const result = await database.query(sql);
    return result[0]?.count || 0;
  }

  // Create default admin user if none exists
  async createDefaultAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourdomain.com';
    const existingAdmin = await this.findUserByEmail(adminEmail);
    
    if (!existingAdmin) {
      // Use a compliant default password
      const randomPassword = 'Admin2024!';
      
      const defaultAdmin = {
        username: 'admin',
        email: adminEmail,
        password: randomPassword, // Compliant default password
        is_admin: true
      };

      const admin = await this.registerAdmin(defaultAdmin);
      
      // Write admin credentials to a secure file instead of console
      const fs = require('fs');
      const path = require('path');
      const credentialsFile = path.join(__dirname, '../../admin-credentials.txt');
      const credentialsContent = `ADMIN CREDENTIALS - DELETE THIS FILE AFTER FIRST LOGIN\n` +
                                `Email: ${adminEmail}\n` +
                                `Password: ${randomPassword}\n` +
                                `Created: ${new Date().toISOString()}\n`;
      
      try {
        fs.writeFileSync(credentialsFile, credentialsContent, { mode: 0o600 }); // Readable only by owner
      } catch (error) {
        console.error('❌ Failed to write admin credentials file:', error.message);
      }
      
      return admin;
    }

    return null;
  }

  // Refresh token
  async refreshToken(refreshToken, req = null) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      const userData = await this.findUserById(payload.id);
      if (!userData) {
        throw new Error('User not found');
      }

      const user = new User(userData);
      
      // Create a session if request is provided (for tokens without sessions)
      let sessionId = null;
      if (req) {
        sessionId = await sessionService.createSession(user.id, req);
      }
      
      const newToken = this.generateToken(user, sessionId);
      const newRefreshToken = this.generateRefreshToken(user);

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      console.error('🚨 Refresh token error:', error.message);
      throw new Error('Invalid refresh token');
    }
  }

  // Generate random invite token
  generateInviteToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  // Create invite token
  async createInviteToken(createdBy, expiresInDays = 7, maxUses = 1, isIndefinite = false) {
    const token = this.generateInviteToken();
    const expiresAt = new Date();
    
    if (isIndefinite) {
      // For indefinite tokens, set initial expiry to 7 days from now
      expiresAt.setDate(expiresAt.getDate() + 7);
      maxUses = -1; // -1 indicates unlimited uses
    } else {
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    await database.knex('invite_tokens').insert({
      token,
      created_by: createdBy,
      expires_at: expiresAt.toISOString(),
      max_uses: maxUses,
      is_indefinite: isIndefinite
    });

    return {
      token,
      expires_at: expiresAt.toISOString(),
      max_uses: maxUses,
      current_uses: 0,
      is_indefinite: isIndefinite
    };
  }

  // Validate invite token
  async validateInviteToken(token) {
    const invites = await database.knex('invite_tokens')
      .select('*')
      .where('token', token)
      .where(function() {
        this.where('expires_at', '>', database.knex.fn.now())
            .orWhere('is_indefinite', true);
      })
      .where(function() {
        this.where('current_uses', '<', database.knex.ref('max_uses'))
            .orWhere('max_uses', -1);
      });
    
    return invites[0] || null;
  }

  // Use invite token
  async useInviteToken(token, usedBy) {
    await database.knex('invite_tokens')
      .where('token', token)
      .update({
        current_uses: database.knex.raw('current_uses + 1'),
        used_by: usedBy,
        used_at: database.knex.fn.now()
      });
  }

  // Get all invite tokens
  async getAllInviteTokens() {
    return await database.knex('invite_tokens as it')
      .select([
        'it.*',
        'creator.username as created_by_username',
        'user.username as used_by_username', 
        'user.email as used_by_email',
        'user.display_name as used_by_display_name'
      ])
      .leftJoin('users as creator', 'it.created_by', 'creator.id')
      .leftJoin('users as user', 'it.used_by', 'user.id')
      .orderBy('it.created_at', 'desc');
  }

  // Delete invite token
  async deleteInviteToken(token) {
    await database.knex('invite_tokens')
      .where('token', token)
      .del();
  }

  // Send invite code via email
  async sendInviteEmail(inviteToken, recipientEmail, senderName) {
    const emailService = require('./emailService');
    
    const registrationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?invite=${inviteToken}`;
    
    const subject = `You're invited to join ${process.env.APP_NAME || 'Archive of Obselis'}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; text-align: center;">🎉 You're Invited!</h2>
        
        <p style="color: #666; font-size: 16px;">
          <strong>${senderName}</strong> has invited you to join <strong>${process.env.APP_NAME || 'Archive of Obselis'}</strong>.
        </p>
        
        <div style="background-color: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #333; margin: 0 0 10px 0; font-weight: bold;">Your invite code:</p>
          <div style="font-family: monospace; font-size: 20px; background-color: #e9ecef; padding: 15px; border-radius: 4px; margin: 0; word-break: break-all; text-align: center; letter-spacing: 2px; font-weight: bold; color: #007bff;">
            ${inviteToken}
          </div>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${registrationUrl}"
             style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">
            🚀 Register Now
          </a>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">
            <strong>Can't click the button?</strong> Copy and paste this link into your browser:
          </p>
          <p style="color: #007bff; font-size: 14px; word-break: break-all; margin: 0; font-family: monospace;">
            ${registrationUrl}
          </p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          This invitation was sent by ${senderName}. If you didn't expect this invitation, you can safely ignore this email.<br>
          This is an automated message from ${process.env.APP_NAME || 'Archive of Obselis'}. Please do not reply to this email.
        </p>
      </div>
    `;
    
    const textContent = `
🎉 You're invited to join ${process.env.APP_NAME || 'Archive of Obselis'}!

${senderName} has sent you an invitation to register.

Your invite code: ${inviteToken}

Register at: ${registrationUrl}

If you can't click the link, copy and paste it into your browser.

This invitation was sent by ${senderName}. If you didn't expect this invitation, you can safely ignore this email.
    `;
    
    try {
      // Use oracle@archiveofobselis.com for invite emails
      const result = await emailService.sendEmail(
        recipientEmail, 
        subject, 
        textContent, 
        htmlContent,
        '"Oracle of Obselis" <oracle@archiveofobselis.com>' // Custom sender for invites
      );
      
      if (result.success) {
      } else {
        throw new Error(result.error || 'Email sending failed');
      }
    } catch (error) {
      console.error('Failed to send invite email:', error);
      
      // For development, log the email content so you can still test
      if (process.env.NODE_ENV === 'development') {
      }
      
      // Re-throw the error so the API can handle it
      throw error;
    }
  }

  // Get all users
  async getAllUsers() {
    const sql = 'SELECT * FROM users ORDER BY created_at DESC';
    const users = await database.query(sql);
    return users.map(userData => new User(userData));
  }

  // Delete user
  async deleteUser(userId) {
    // Get user info before deletion for logging
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    // Prevent deletion of the last admin user
    if (userData.role === 'admin' || userData.is_admin) {
      const adminCount = await database.knex('users')
        .where('role', 'admin')
        .orWhere('is_admin', true)
        .count('* as count');
      
      if (adminCount[0].count <= 1) {
        throw new Error('Cannot delete the last administrator. Please create another admin account first.');
      }
    }

    // Clean up all user-related data before deleting the user
    try {
      console.log(`🗑️ Starting deletion process for user: ${userData.username} (ID: ${userId})`);
      
      // 1. Deactivate all user sessions
      const sessionResult = await sessionService.deactivateAllUserSessions(userId);
      console.log(`   ✅ Deactivated ${sessionResult} user sessions`);
      
      // 2. Clean up password reset tokens
      const resetTokensDeleted = await database.knex('password_resets').where('email', userData.email).del();
      console.log(`   ✅ Deleted ${resetTokensDeleted} password reset tokens`);
      
      // 3. Clean up password change tokens
      const changeTokensDeleted = await database.knex('password_changes').where('user_id', userId).del();
      console.log(`   ✅ Deleted ${changeTokensDeleted} password change tokens`);
      
      // 4. Clean up email verification records
      const verificationRecordsDeleted = await database.knex('email_verifications').where('email', userData.email).del();
      console.log(`   ✅ Deleted ${verificationRecordsDeleted} email verification records`);
      
      // 5. Clean up user sessions
      const userSessionsDeleted = await database.knex('user_sessions').where('user_id', userId).del();
      console.log(`   ✅ Deleted ${userSessionsDeleted} user sessions`);
      
      // 6. Clean up unused invite tokens created by this user (preserve used ones)
      const unusedInviteTokensDeleted = await database.knex('invite_tokens')
        .where('created_by', userId)
        .where('used_at', null)
        .del();
      console.log(`   ✅ Deleted ${unusedInviteTokensDeleted} unused invite tokens created by user`);
      
      // Note: Used invite tokens are preserved to maintain the invitation history
      
      // 7. Clean up monthly bandwidth records
      const bandwidthRecordsDeleted = await database.knex('monthly_bandwidth').where('user_id', userId).del();
      console.log(`   ✅ Deleted ${bandwidthRecordsDeleted} monthly bandwidth records`);
      
      // 8. Clean up streaming sessions
      const streamingSessionsDeleted = await database.knex('streaming_sessions').where('user_id', userId).del();
      console.log(`   ✅ Deleted ${streamingSessionsDeleted} streaming sessions`);
      
      // 9. Clean up watch history
      const watchHistoryDeleted = await database.knex('watch_history').where('user_id', userId).del();
      console.log(`   ✅ Deleted ${watchHistoryDeleted} watch history records`);
      
      // 10. Finally, delete the user (this will free up the username)
      const result = await database.knex('users').where('id', userId).del();
      
      if (result === 0) {
        throw new Error('User not found');
      }
      
      console.log(`   ✅ Deleted user record. Username "${userData.username}" is now available for reuse.`);
      
      // Log the account deletion
      const securityLogger = require('../middleware/securityLogger');
      securityLogger.logAccountDeletion(userId, 'admin', { ip: '127.0.0.1' });
      
      return { 
        changes: result,
        message: `User "${userData.username}" deleted successfully. Username is now available for reuse.`,
        cleanupSummary: {
          sessions: sessionResult,
          resetTokens: resetTokensDeleted,
          changeTokens: changeTokensDeleted,
          verificationRecords: verificationRecordsDeleted,
          userSessions: userSessionsDeleted,
          inviteTokens: inviteTokensDeleted,
          bandwidthRecords: bandwidthRecordsDeleted,
          streamingSessions: streamingSessionsDeleted,
          watchHistory: watchHistoryDeleted
        }
      };
      
    } catch (error) {
      console.error('❌ Error during user deletion cleanup:', error);
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  // Update user admin status (legacy method - kept for backward compatibility)
  async updateUserAdminStatus(userId, isAdmin) {
    const role = isAdmin ? 'admin' : 'user';
    const sql = 'UPDATE users SET is_admin = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const result = await database.update(sql, [isAdmin ? 1 : 0, role, userId]);
    
    if (result.changes === 0) {
      throw new Error('User not found');
    }
    
    const userData = await this.findUserById(userId);
    return new User(userData);
  }

  // Update user role
  async updateUserRole(userId, newRole, adminUserId) {
    // Validate role
    const validRoles = ['admin', 'manager', 'user'];
    if (!validRoles.includes(newRole)) {
      throw new Error('Invalid role. Must be admin, manager, or user');
    }

    // Get the user being updated
    const targetUser = await this.findUserById(userId);
    if (!targetUser) {
      throw new Error('User not found');
    }

    // Get the admin making the change
    const adminUser = await this.findUserById(adminUserId);
    if (!adminUser || (adminUser.role !== 'admin' && !adminUser.is_admin)) {
      throw new Error('Only administrators can change user roles');
    }

    // Prevent admin from demoting themselves
    if (parseInt(userId) === parseInt(adminUserId) && newRole !== 'admin') {
      throw new Error('Cannot remove your own admin privileges');
    }

    // Update role and is_admin flag for backward compatibility
    const isAdmin = newRole === 'admin' ? 1 : 0;
    const sql = 'UPDATE users SET role = ?, is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    
    const result = await database.update(sql, [newRole, isAdmin, userId]);
    
    if (result.changes === 0) {
      throw new Error('User not found');
    }
    
    const userData = await this.findUserById(userId);
    return new User(userData);
  }

  // Get users by role
  async getUsersByRole(role) {
    const sql = 'SELECT * FROM users WHERE role = ? ORDER BY created_at DESC';
    const users = await database.query(sql, [role]);
    return users.map(userData => new User(userData));
  }

  // Get role statistics
  async getRoleStatistics() {
    const sql = `
      SELECT 
        role,
        COUNT(*) as count,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
      FROM users 
      GROUP BY role
      ORDER BY 
        CASE role 
          WHEN 'admin' THEN 1 
          WHEN 'manager' THEN 2 
          WHEN 'user' THEN 3 
          ELSE 4 
        END
    `;
    
    return await database.query(sql);
  }

  // Renew indefinite invite tokens (called by cron job)
  async renewIndefiniteInvites() {
    const sql = `
      SELECT * FROM invite_tokens 
      WHERE is_indefinite = true AND expires_at <= NOW() + INTERVAL '1 day'
    `;
    
    const expiringSoonInvites = await database.query(sql);
    
    let renewedCount = 0;
    
    for (const invite of expiringSoonInvites) {
      // Generate new token
      const newToken = this.generateInviteToken();
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7); // Renew for another 7 days
      
      // Update the invite with new token and expiry
      const updateSql = `
        UPDATE invite_tokens
        SET token = ?, expires_at = ?, last_renewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      await database.update(updateSql, [newToken, newExpiresAt.toISOString(), invite.id]);
      
      // Log renewal without exposing tokens
      renewedCount++;
    }
    
    return renewedCount;
  }

  // Clean up expired email verification codes
  async cleanupExpiredVerifications() {
    const sql = 'DELETE FROM email_verifications WHERE expires_at <= NOW()';
    const result = await database.update(sql);
    return result.changes;
  }

  // Start indefinite invite renewal cron job
  startIndefiniteInviteRenewal() {
    // Run every hour
    setInterval(async () => {
      try {
        const renewedCount = await this.renewIndefiniteInvites();
        if (renewedCount > 0) {
        }

        // Also cleanup expired verification codes
        const cleanedCount = await this.cleanupExpiredVerifications();
        if (cleanedCount > 0) {
        }
      } catch (error) {
        console.error('Error in maintenance tasks:', error);
      }
    }, 60 * 60 * 1000); // 1 hour in milliseconds
    
  }

  // User Profile Management Methods

  // Get user profile
  async getUserProfile(userId) {
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }
    const user = new User(userData);
    return user.toSafeObject();
  }

  // Update user profile
  async updateUserProfile(userId, profileData) {
    // Validate profile data
    const validation = User.validateProfileUpdate(profileData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // Check if user exists
    const existingUser = await this.findUserById(userId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Check for username conflicts if username is being updated
    if (profileData.username && profileData.username !== existingUser.username) {
      const usernameExists = await this.findUserByUsername(profileData.username);
      if (usernameExists) {
        throw new Error('Username already taken');
      }
    }

    // Check for email conflicts if email is being updated
    if (profileData.email && profileData.email !== existingUser.email) {
      const emailExists = await this.findUserByEmail(profileData.email);
      if (emailExists) {
        throw new Error('Email already in use');
      }
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (profileData.username !== undefined) {
      updateFields.push('username = ?');
      updateValues.push(profileData.username);
    }

    if (profileData.email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(profileData.email);
      // If email is changed, mark as unverified
      updateFields.push('email_verified = ?');
      updateValues.push(false);
      updateFields.push('email_verified_at = ?');
      updateValues.push(null);
    }

    if (profileData.display_name !== undefined) {
      updateFields.push('display_name = ?');
      updateValues.push(profileData.display_name);
    }

    if (profileData.bio !== undefined) {
      updateFields.push('bio = ?');
      updateValues.push(profileData.bio);
    }

    if (profileData.profile_picture !== undefined) {
      updateFields.push('profile_picture = ?');
      updateValues.push(profileData.profile_picture);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(userId);

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    await database.update(sql, updateValues);

    // Return updated user profile
    return await this.getUserProfile(userId);
  }

  // Initiate password change (send email verification)
  async initiatePasswordChange(userId, currentPassword) {
    // Get user
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    const user = new User(userData);

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Generate change token
    const changeToken = this.generatePasswordResetToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

    // Clean up any existing change tokens for this user
    await database.query('DELETE FROM password_changes WHERE user_id = ?', [userId]);

    // Store change token
    const sql = `
      INSERT INTO password_changes (user_id, email, token, expires_at)
      VALUES (?, ?, ?, ?)
    `;
    
    await database.insert(sql, [userId, userData.email, changeToken, expiresAt.toISOString()]);

    // Send password change email
    const emailResult = await emailService.sendPasswordChangeEmail(userData.email, changeToken, userData.username);
    
    if (!emailResult.success) {
      throw new Error('Failed to send password change email. Please try again.');
    }

    return { message: 'Password change verification email sent. Please check your email and click the link to proceed.' };
  }

  // Validate password change token
  async validatePasswordChangeToken(token) {
    const sql = `
      SELECT pc.*, u.username, u.email 
      FROM password_changes pc
      JOIN users u ON pc.user_id = u.id
              WHERE pc.token = ? AND pc.used = false AND pc.expires_at > NOW()
    `;
    
    const changes = await database.query(sql, [token]);
    return changes[0] || null;
  }

  // Complete password change with new password
  async completePasswordChange(token, newPassword) {
    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      throw new Error('New password is required');
    }

    const { isStrongPassword } = require('../middleware/security');
    if (!isStrongPassword(newPassword)) {
      throw new Error('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    // Validate change token
    const changeData = await this.validatePasswordChangeToken(token);
    if (!changeData) {
      throw new Error('Invalid or expired password change token');
    }

    // Hash new password
    const newPasswordHash = await User.hashPassword(newPassword);

    // Update password
    const updateSql = 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await database.update(updateSql, [newPasswordHash, changeData.user_id]);

    // Mark change token as used
    const markUsedSql = 'UPDATE password_changes SET used = 1 WHERE token = ?';
    await database.update(markUsedSql, [token]);

    return { message: 'Password changed successfully' };
  }

  // Password Reset Methods

  // Generate password reset token
  generatePasswordResetToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  // Initiate password reset
  async initiatePasswordReset(email) {
    // Check if user exists
    const userData = await this.findUserByEmail(email);
    if (!userData) {
      // Don't reveal if email exists or not for security
      return { message: 'If an account with that email exists, a password reset link has been sent.' };
    }

    // Generate reset token
    const resetToken = this.generatePasswordResetToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    // Clean up any existing reset tokens for this email
    await database.knex('password_resets').where('email', email).del();

    // Store reset token
    const sql = `
      INSERT INTO password_resets (email, token, expires_at)
      VALUES (?, ?, ?)
    `;
    
    await database.insert(sql, [email, resetToken, expiresAt.toISOString()]);

    // Send password reset email
    const emailResult = await emailService.sendPasswordResetEmail(email, resetToken, userData.username);
    
    if (!emailResult.success) {
      throw new Error('Failed to send password reset email. Please try again.');
    }

    return { message: 'If an account with that email exists, a password reset link has been sent.' };
  }

  // Validate password reset token
  async validatePasswordResetToken(token) {
    const sql = `
      SELECT * FROM password_resets 
      WHERE token = ? AND used = false AND expires_at > NOW()
    `;
    
    const resets = await database.query(sql, [token]);
    return resets[0] || null;
  }

  // Complete password reset
  async completePasswordReset(token, newPassword) {
    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      throw new Error('New password is required');
    }

    const { isStrongPassword } = require('../middleware/security');
    if (!isStrongPassword(newPassword)) {
      throw new Error('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    // Validate reset token
    const resetData = await this.validatePasswordResetToken(token);
    if (!resetData) {
      throw new Error('Invalid or expired password reset token');
    }

    // Get user
    const userData = await this.findUserByEmail(resetData.email);
    if (!userData) {
      throw new Error('User not found');
    }

    // Hash new password
    const newPasswordHash = await User.hashPassword(newPassword);

    // Update password
    const updateSql = 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?';
    await database.update(updateSql, [newPasswordHash, resetData.email]);

    // Mark reset token as used
    const markUsedSql = 'UPDATE password_resets SET used = 1 WHERE token = ?';
    await database.update(markUsedSql, [token]);

    return { message: 'Password reset successfully' };
  }

  // Upload profile picture
  async updateProfilePicture(userId, filename) {
    // Check if user exists
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    // Update profile picture
    const sql = 'UPDATE users SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await database.update(sql, [filename, userId]);

    // Return updated user profile
    return await this.getUserProfile(userId);
  }

  // Delete profile picture
  async deleteProfilePicture(userId) {
    // Check if user exists
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    // Remove profile picture
    const sql = 'UPDATE users SET profile_picture = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await database.update(sql, [userId]);

    // Return updated user profile
    return await this.getUserProfile(userId);
  }

  // Logout all devices by invalidating all tokens for a user
  async logoutAllDevices(userId) {
    // Check if user exists
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    // Generate a new token version to invalidate all existing tokens
    const crypto = require('crypto');
    const tokenVersion = crypto.randomBytes(16).toString('hex');

    // Update user's token version - this will invalidate all existing tokens
    const sql = 'UPDATE users SET token_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await database.update(sql, [tokenVersion, userId]);

    // Deactivate all user sessions
    await sessionService.deactivateAllUserSessions(userId);

    // Clean up any password reset tokens for this user
    await database.knex('password_resets').where('email', userData.email).del();
    
    // Clean up any password change tokens for this user
    await database.knex('password_changes').where('user_id', userId).del();

    return { 
      message: 'Successfully logged out of all devices. You will need to log in again.',
      tokenVersion 
    };
  }

  // Get active sessions for a user
  async getUserSessions(userId, currentSessionId = null) {
    // Check if user exists
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    return await sessionService.getUserSessions(userId, currentSessionId);
  }

  // Logout from a specific session
  async logoutSession(userId, sessionId) {
    // Check if user exists
    const userData = await this.findUserById(userId);
    if (!userData) {
      throw new Error('User not found');
    }

    const success = await sessionService.deactivateSession(sessionId, userId);
    if (!success) {
      throw new Error('Session not found or already inactive');
    }

    // Emit Socket.IO event to notify the specific session that it has been logged out
    if (global.io && global.sessionSockets) {
      const sessionSockets = global.sessionSockets.get(sessionId);
      if (sessionSockets && sessionSockets.size > 0) {
        // Send logout notification to all sockets for this session
        sessionSockets.forEach(socketId => {
          const socket = global.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('session-invalidated', { 
              sessionId: sessionId,
              userId: userId,
              message: 'Your session has been logged out from another device',
              action: 'logout'
            });
          }
        });
        
        // Clean up session tracking
        sessionSockets.forEach(socketId => {
          global.socketSessions.delete(socketId);
        });
        global.sessionSockets.delete(sessionId);
      } else {
      }
    }

    return { message: 'Session logged out successfully' };
  }
}

module.exports = new AuthService(); 
