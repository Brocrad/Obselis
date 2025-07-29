# New Transcoding Engine Architecture

## Overview
A modern, modular transcoding engine designed for reliability, performance, and maintainability.

## Architecture Components

### 1. Job Manager (`jobManager.js`)
- **Purpose**: Queue management, job orchestration, and scheduling
- **Responsibilities**:
  - Persistent job queue with database backing
  - Job prioritization and scheduling
  - Retry logic with exponential backoff
  - Job cancellation and pause/resume
  - Worker pool management

### 2. File Analyzer (`fileAnalyzer.js`)
- **Purpose**: Media file analysis and codec detection
- **Responsibilities**:
  - Codec detection using ffprobe
  - File metadata extraction
  - Transcoding need assessment
  - Compression benefit estimation
  - File integrity validation

### 3. Transcoder (`transcoder.js`)
- **Purpose**: Core FFmpeg operations
- **Responsibilities**:
  - GPU/CPU encoding with automatic fallback
  - Quality preset management
  - Progress tracking
  - Output validation
  - Resource monitoring

### 4. Storage Manager (`storageManager.js`)
- **Purpose**: File system operations and organization
- **Responsibilities**:
  - File organization and naming
  - Directory management
  - File integrity checks
  - Cleanup operations
  - Storage analytics

### 5. Progress Tracker (`progressTracker.js`)
- **Purpose**: Real-time progress and status updates
- **Responsibilities**:
  - Socket.IO integration
  - Progress calculation
  - Status broadcasting
  - Performance metrics
  - User notifications

### 6. Cleanup Service (`cleanupService.js`)
- **Purpose**: Automated maintenance and cleanup
- **Responsibilities**:
  - Corrupted file detection
  - Orphaned file cleanup
  - Database consistency checks
  - Storage optimization
  - Scheduled maintenance

## Event Flow

```
User Request → Job Manager → File Analyzer → Transcoder → Storage Manager
     ↓              ↓              ↓            ↓              ↓
Progress Tracker ← Job Manager ← File Analyzer ← Transcoder ← Storage Manager
     ↓
Cleanup Service
```

## Database Schema

### Jobs Table
```sql
CREATE TABLE transcoding_jobs (
  id TEXT PRIMARY KEY,
  input_path TEXT NOT NULL,
  output_path TEXT,
  qualities TEXT NOT NULL, -- JSON array
  status TEXT NOT NULL, -- 'queued', 'analyzing', 'transcoding', 'completed', 'failed', 'cancelled'
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  error_message TEXT,
  progress REAL DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  settings TEXT -- JSON object
);
```

### Results Table
```sql
CREATE TABLE transcoding_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  quality TEXT NOT NULL,
  original_path TEXT NOT NULL,
  transcoded_path TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  transcoded_size INTEGER NOT NULL,
  compression_ratio REAL NOT NULL,
  space_saved INTEGER NOT NULL,
  checksum TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES transcoding_jobs(id)
);
```

## Configuration

### Engine Config
```javascript
{
  // Queue settings
  maxConcurrentJobs: 2,
  maxQueueSize: 100,
  retryAttempts: 3,
  retryDelay: 5000,
  
  // Hardware settings
  enableGPU: true,
  gpuDevice: 0,
  cpuThreads: 'auto',
  
  // Quality settings
  defaultQualities: ['1080p', '720p'],
  minCompressionPercent: 5,
  preventDataInflation: true,
  
  // Storage settings
  outputDirectory: './uploads/transcoded',
  tempDirectory: './uploads/temp',
  cleanupInterval: 3600000, // 1 hour
  
  // Performance settings
  progressUpdateInterval: 1000,
  fileCheckInterval: 5000
}
```

## Benefits of New Architecture

1. **Reliability**: Better error handling and recovery
2. **Maintainability**: Clear separation of concerns
3. **Scalability**: Easy to add new features
4. **Observability**: Real-time monitoring and debugging
5. **Performance**: Optimized resource usage
6. **Flexibility**: Easy configuration and customization 