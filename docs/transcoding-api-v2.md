# Transcoding Engine API v2 Documentation

## Overview

The new transcoding engine provides a modular, event-driven architecture with enhanced features for media processing, analysis, and management. This API replaces the legacy transcoding service with improved performance, better error handling, and advanced capabilities.

## Base URL

```
/api/transcoding-v2
```

## Authentication

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Status & Health

#### GET `/api/transcoding-v2/status`

Get the current status of the transcoding engine, including active jobs, queue status, and system health.

**Response:**
```json
{
  "success": true,
  "engine": {
    "isInitialized": true,
    "isProcessing": true,
    "activeJobs": [
      {
        "id": "job-uuid",
        "inputPath": "/path/to/video.mp4",
        "qualities": ["1080p", "720p"],
        "status": "processing",
        "progress": 45,
        "startedAt": "2024-01-15T10:30:00Z",
        "eta": "2:30:15",
        "priority": 0
      }
    ],
    "queuedJobs": [
      {
        "id": "job-uuid-2",
        "inputPath": "/path/to/video2.mp4",
        "qualities": ["1080p"],
        "status": "queued",
        "addedAt": "2024-01-15T10:25:00Z",
        "priority": 1
      }
    ],
    "completedJobs": [
      {
        "id": "job-uuid-3",
        "inputPath": "/path/to/video3.mp4",
        "qualities": ["1080p", "720p"],
        "status": "completed",
        "completedAt": "2024-01-15T09:45:00Z",
        "processingTime": 1800,
        "spaceSaved": 1073741824
      }
    ]
  }
}
```

### 2. File Analysis

#### POST `/api/transcoding-v2/analyze`

Analyze a single file to determine transcoding needs and recommendations.

**Request Body:**
```json
{
  "filePath": "/path/to/video.mp4"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "filePath": "/path/to/video.mp4",
    "fileSize": 2147483648,
    "duration": 7200,
    "videoCodec": "h264",
    "audioCodec": "aac",
    "resolution": "1920x1080",
    "bitrate": 5000000,
    "needsTranscoding": true,
    "recommendedQualities": ["1080p", "720p"],
    "estimatedSavings": 1073741824,
    "compressionRatio": 0.5,
    "priority": 0
  }
}
```

#### POST `/api/transcoding-v2/analyze-batch`

Analyze multiple files in batch for efficient processing.

**Request Body:**
```json
{
  "files": [
    "/path/to/video1.mp4",
    "/path/to/video2.mkv",
    "/path/to/video3.avi"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "analyses": [
    {
      "filePath": "/path/to/video1.mp4",
      "needsTranscoding": true,
      "recommendedQualities": ["1080p", "720p"],
      "estimatedSavings": 1073741824
    },
    {
      "filePath": "/path/to/video2.mkv",
      "needsTranscoding": false,
      "reason": "already_optimized"
    }
  ],
  "summary": {
    "totalFiles": 3,
    "needsTranscoding": 2,
    "totalSavings": 2147483648
  }
}
```

### 3. Queue Management

#### POST `/api/transcoding-v2/add-to-queue`

Add a file to the transcoding queue.

**Request Body:**
```json
{
  "inputPath": "/path/to/video.mp4",
  "qualities": ["1080p", "720p"],
  "priority": 0,
  "settings": {
    "enableGPU": true,
    "cpuThreads": "auto"
  }
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job-uuid",
  "message": "Job added to queue successfully"
}
```

#### DELETE `/api/transcoding-v2/cancel-job/:jobId`

Cancel a specific transcoding job.

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

#### POST `/api/transcoding-v2/retry-job/:jobId`

Retry a failed transcoding job.

**Response:**
```json
{
  "success": true,
  "message": "Job queued for retry"
}
```

### 4. System Information

#### GET `/api/transcoding-v2/system-info`

Get detailed system information including hardware capabilities.

**Response:**
```json
{
  "success": true,
  "system": {
    "cpu": {
      "model": "Intel Core i7-10700K",
      "cores": 8,
      "threads": 16,
      "frequency": "3.8 GHz"
    },
    "gpu": {
      "name": "NVIDIA RTX 2070 Super",
      "memory": "8 GB",
      "driver": "470.82",
      "available": true
    },
    "ffmpeg": {
      "version": "4.4.2",
      "build": "2021-12-08",
      "features": ["--enable-nvenc", "--enable-libx264"]
    },
    "memory": {
      "total": 17179869184,
      "available": 8589934592
    },
    "storage": {
      "total": 1099511627776,
      "available": 549755813888
    }
  }
}
```

#### GET `/api/transcoding-v2/performance-stats`

