const fs = require('fs');
const path = require('path');

/**
 * Error Code Tracker Utility
 * Helps track and search for error codes in system logs
 */
class ErrorCodeTracker {
  constructor() {
    this.logsDir = path.join(__dirname, '../../logs');
    this.errorCodes = new Map();
  }

  /**
   * Log an error with a specific error code
   * @param {string} errorCode - The unique error code
   * @param {object} errorDetails - Detailed error information
   * @param {string} logLevel - Log level (error, warn, info)
   */
  logError(errorCode, errorDetails, logLevel = 'error') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      errorCode,
      timestamp,
      logLevel,
      ...errorDetails
    };

    // Store in memory for quick access
    this.errorCodes.set(errorCode, logEntry);

    // Write to log file
    const logFile = path.join(this.logsDir, `error-codes-${new Date().toISOString().split('T')[0]}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error('Failed to write error code to log file:', error);
    }

    // Also log to console
    console.log(`🔍 [${errorCode}] ${logLevel.toUpperCase()}:`, errorDetails);
  }

  /**
   * Search for an error code in logs
   * @param {string} errorCode - The error code to search for
   * @returns {object|null} - Error details if found
   */
  findErrorCode(errorCode) {
    // Check memory first
    if (this.errorCodes.has(errorCode)) {
      return this.errorCodes.get(errorCode);
    }

    // Search in log files
    try {
      const files = fs.readdirSync(this.logsDir);
      const logFiles = files.filter(file => file.startsWith('error-codes-'));

      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.errorCode === errorCode) {
              return entry;
            }
          } catch (error) {
            // Skip invalid JSON lines
            continue;
          }
        }
      }
    } catch (error) {
      console.error('Error searching for error code:', error);
    }

    return null;
  }

  /**
   * Get all error codes from a specific date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} - Array of error entries
   */
  getErrorsInDateRange(startDate, endDate) {
    const errors = [];

    try {
      const files = fs.readdirSync(this.logsDir);
      const logFiles = files.filter(file => file.startsWith('error-codes-'));

      for (const file of logFiles) {
        const fileDate = new Date(file.replace('error-codes-', '').replace('.log', ''));
        
        if (fileDate >= startDate && fileDate <= endDate) {
          const filePath = path.join(this.logsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              errors.push(entry);
            } catch (error) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting errors in date range:', error);
    }

    return errors;
  }

  /**
   * Get error statistics
   * @returns {object} - Error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      errorsByLevel: {},
      errorsBySource: {},
      recentErrors: []
    };

    try {
      const files = fs.readdirSync(this.logsDir);
      const logFiles = files.filter(file => file.startsWith('error-codes-'));

      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            stats.totalErrors++;

            // Count by log level
            stats.errorsByLevel[entry.logLevel] = (stats.errorsByLevel[entry.logLevel] || 0) + 1;

            // Count by source
            if (entry.source) {
              stats.errorsBySource[entry.source] = (stats.errorsBySource[entry.source] || 0) + 1;
            }

            // Get recent errors (last 24 hours)
            const errorDate = new Date(entry.timestamp);
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            if (errorDate >= oneDayAgo) {
              stats.recentErrors.push(entry);
            }
          } catch (error) {
            // Skip invalid JSON lines
            continue;
          }
        }
      }
    } catch (error) {
      console.error('Error getting error statistics:', error);
    }

    return stats;
  }

  /**
   * Clear old error logs (older than specified days)
   * @param {number} daysToKeep - Number of days to keep logs
   */
  clearOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logsDir);
      const logFiles = files.filter(file => file.startsWith('error-codes-'));
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

      for (const file of logFiles) {
        const fileDate = new Date(file.replace('error-codes-', '').replace('.log', ''));
        
        if (fileDate < cutoffDate) {
          const filePath = path.join(this.logsDir, file);
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted old error log: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error clearing old logs:', error);
    }
  }
}

// Create singleton instance
const errorCodeTracker = new ErrorCodeTracker();

module.exports = errorCodeTracker; 