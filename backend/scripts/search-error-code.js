#!/usr/bin/env node

/**
 * Error Code Search CLI Tool
 * Usage: node search-error-code.js <errorCode>
 * Example: node search-error-code.js ERR-LM5N2X-ABC123
 */

const errorCodeTracker = require('../src/utils/errorCodeTracker');

const errorCode = process.argv[2];

if (!errorCode) {
  console.log('🔍 Error Code Search Tool');
  console.log('========================');
  console.log('');
  console.log('Usage: node search-error-code.js <errorCode>');
  console.log('Example: node search-error-code.js ERR-LM5N2X-ABC123');
  console.log('');
  console.log('Available commands:');
  console.log('  <errorCode>     - Search for a specific error code');
  console.log('  --stats         - Show error statistics');
  console.log('  --recent        - Show recent errors (last 24 hours)');
  console.log('  --clear <days>  - Clear logs older than specified days (default: 30)');
  console.log('');
  process.exit(0);
}

async function main() {
  try {
    if (errorCode === '--stats') {
      const stats = errorCodeTracker.getErrorStats();
      console.log('📊 Error Statistics');
      console.log('==================');
      console.log(`Total Errors: ${stats.totalErrors}`);
      console.log('');
      
      console.log('Errors by Level:');
      Object.entries(stats.errorsByLevel).forEach(([level, count]) => {
        console.log(`  ${level}: ${count}`);
      });
      console.log('');
      
      console.log('Errors by Source:');
      Object.entries(stats.errorsBySource).forEach(([source, count]) => {
        console.log(`  ${source}: ${count}`);
      });
      console.log('');
      
      console.log('Recent Errors (last 24 hours):');
      stats.recentErrors.forEach(error => {
        console.log(`  ${error.errorCode} - ${error.source} - ${error.timestamp}`);
      });
      
    } else if (errorCode === '--recent') {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const errors = errorCodeTracker.getErrorsInDateRange(oneDayAgo, new Date());
      
      console.log('🕐 Recent Errors (Last 24 Hours)');
      console.log('================================');
      
      if (errors.length === 0) {
        console.log('No errors found in the last 24 hours.');
      } else {
        errors.forEach(error => {
          console.log('');
          console.log(`Error Code: ${error.errorCode}`);
          console.log(`Source: ${error.source}`);
          console.log(`Message: ${error.message}`);
          console.log(`Timestamp: ${error.timestamp}`);
          console.log(`Log Level: ${error.logLevel}`);
          if (error.url) console.log(`URL: ${error.url}`);
          console.log('---');
        });
      }
      
    } else if (errorCode.startsWith('--clear')) {
      const days = parseInt(process.argv[3]) || 30;
      console.log(`🗑️ Clearing logs older than ${days} days...`);
      errorCodeTracker.clearOldLogs(days);
      console.log('✅ Log cleanup completed');
      
    } else {
      // Search for specific error code
      console.log(`🔍 Searching for error code: ${errorCode}`);
      console.log('=====================================');
      
      const error = errorCodeTracker.findErrorCode(errorCode);
      
      if (error) {
        console.log('');
        console.log('✅ Error Found!');
        console.log('===============');
        console.log(`Error Code: ${error.errorCode}`);
        console.log(`Source: ${error.source}`);
        console.log(`Message: ${error.message}`);
        console.log(`Timestamp: ${error.timestamp}`);
        console.log(`Log Level: ${error.logLevel}`);
        console.log('');
        
        if (error.url) {
          console.log('Technical Details:');
          console.log(`  URL: ${error.url}`);
          if (error.userAgent) console.log(`  User Agent: ${error.userAgent}`);
          if (error.referrer) console.log(`  Referrer: ${error.referrer}`);
          if (error.sessionId && error.sessionId !== 'unknown') {
            console.log(`  Session ID: ${error.sessionId}`);
          }
          if (error.userId && error.userId !== 'unknown') {
            console.log(`  User ID: ${error.userId}`);
          }
          if (error.memory) {
            console.log(`  Memory Usage: ${Math.round(error.memory.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(error.memory.totalJSHeapSize / 1024 / 1024)}MB`);
          }
          if (error.network) {
            console.log(`  Network: ${error.network.effectiveType} (${error.network.downlink}Mbps)`);
          }
        }
        
        if (error.stack) {
          console.log('');
          console.log('Stack Trace:');
          console.log(error.stack);
        }
        
      } else {
        console.log('');
        console.log('❌ Error code not found');
        console.log('');
        console.log('This could mean:');
        console.log('  - The error code is incorrect');
        console.log('  - The error occurred before error tracking was implemented');
        console.log('  - The error logs have been cleared');
        console.log('');
        console.log('Try running with --stats to see available error codes');
      }
    }
    
  } catch (error) {
    console.error('❌ Error running search:', error.message);
    process.exit(1);
  }
}

main(); 