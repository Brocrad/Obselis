const database = require('../utils/database');

class MonthlyBandwidthService {
  constructor() {
    this.database = database;
  }

  // Get the current 30-day period (starts on the 1st of each month)
  getCurrentPeriod() {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
    
    return {
      start: periodStart.toISOString().split('T')[0], // YYYY-MM-DD
      end: periodEnd.toISOString().split('T')[0],     // YYYY-MM-DD
      startDate: periodStart,
      endDate: periodEnd
    };
  }

  // Get or create a monthly bandwidth record for a user
  async getOrCreateMonthlyRecord(userId, username) {
    const period = this.getCurrentPeriod();
    
    try {
      // Check if record exists for current period
      const existingRecord = await this.database.query(
        'SELECT * FROM monthly_bandwidth WHERE user_id = ? AND period_start = ?',
        [userId, period.start]
      );

      if (existingRecord.length > 0) {
        return existingRecord[0];
      }

      // Create new record for current period
      const insertResult = await this.database.insert(
        `INSERT INTO monthly_bandwidth 
         (user_id, username, total_bandwidth_gb, total_streams, total_duration_seconds, period_start, period_end) 
         VALUES (?, ?, 0, 0, 0, ?, ?)`,
        [userId, username, period.start, period.end]
      );

      // Return the newly created record
      const newRecord = await this.database.query(
        'SELECT * FROM monthly_bandwidth WHERE id = ?',
        [insertResult.lastID]
      );

      return newRecord[0];
    } catch (error) {
      console.error('Error getting/creating monthly bandwidth record:', error);
      throw error;
    }
  }

  // Add bandwidth usage to a user's monthly record
  async addBandwidthUsage(userId, username, bandwidthGb, durationSeconds = 0) {
    try {
      const record = await this.getOrCreateMonthlyRecord(userId, username);
      
      // Update the record with new usage
      await this.database.update(
        `UPDATE monthly_bandwidth 
         SET total_bandwidth_gb = total_bandwidth_gb + ?, 
             total_streams = total_streams + 1,
             total_duration_seconds = total_duration_seconds + ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bandwidthGb, durationSeconds, record.id]
      );

      return true;
    } catch (error) {
      console.error('Error adding bandwidth usage:', error);
      return false;
    }
  }

  // Get current period bandwidth for all users
  async getCurrentPeriodBandwidth() {
    const period = this.getCurrentPeriod();
    
    try {
      const records = await this.database.query(
        `SELECT 
           user_id,
           username,
           total_bandwidth_gb,
           total_streams,
           total_duration_seconds,
           period_start,
           period_end
         FROM monthly_bandwidth 
         WHERE period_start = ? 
         ORDER BY total_bandwidth_gb DESC`,
        [period.start]
      );

      // Calculate totals
      const totalBandwidth = records.reduce((sum, record) => sum + record.total_bandwidth_gb, 0);
      const totalStreams = records.reduce((sum, record) => sum + record.total_streams, 0);
      const totalDuration = records.reduce((sum, record) => sum + record.total_duration_seconds, 0);

      return {
        period: period,
        totalBandwidth: totalBandwidth,
        totalStreams: totalStreams,
        totalDuration: totalDuration,
        userRecords: records,
        daysRemaining: Math.ceil((period.endDate - new Date()) / (1000 * 60 * 60 * 24))
      };
    } catch (error) {
      console.error('Error getting current period bandwidth:', error);
      throw error;
    }
  }

  // Get bandwidth history for a specific user
  async getUserBandwidthHistory(userId, months = 6) {
    try {
      const records = await this.database.query(
        `SELECT 
           period_start,
           period_end,
           total_bandwidth_gb,
           total_streams,
           total_duration_seconds
         FROM monthly_bandwidth 
         WHERE user_id = ? 
         ORDER BY period_start DESC 
         LIMIT ?`,
        [userId, months]
      );

      return records;
    } catch (error) {
      console.error('Error getting user bandwidth history:', error);
      throw error;
    }
  }

  // Get server-wide bandwidth history
  async getServerBandwidthHistory(months = 6) {
    try {
      const records = await this.database.query(
        `SELECT 
           period_start,
           period_end,
           SUM(total_bandwidth_gb) as total_bandwidth_gb,
           SUM(total_streams) as total_streams,
           SUM(total_duration_seconds) as total_duration_seconds,
           COUNT(DISTINCT user_id) as active_users
         FROM monthly_bandwidth 
         GROUP BY period_start, period_end
         ORDER BY period_start DESC 
         LIMIT ?`,
        [months]
      );

      return records;
    } catch (error) {
      console.error('Error getting server bandwidth history:', error);
      throw error;
    }
  }

  // Clean up old records (keep last 12 months)
  async cleanupOldRecords() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      const result = await this.database.update(
        'DELETE FROM monthly_bandwidth WHERE period_start < ?',
        [cutoffDateStr]
      );

      return result;
    } catch (error) {
      console.error('Error cleaning up old bandwidth records:', error);
      throw error;
    }
  }

  // Format bandwidth for display
  formatBandwidth(gb) {
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    } else if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    } else {
      return `${(gb * 1024).toFixed(2)} MB`;
    }
  }

  // Format duration for display
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

module.exports = new MonthlyBandwidthService(); 
