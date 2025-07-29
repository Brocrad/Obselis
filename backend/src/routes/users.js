const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const router = express.Router();
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');
const { sanitizeInput, sanitizeObject } = require('../middleware/security');
const securityLogger = require('../middleware/securityLogger');

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/profile-pictures');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(file.originalname);
    cb(null, `profile-${req.user.id}-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// GET /api/users/profile - Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const profile = await authService.getUserProfile(req.user.id);
    res.json({
      success: true,
      user: profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    // Sanitize input
    const profileData = sanitizeObject(req.body);
    
    const updatedProfile = await authService.updateUserProfile(req.user.id, profileData);
    
    // Log profile update
    securityLogger.logProfileUpdate(req.user.id, Object.keys(profileData), req);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedProfile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/users/initiate-password-change - Initiate password change (send email)
router.post('/initiate-password-change', authenticateToken, async (req, res) => {
  try {
    const { currentPassword } = sanitizeObject(req.body);
    
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is required'
      });
    }
    
    const result = await authService.initiatePasswordChange(req.user.id, currentPassword);
    
    // Log password change initiation
    securityLogger.logPasswordChangeInitiated(req.user.id, req);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Initiate password change error:', error);
    securityLogger.logFailedPasswordChange(req.user.id, error.message, req);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/users/complete-password-change - Complete password change with token
router.post('/complete-password-change', async (req, res) => {
  try {
    const { token, newPassword } = sanitizeObject(req.body);
    
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    const result = await authService.completePasswordChange(token, newPassword);
    
    // Log successful password change
    securityLogger.logPasswordChange(null, req); // No user ID since it's token-based
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Complete password change error:', error);
    securityLogger.logFailedPasswordChange(null, error.message, req);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/users/validate-password-change-token/:token - Validate password change token
router.get('/validate-password-change-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const changeData = await authService.validatePasswordChangeToken(token);
    
    if (changeData) {
      res.json({
        success: true,
        valid: true,
        email: changeData.email,
        username: changeData.username
      });
    } else {
      res.json({
        success: true,
        valid: false
      });
    }
  } catch (error) {
    console.error('Validate password change token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate password change token'
    });
  }
});

// POST /api/users/upload-profile-picture - Upload profile picture
router.post('/upload-profile-picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Delete old profile picture if it exists
    const currentProfile = await authService.getUserProfile(req.user.id);
    if (currentProfile.profile_picture) {
      const oldPicturePath = path.join(__dirname, '../../uploads/profile-pictures', currentProfile.profile_picture);
      try {
        await fs.unlink(oldPicturePath);
      } catch (error) {
        // Ignore error if file doesn't exist
      }
    }

    // Update user profile with new picture filename
    const updatedProfile = await authService.updateProfilePicture(req.user.id, req.file.filename);
    
    // Log profile picture update
    securityLogger.logProfileUpdate(req.user.id, ['profile_picture'], req);
    
    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      user: updatedProfile,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up uploaded file:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to upload profile picture'
    });
  }
});

// DELETE /api/users/profile-picture - Delete profile picture
router.delete('/profile-picture', authenticateToken, async (req, res) => {
  try {
    const currentProfile = await authService.getUserProfile(req.user.id);
    
    if (currentProfile.profile_picture) {
      // Schedule the file for deletion instead of deleting directly
      const picturePath = path.join(__dirname, '../../uploads/profile-pictures', currentProfile.profile_picture);
      const database = require('../utils/database');
      await database.insert(
        `INSERT INTO deletion_schedule \
         (file_path, file_type, media_id, scheduled_for, reason) \
         VALUES (?, ?, NULL, ?, ?)`,
        [picturePath, 'profile_picture', null, new Date().toISOString(), 'user_profile_picture_deleted']
      );
    }

    // Update user profile to remove picture
    const updatedProfile = await authService.deleteProfilePicture(req.user.id);
    
    // Log profile picture deletion
    securityLogger.logProfileUpdate(req.user.id, ['profile_picture_deleted'], req);
    
    res.json({
      success: true,
      message: 'Profile picture deleted successfully',
      user: updatedProfile
    });
  } catch (error) {
    console.error('Delete profile picture error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete profile picture'
    });
  }
});

// POST /api/users/forgot-password - Initiate password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = sanitizeObject(req.body);
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const result = await authService.initiatePasswordReset(email);
    
    // Log password reset request
    securityLogger.logPasswordResetRequest(email, req);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

// POST /api/users/reset-password - Complete password reset
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = sanitizeObject(req.body);
    
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    const result = await authService.completePasswordReset(token, newPassword);
    
    // Log successful password reset
    securityLogger.logPasswordReset(token, req);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Reset password error:', error);
    securityLogger.logFailedPasswordReset(req.body.token, error.message, req);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/users/validate-reset-token/:token - Validate password reset token
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const resetData = await authService.validatePasswordResetToken(token);
    
    if (resetData) {
      res.json({
        success: true,
        valid: true,
        email: resetData.email
      });
    } else {
      res.json({
        success: true,
        valid: false
      });
    }
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate reset token'
    });
  }
});

// POST /api/users/logout-all-devices - Logout from all devices
router.post('/logout-all-devices', authenticateToken, async (req, res) => {
  try {
    const result = await authService.logoutAllDevices(req.user.id);
    
    // Log logout all devices action
    securityLogger.logLogoutAllDevices(req.user.id, req);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Logout all devices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout from all devices'
    });
  }
});

// GET /api/users/sessions - Get active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const currentSessionId = req.sessionId; // Get current session ID from auth middleware
    const sessions = await authService.getUserSessions(req.user.id, currentSessionId);
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions'
    });
  }
});

// DELETE /api/users/sessions/:sessionId - Logout specific session
router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await authService.logoutSession(req.user.id, sessionId);
    
    // Log session logout
    securityLogger.logSessionLogout(req.user.id, sessionId, req);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Logout session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to logout session'
    });
  }
});



module.exports = router; 