Get performance statistics and metrics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "successRate": 95.5,
    "avgProcessingTime": 1800,
    "totalJobsProcessed": 150,
    "todayCompleted": 12,
    "totalSpaceSaved": 107374182400,
    "compressionRatio": 0.45,
    "gpuUtilization": 85.2,
    "cpuUtilization": 65.8,
    "queueEfficiency": 92.1
  }
}
```

### 5. Quality Presets

#### GET `/api/transcoding-v2/quality-presets`

Get available quality presets and their configurations.

**Response:**
```json
{
  "success": true,
  "presets": {
    "1080p": {
      "resolution": "1920x1080",
      "videoCodec": "h265",
      "audioCodec": "aac",
      "videoBitrate": "4000k",
      "audioBitrate": "128k",
      "container": "mp4"
    },
    "720p": {
      "resolution": "1280x720",
      "videoCodec": "h265",
      "audioCodec": "aac",
      "videoBitrate": "2000k",
      "audioBitrate": "128k",
      "container": "mp4"
    },
    "480p": {
      "resolution": "854x480",
      "videoCodec": "h264",
      "audioCodec": "aac",
      "videoBitrate": "800k",
      "audioBitrate": "96k",
      "container": "mp4"
    },
    "vp9": {
      "resolution": "1920x1080",
      "videoCodec": "vp9",
      "audioCodec": "opus",
      "videoBitrate": "3000k",
      "audioBitrate": "128k",
      "container": "webm"
    }
  }
}
```

### 6. GPU Testing

#### GET `/api/transcoding-v2/test-gpu`

Test GPU availability and performance.

**Response:**
```json
{
  "success": true,
  "gpu": {
    "available": true,
    "name": "NVIDIA RTX 2070 Super",
    "memory": "8 GB",
    "driver": "470.82",
    "testResult": "passed",
    "performance": "excellent",
    "supportedCodecs": ["h264", "h265", "vp9"]
  }
}
```

### 7. Cleanup Operations

#### POST `/api/transcoding-v2/cleanup`

Perform system cleanup operations.

**Request Body:**
```json
{
  "cleanupType": "all",
  "force": false
}
```

**Cleanup Types:**
- `temp`: Clean temporary files
- `corrupted`: Remove corrupted files
- `orphaned`: Remove orphaned files
- `database`: Clean database inconsistencies
- `all`: Perform all cleanup operations

**Response:**
```json
{
  "success": true,
  "cleanup": {
    "tempFilesRemoved": 15,
    "corruptedFilesRemoved": 2,
    "orphanedFilesRemoved": 8,
    "databaseRecordsCleaned": 5,
    "spaceFreed": 1073741824
  }
}
```

### 8. Job Migration (Admin Only)

#### POST `/api/transcoding-v2/migrate-jobs`

Migrate jobs from the old transcoding system to the new engine.

**Response:**
```json
{
  "success": true,
  "migration": {
    "jobsMigrated": 25,
    "jobsSkipped": 3,
    "errors": 0,
    "message": "Migration completed successfully"
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

## Common Error Codes

- `AUTHENTICATION_REQUIRED`: Missing or invalid authentication token
- `FILE_NOT_FOUND`: Specified file does not exist
- `INVALID_FORMAT`: Unsupported file format
- `QUEUE_FULL`: Transcoding queue is at maximum capacity
- `SYSTEM_ERROR`: Internal system error
- `GPU_UNAVAILABLE`: GPU encoding is not available
- `INSUFFICIENT_STORAGE`: Not enough storage space

## WebSocket Events

The transcoding engine provides real-time updates via WebSocket:

### Connection
```javascript
const socket = io('http://localhost:3001');
```

### Events

#### `transcoding-progress`
Real-time progress updates for active jobs:
```javascript
socket.on('transcoding-progress', (data) => {
  console.log('Job progress:', data);
  // data: { jobId, progress, eta, status, currentFrame, fps, bitrate }
});
```

#### `job-completed`
Job completion notification:
```javascript
socket.on('job-completed', (data) => {
  console.log('Job completed:', data);
  // data: { jobId, outputPath, processingTime, spaceSaved }
});
```

#### `job-failed`
Job failure notification:
```javascript
socket.on('job-failed', (data) => {
  console.log('Job failed:', data);
  // data: { jobId, error, errorCode }
});
```

#### `queue-updated`
Queue status updates:
```javascript
socket.on('queue-updated', (data) => {
  console.log('Queue updated:', data);
  // data: { activeJobs, queuedJobs, completedJobs }
});
```

## Rate Limiting

- **Analysis endpoints**: 10 requests per minute
- **Queue management**: 30 requests per minute
- **System info**: 5 requests per minute
- **Cleanup operations**: 2 requests per minute

## Best Practices

1. **File Analysis**: Always analyze files before adding to queue to avoid unnecessary transcoding
2. **Batch Operations**: Use batch analysis for multiple files to improve efficiency
3. **Error Handling**: Implement proper error handling for all API calls
4. **Real-time Updates**: Use WebSocket events for real-time progress tracking
5. **Resource Management**: Monitor system resources and adjust queue size accordingly
6. **Cleanup**: Regularly perform cleanup operations to maintain system health

## Migration from v1

The new API maintains backward compatibility through a compatibility adapter. Existing code using the old transcoding service will continue to work without modification. However, it's recommended to migrate to the new API endpoints to take advantage of enhanced features.

### Compatibility Endpoints

The following legacy endpoints are still available for backward compatibility:

- `POST /api/storage/transcoding/add-to-queue`
- `GET /api/storage/transcoding/status`
- `DELETE /api/storage/transcoding/remove/:jobId`
- `POST /api/storage/transcoding/clear`
- `POST /api/storage/transcoding/stop-all`

These endpoints internally use the new transcoding engine while maintaining the same response format as the old API. 