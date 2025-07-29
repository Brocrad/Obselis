const express = require('express');
const authService = require('../services/authService');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const securityLogger = require('../middleware/securityLogger');
const router = express.Router();

// Apply auth rate limiting to sensitive endpoints
const applyAuthLimiter = (req, res, next) => {
  if (req.app.locals.authLimiter) {
    req.app.locals.authLimiter(req, res, next);
  } else {
    next();
  }
};

// Apply email rate limiting to email endpoints
const applyEmailLimiter = (req, res, next) => {
  if (req.app.locals.emailLimiter) {
    req.app.locals.emailLimiter(req, res, next);
  } else {
    next();
  }
};

// POST /api/auth/login
router.post('/login', applyAuthLimiter, async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Attempt login
    const result = await authService.login(email, password, req);

    // Log successful login
    securityLogger.logSuccessfulLogin(result.user.id, email, req);

    res.json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    
    // Log failed login attempt (only if email was provided)
    if (email) {
      securityLogger.logFailedLogin(email, securityLogger.getClientIP(req), req);
    }
    
    res.status(401).json({ 
      error: error.message || 'Login failed' 
    });
  }
});

// POST /api/auth/validate-invite - Step 1: Validate invite code
router.post('/validate-invite', async (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ 
        error: 'Invite code is required' 
      });
    }

    const result = await authService.validateInviteForRegistration(inviteCode);
    res.json({ 
      success: true, 
      message: 'Invite code is valid',
      valid: result.valid 
    });

  } catch (error) {
    console.error('Invite validation error:', error);
    res.status(400).json({ 
      error: error.message || 'Invalid invite code' 
    });
  }
});

// POST /api/auth/register - Step 2: Send verification email
router.post('/register', applyEmailLimiter, async (req, res) => {
  try {
    const { username, email, password, inviteCode } = req.body;

    // Validate input
    if (!username || !email || !password || !inviteCode) {
      return res.status(400).json({ 
        error: 'Username, email, password, and invite code are required' 
      });
    }

    // Initiate email verification
    const result = await authService.initiateEmailVerification(username, email, password, inviteCode);

    res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ 
      error: error.message || 'Registration failed' 
    });
  }
});

// POST /api/auth/verify-email - Step 3: Verify email and complete registration
router.post('/verify-email', applyAuthLimiter, async (req, res) => {
  const { email, code } = req.body;
  
  try {
    if (!email || !code) {
      return res.status(400).json({ 
        error: 'Email and verification code are required' 
      });
    }

    const result = await authService.completeEmailVerification(email, code);

    // Log successful account creation
    securityLogger.logAccountCreation(result.user.id, email, req);
    securityLogger.logEmailVerificationAttempt(email, true, req);

    res.status(201).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Email verification error:', error);
    
    // Log failed email verification (only if email was provided)
    if (email) {
      securityLogger.logEmailVerificationAttempt(email, false, req);
    }
    
    res.status(400).json({ 
      error: error.message || 'Email verification failed' 
    });
  }
});

// GET /api/auth/check-username/:username - Check if username is available
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    const isAvailable = await authService.isUsernameAvailable(username);

    res.json({
      success: true,
      username,
      available: isAvailable,
      message: isAvailable ? 'Username is available' : 'Username is already taken'
    });

  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to check username availability' 
    });
  }
});

// GET /api/auth/deletion-info - Get information about account deletion
router.get('/deletion-info', authenticateToken, async (req, res) => {
  try {
    const userData = await authService.findUserById(req.user.id);
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this is the last admin user
    const adminCount = await authService.getAdminCount();
    const isLastAdmin = userData.is_admin && adminCount <= 1;

    res.json({
      success: true,
      canDelete: !isLastAdmin,
      isLastAdmin,
      adminCount,
      message: isLastAdmin 
        ? 'Cannot delete the last admin user. Please create another admin account first.'
        : 'Account can be deleted'
    });

  } catch (error) {
    console.error('Get deletion info error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get deletion information' 
    });
  }
});

