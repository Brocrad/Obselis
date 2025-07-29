const bcrypt = require('bcryptjs');
const { isValidEmail, isValidUsername, isStrongPassword } = require('../middleware/security');

class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.display_name = data.display_name;
    this.profile_picture = data.profile_picture;
    this.bio = data.bio;
    this.role = data.role || 'user';
    this.is_admin = data.is_admin || false;
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.email_verified = data.email_verified || false;
    this.email_verified_at = data.email_verified_at;
    this.token_version = data.token_version;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Hash password before saving
  static async hashPassword(password) {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Compare password with hash
  async comparePassword(password) {
    return await bcrypt.compare(password, this.password_hash);
  }

  // Convert to safe object (without password)
  toSafeObject() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      display_name: this.display_name,
      profile_picture: this.profile_picture,
      bio: this.bio,
      role: this.role,
      role_display_name: this.getRoleDisplayName(),
      is_admin: this.is_admin, // Keep for backward compatibility
      is_active: this.is_active,
      email_verified: this.email_verified,
      email_verified_at: this.email_verified_at,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  // Validate user data with enhanced security
  static validate(userData) {
    const errors = [];

    // Username validation
    if (!userData.username) {
      errors.push('Username is required');
    } else if (!isValidUsername(userData.username)) {
      errors.push('Username must be 3-30 characters long, contain only letters, numbers, underscores, and hyphens, and start with a letter or number');
    }

    // Email validation
    if (!userData.email) {
      errors.push('Email is required');
    } else if (!isValidEmail(userData.email)) {
      errors.push('Please provide a valid email address');
    }

    // Password validation
    if (!userData.password) {
      errors.push('Password is required');
    } else if (!isStrongPassword(userData.password)) {
      errors.push('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Validate profile update data
  static validateProfileUpdate(profileData) {
    const errors = [];

    // Display name validation (optional)
    if (profileData.display_name !== undefined) {
      if (typeof profileData.display_name !== 'string') {
        errors.push('Display name must be a string');
      } else if (profileData.display_name.length > 100) {
        errors.push('Display name must be less than 100 characters');
      }
    }

    // Bio validation (optional)
    if (profileData.bio !== undefined) {
      if (typeof profileData.bio !== 'string') {
        errors.push('Bio must be a string');
      } else if (profileData.bio.length > 500) {
        errors.push('Bio must be less than 500 characters');
      }
    }

    // Username validation (if being updated)
    if (profileData.username !== undefined) {
      if (!isValidUsername(profileData.username)) {
        errors.push('Username must be 3-30 characters long, contain only letters, numbers, underscores, and hyphens, and start with a letter or number');
      }
    }

    // Email validation (if being updated)
    if (profileData.email !== undefined) {
      if (!isValidEmail(profileData.email)) {
        errors.push('Please provide a valid email address');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Validate password change
  static validatePasswordChange(passwordData) {
    const errors = [];

    if (!passwordData.currentPassword) {
      errors.push('Current password is required');
    }

    if (!passwordData.newPassword) {
      errors.push('New password is required');
    } else if (!isStrongPassword(passwordData.newPassword)) {
      errors.push('New password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.push('New password and confirmation do not match');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Legacy email validation (kept for backward compatibility)
  static isValidEmail(email) {
    return isValidEmail(email);
  }

  // Role hierarchy methods
  isAdmin() {
    return this.role === 'admin';
  }

  isManager() {
    return this.role === 'manager';
  }

  isUser() {
    return this.role === 'user';
  }

  // Permission methods
  canManageUsers() {
    return this.isAdmin();
  }

  canManageContent() {
    return this.isAdmin() || this.isManager();
  }

  canViewContent() {
    return true; // All authenticated users can view content
  }

  canManageInvites() {
    return this.isAdmin();
  }

  canChangeUserRoles() {
    return this.isAdmin();
  }

  // Get role display name
  getRoleDisplayName() {
    const roleNames = {
      'admin': 'Administrator',
      'manager': 'Content Manager',
      'user': 'User'
    };
    return roleNames[this.role] || 'User';
  }

  // Get role hierarchy level (higher number = more privileges)
  getRoleLevel() {
    const roleLevels = {
      'admin': 3,
      'manager': 2,
      'user': 1
    };
    return roleLevels[this.role] || 1;
  }

  // Check if user has higher or equal role than specified role
  hasRoleOrHigher(role) {
    const targetLevel = {
      'admin': 3,
      'manager': 2,
      'user': 1
    }[role] || 1;
    
    return this.getRoleLevel() >= targetLevel;
  }
}

module.exports = User; 
