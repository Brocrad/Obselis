const database = require('../utils/database');
const knex = require('knex');
const knexfile = require('../../knexfile');

class AdminWhitelistService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
    this.knex = null;
  }

  /**
   * Get all admin users' email addresses for support forwarding
   */
  async getAdminEmails() {
    try {
      // Check cache first
      const now = Date.now();
      if (this.cache.has('adminEmails') && (now - this.lastCacheUpdate) < this.cacheExpiry) {
        return this.cache.get('adminEmails');
      }

      // Ensure Knex connection is available
      if (!this.knex) {
        try {
          this.knex = knex(knexfile.development);
        } catch (error) {
          console.error('Error creating Knex connection:', error);
          return [];
        }
      }

      // Query database for admin users using Knex
      const adminUsers = await this.knex('users')
        .select('id', 'username', 'email', 'display_name', 'role', 'is_admin')
        .where(function() {
          this.where('role', 'admin')
              .orWhere('is_admin', 1);
        })
        .where('is_active', 1)
        .where('email_verified', 1)
        .orderBy('role', 'desc')
        .orderBy('username', 'asc');

      const adminEmails = adminUsers.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name || user.username,
        role: user.role || (user.is_admin ? 'admin' : 'user')
      }));

      // Update cache
      this.cache.set('adminEmails', adminEmails);
      this.lastCacheUpdate = now;

      return adminEmails;
    } catch (error) {
      console.error('Error fetching admin emails:', error);
      return [];
    }
  }

  /**
   * Get admin emails as a simple array for email sending
   */
  async getAdminEmailList() {
    const adminEmails = await this.getAdminEmails();
    const additionalEmails = await this.getAdditionalSupportEmails();
    
    // Combine admin emails with additional support emails
    const allEmails = [
      ...adminEmails.map(admin => admin.email),
      ...additionalEmails.map(email => email.email)
    ];
    
    return allEmails;
  }

  /**
   * Get additional support emails (manually added by admins)
   */
  async getAdditionalSupportEmails() {
    try {
      // Ensure Knex connection is available
      if (!this.knex) {
        try {
          this.knex = knex(knexfile.development);
        } catch (error) {
          console.error('Error creating Knex connection:', error);
          return [];
        }
      }

      const additionalEmails = await this.knex('support_emails')
        .select('id', 'email', 'name', 'added_by', 'is_active', 'created_at')
        .where('is_active', true)
        .orderBy('created_at', 'asc');

      return additionalEmails;
    } catch (error) {
      console.error('Error fetching additional support emails:', error);
      return [];
    }
  }

  /**
   * Add an email to the support whitelist
   */
  async addSupportEmail(email, name, addedByUserId) {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }

      // Check if email already exists
      const existingEmail = await this.knex('support_emails')
        .where('email', email)
        .first();

      if (existingEmail) {
        if (existingEmail.is_active) {
          throw new Error('Email already exists in support whitelist');
        } else {
          // Reactivate existing email
          await this.knex('support_emails')
            .where('id', existingEmail.id)
            .update({
              name: name || existingEmail.name,
              added_by: addedByUserId,
              is_active: true,
              updated_at: this.knex.fn.now()
            });
          return { success: true, message: 'Email reactivated in support whitelist' };
        }
      }

      // Add new email
      await this.knex('support_emails').insert({
        email,
        name,
        added_by: addedByUserId,
        is_active: true
      });

      // Clear cache to refresh
      this.cache.clear();
      this.lastCacheUpdate = 0;

      return { success: true, message: 'Email added to support whitelist' };
    } catch (error) {
      console.error('Error adding support email:', error);
      throw error;
    }
  }

  /**
   * Remove an email from the support whitelist
   */
  async removeSupportEmail(emailId, removedByUserId) {
    try {
      const result = await this.knex('support_emails')
        .where('id', emailId)
        .update({
          is_active: false,
          updated_at: this.knex.fn.now()
        });

      if (result === 0) {
        throw new Error('Email not found in support whitelist');
      }

      // Clear cache to refresh
      this.cache.clear();
      this.lastCacheUpdate = 0;

      return { success: true, message: 'Email removed from support whitelist' };
    } catch (error) {
      console.error('Error removing support email:', error);
      throw error;
    }
  }

  /**
   * Check if a user is an admin
   */
  async isAdmin(userId) {
    try {
      // Ensure Knex connection is available
      if (!this.knex) {
        try {
          this.knex = knex(knexfile.development);
        } catch (error) {
          console.error('Error creating Knex connection:', error);
          return false;
        }
      }

      // Direct database query for better performance
      const user = await this.knex('users')
        .select('id', 'role', 'is_admin')
        .where('id', userId)
        .where('is_active', 1);

      if (user.length === 0) return false;
      
      const userData = user[0];
      return userData.role === 'admin' || userData.is_admin === 1;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Add a user to the admin whitelist (for future use)
   */
  async addToWhitelist(userId) {
    try {
      await database.update(`
        UPDATE users 
        SET role = 'admin' 
        WHERE id = ? AND is_active = 1
      `, [userId]);

      // Clear cache to refresh
      this.cache.clear();
      this.lastCacheUpdate = 0;

      return true;
    } catch (error) {
      console.error('Error adding user to admin whitelist:', error);
      return false;
    }
  }

  /**
   * Remove a user from the admin whitelist
   */
  async removeFromWhitelist(userId) {
    try {
      await database.update(`
        UPDATE users 
        SET role = 'user' 
        WHERE id = ? AND role IN ('admin', 'manager')
      `, [userId]);

      // Clear cache to refresh
      this.cache.clear();
      this.lastCacheUpdate = 0;

      return true;
    } catch (error) {
      console.error('Error removing user from admin whitelist:', error);
      return false;
    }
  }

  /**
   * Get admin whitelist statistics
   */
  async getWhitelistStats() {
    try {
      const adminEmails = await this.getAdminEmails();
      
      const admins = adminEmails.filter(admin => admin.role === 'admin').length;
      const managers = adminEmails.filter(admin => admin.role === 'manager').length;
      
      return {
        totalAdmins: adminEmails.length,
        admins: admins,
        managers: managers,
        lastUpdated: this.lastCacheUpdate,
        cacheValid: (Date.now() - this.lastCacheUpdate) < this.cacheExpiry
      };
    } catch (error) {
      console.error('Error getting whitelist stats:', error);
      return {
        totalAdmins: 0,
        admins: 0,
        managers: 0,
        lastUpdated: 0,
        cacheValid: false
      };
    }
  }

  /**
   * Clear cache (for manual refresh)
   */
  clearCache() {
    this.cache.clear();
    this.lastCacheUpdate = 0;
    console.log('Admin whitelist cache cleared');
  }
}

module.exports = new AdminWhitelistService(); 