// GET /api/auth/deleted-usernames - Get list of recently deleted usernames (admin only)
router.get('/deleted-usernames', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // This would require a separate table to track deleted usernames
    // For now, we'll return a simple message
    res.json({
      success: true,
      message: 'Username availability can be checked using /api/auth/check-username/:username',
      note: 'When a user is deleted, their username becomes immediately available for reuse'
    });
  } catch (error) {
    console.error('Get deleted usernames error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get deleted usernames' 
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        error: 'Refresh token is required' 
      });
    }

    const result = await authService.refreshToken(refreshToken, req);

    res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ 
      error: error.message || 'Token refresh failed' 
    });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userData = await authService.findUserById(req.user.id);
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const User = require('../models/User');
    const user = new User(userData);
    
    res.json({
      success: true,
      user: user.toSafeObject()
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/validate-invite/:token (placeholder for invite system)
router.get('/validate-invite/:token', (req, res) => {
  res.json({ 
    message: 'Invite validation endpoint - to be implemented',
    token: req.params.token
  });
});

// Admin-only endpoints for invite management

// Create invite token
router.post('/invites', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { expiresInDays = 7, maxUses = 1, isIndefinite = false } = req.body;
    
    const invite = await authService.createInviteToken(req.user.id, expiresInDays, maxUses, isIndefinite);
    res.status(201).json(invite);
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send invite via email
router.post('/invites/send-email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, expiresInDays = 7, maxUses = 1, isIndefinite = false } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }
    
    // Create the invite token
    const invite = await authService.createInviteToken(req.user.id, expiresInDays, maxUses, isIndefinite);
    
    // Get sender's information
    const senderData = await authService.findUserById(req.user.id);
    const senderName = senderData.display_name || senderData.username;
    
    // Send the email
    try {
      await authService.sendInviteEmail(invite.token, email, senderName);
      
      res.status(201).json({
        ...invite,
        emailSent: true,
        sentTo: email,
        message: 'Invite created and email sent successfully'
      });
    } catch (emailError) {
      console.error('Email sending failed, but invite was created:', emailError.message);
      
      // Return success with warning - invite was created even if email failed
      res.status(201).json({
        ...invite,
        emailSent: false,
        sentTo: email,
        message: 'Invite created successfully, but email sending failed. You can copy the invite code manually.',
        emailError: process.env.NODE_ENV === 'development' ? emailError.message : 'Email service unavailable'
      });
    }
  } catch (error) {
    console.error('Send invite email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all invite tokens
router.get('/invites', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const invites = await authService.getAllInviteTokens();
    res.json(invites);
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete invite token
router.delete('/invites/:token', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { token } = req.params;
    await authService.deleteInviteToken(token);
    res.json({ message: 'Invite token deleted successfully' });
  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    res.json(users.map(user => user.toSafeObject()));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent admin from deleting themselves
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const result = await authService.deleteUser(userId);
    res.json({ 
      success: true,
      message: result.message || 'User deleted successfully',
      changes: result.changes
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete own profile (user can delete themselves)
router.delete('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user data before deletion for confirmation
    const userData = await authService.findUserById(userId);
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if this is the last admin user
    const adminCount = await authService.getAdminCount();
    if (userData.is_admin && adminCount <= 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the last admin user. Please create another admin account first.' 
      });
    }
    
    // Delete the user
    const result = await authService.deleteUser(userId);
    
    // Log the self-deletion for security
    securityLogger.logAccountDeletion(userId, userData.email, req, 'self-deletion');
    
    res.json({ 
      success: true,
      message: 'Your account has been permanently deleted. All your data has been removed.',
      deletedUser: {
        id: result.id,
        username: result.username,
        email: result.email
      }
    });
  } catch (error) {
    console.error('Self-delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle user admin status (admin only) - Legacy endpoint
router.patch('/users/:userId/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_admin } = req.body;
    
    // Prevent admin from removing their own admin privileges
    if (parseInt(userId) === req.user.id && !is_admin) {
      return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
    }
    
    const updatedUser = await authService.updateUserAdminStatus(userId, is_admin);
    res.json({ message: 'User role updated successfully', user: updatedUser.toSafeObject() });
  } catch (error) {
    console.error('Update user admin status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user role (admin only)
router.patch('/users/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    const updatedUser = await authService.updateUserRole(userId, role, req.user.id);
    
    res.json({ 
      message: 'User role updated successfully', 
      user: updatedUser.toSafeObject() 
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get role statistics (admin only)
router.get('/roles/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statistics = await authService.getRoleStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Get role statistics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get users by role (admin only)
router.get('/users/role/:role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const users = await authService.getUsersByRole(role);
    res.json(users.map(user => user.toSafeObject()));
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 
