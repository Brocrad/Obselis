require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET', 
  'JWT_REFRESH_SECRET', 
  'SMTP_PASS'
];

const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(envVar => console.error(`   - ${envVar}`));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Validate JWT secrets are strong enough (at least 64 characters)
if (process.env.JWT_SECRET.length < 64) {
  console.error('❌ JWT_SECRET must be at least 64 characters long for security');
  process.exit(1);
}

if (process.env.JWT_REFRESH_SECRET.length < 64) {
  console.error('❌ JWT_REFRESH_SECRET must be at least 64 characters long for security');
  process.exit(1);
}


const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const database = require('./utils/database');
const authService = require('./services/authService');
const { sanitizeInput } = require('./middleware/security');
const HTTPSConfig = require('./config/https');
const securityLogger = require('./middleware/securityLogger');
const path = require('path');
const fs = require('fs').promises; // Added for serving static files

const app = express();
const PORT = process.env.PORT || 3001;
const httpsConfig = new HTTPSConfig();

// HTTPS redirect middleware (must be first)
app.use(httpsConfig.redirectToHTTPS());

// Security logging middleware
app.use(securityLogger.logRequest());
app.use(securityLogger.enhancedRateLimitLogger());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:"],
      connectSrc: ["'self'"],
      ...(httpsConfig.httpsEnabled && { upgradeInsecureRequests: [] })
    }
  },
  hsts: httpsConfig.httpsEnabled ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false
}));

// Add custom security headers
app.use((req, res, next) => {
  const securityHeaders = httpsConfig.getSecurityHeaders();
  Object.entries(securityHeaders).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost and local network connections
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3000',
      process.env.FRONTEND_URL
    ];
    
    // Allow any local network IP (including public IPs for mobile access)
    const networkRegex = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\d+\.\d+\.\d+\.\d+):\d+$/;
    
    if (allowedOrigins.includes(origin) || networkRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Increased from 500 to 2000 requests per windowMs for video streaming
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased from 20 to 50 auth attempts per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: { error: 'Too many authentication attempts, please try again later.' }
});

// Email rate limiting
const emailLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Increased from 3 to 5 emails per minute per IP
  message: { error: 'Email rate limit exceeded, please wait before requesting another email.' }
});

// Streaming-specific rate limiting (more lenient for video streaming)
const streamingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Very high limit for streaming requests
  message: { error: 'Streaming rate limit exceeded, please try again later.' }
});

// Per-user rate limiting for authenticated endpoints
const userRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Very high limit per user
  keyGenerator: (req) => {
    // Use user ID from JWT token if available, otherwise fall back to IP
    if (req.user && req.user.id) {
      return `user_${req.user.id}`;
    }
    return req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for unauthenticated requests (they'll use IP-based limiting)
    return !req.user;
  },
  message: { error: 'User rate limit exceeded, please try again later.' }
});

// Special rate limiting for storage analysis (more lenient)
const storageAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Allow 50 storage analysis requests per 15 minutes
  keyGenerator: (req) => {
    // Use user ID from JWT token if available, otherwise fall back to IP
    if (req.user && req.user.id) {
      return `user_${req.user.id}`;
    }
    return req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for unauthenticated requests
    return !req.user;
  },
  message: { error: 'Storage analysis rate limit exceeded, please try again later.' }
});

// Store reference for admin access - ensure we get the actual store
const rateLimitStore = userRateLimit.store || userRateLimit;

app.use(generalLimiter);

// General middleware
app.use(compression());
app.use(morgan('combined'));

// Routes
const usersRoutes = require('./routes/users');
app.use('/api/users', usersRoutes);

// Increase payload limits for large video uploads
app.use(express.json({ limit: '2gb' }));
app.use(express.urlencoded({ extended: true, limit: '2gb', parameterLimit: 50000 }));

// Configure server for large uploads
app.use((req, res, next) => {
  // Increase timeout for upload routes
  if (req.path.includes('/upload')) {
    req.setTimeout(30 * 60 * 1000); // 30 minutes timeout for uploads
    res.setTimeout(30 * 60 * 1000);
  }
  next();
});

// Input sanitization middleware (apply after body parsing)
app.use(sanitizeInput);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Routes
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const chunkedUploadRoutes = require('./routes/chunked-upload');
const storageRoutes = require('./routes/storage');

app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/upload', chunkedUploadRoutes);
app.use('/api/storage', storageRoutes);

// Serve profile pictures
app.use('/uploads/profile-pictures', express.static(path.join(__dirname, '../uploads/profile-pictures')));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve public files (404 page, etc.)
app.use('/public', express.static(path.join(__dirname, 'public')));

// API routes (to be implemented)
app.use('/api/media', require('./routes/media'));
app.use('/api/stream', require('./routes/stream'));
app.use('/api/streaming', require('./routes/stream')); // Add streaming path for analytics
app.use('/api/admin', require('./routes/admin'));
app.use('/api/transcoding-v2', require('./routes/transcoding-v2'));
app.use('/api/support', require('./routes/support'));

// Test routes (for development and testing)
app.use('/api/test', require('./routes/test'));
app.locals.authLimiter = authLimiter;
app.locals.emailLimiter = emailLimiter;
app.locals.streamingLimiter = streamingLimiter;
app.locals.userRateLimit = userRateLimit;
app.locals.rateLimitStore = rateLimitStore;

// Import custom error controller
const ErrorController = require('./middleware/errorController');

// Specific error page routes using dedicated handlers
app.get('/error/400', ErrorController.handle400);
app.get('/error/401', ErrorController.handle401);
app.get('/error/403', ErrorController.handle403);
app.get('/error/404', ErrorController.handle404);
app.get('/error/405', ErrorController.handle405);
app.get('/error/408', ErrorController.handle408);
app.get('/error/413', ErrorController.handle413);
app.get('/error/422', ErrorController.handle422);
app.get('/error/429', ErrorController.handle429);
app.get('/error/500', ErrorController.handle500);
app.get('/error/501', ErrorController.handle501);
app.get('/error/502', ErrorController.handle502);
app.get('/error/503', ErrorController.handle503);
app.get('/error/504', ErrorController.handle504);
app.get('/error/505', ErrorController.handle505);

// Generic error page route for other status codes
app.get('/error/:statusCode', ErrorController.handleGenericError);

// Error handling middleware
app.use(ErrorController.handleError);

// 404 handler - must be last
app.use('*', ErrorController.handle404);

// Initialize database and start server
async function startServer() {
  try {
    // Connect to database
    await database.connect();
    
    // Create default admin user if none exists
    await authService.createDefaultAdmin();
    
    // Start indefinite invite renewal cron job
    authService.startIndefiniteInviteRenewal();
    
    // Create server (HTTP or HTTPS)
    const server = httpsConfig.createServer(app);
    const protocol = httpsConfig.httpsEnabled ? 'https' : 'http';
    
    // Initialize Socket.IO for real-time updates
    const io = new Server(server, {
      cors: {
        origin: function (origin, callback) {
          // Allow requests with no origin (mobile apps, Postman, etc.)
          if (!origin) return callback(null, true);
          
          // Allow localhost and local network connections
          const allowedOrigins = [
            'http://localhost:3000',
            'https://localhost:3000',
            process.env.FRONTEND_URL
          ];
          
          // Allow any local network IP (including public IPs for mobile access)
          const networkRegex = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\d+\.\d+\.\d+\.\d+):\d+$/;
          
          if (allowedOrigins.includes(origin) || networkRegex.test(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'], // Support both transports for mobile
      allowEIO3: true, // Support older Socket.IO clients
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      upgradeTimeout: 30000, // 30 seconds
      maxHttpBufferSize: 1e6 // 1MB buffer
    });
    
    // Make Socket.IO available globally for session management
    global.io = io;
    
    // Track socket connections by session ID
    global.sessionSockets = new Map(); // sessionId -> Set of socket IDs
    global.socketSessions = new Map(); // socketId -> sessionId
    
    // Initialize transcoding engine (temporarily disabled due to PostgreSQL schema issues)
    // const transcodingManager = require('./services/transcoding/gracefulIntegration');

    // try {
    //   // Initialize transcoding engine
    //   await transcodingManager.initialize(io);
    //   global.transcodingService = transcodingManager.getService();
    //   global.transcodingIntegration = transcodingManager;
    // } catch (error) {
    //   console.error('❌ Failed to initialize transcoding engine:', error);
    //   throw error; // Don't fallback, require the new engine to work
    // }
    
    // Temporary fallback transcoding service for storage analysis
    global.transcodingService = {
      analyzeStorageUsage: async (mediaDir) => {
        console.log(`🔍 Analyzing storage usage for: ${mediaDir}`);
        const fs = require('fs').promises;
        const path = require('path');
        
        try {
          const files = await fs.readdir(mediaDir);
          const analysis = {
            totalFiles: 0,
            totalSize: 0,
            allFiles: [],
            compressionCandidates: []
          };
          
          for (const file of files) {
            const filePath = path.join(mediaDir, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isFile()) {
              analysis.totalFiles++;
              analysis.totalSize += stats.size;
              analysis.allFiles.push({
                path: filePath,
                size: stats.size,
                modifiedAt: stats.mtime
              });
            }
          }
          
          return analysis;
        } catch (error) {
          console.error('Error analyzing storage:', error);
          return {
            totalFiles: 0,
            totalSize: 0,
            allFiles: [],
            compressionCandidates: []
          };
        }
      },
      getCompressionStats: async () => {
        return {
          totalCandidates: 0,
          estimatedSavings: 0,
          compressionRatio: 0
        };
      },
      getQueueStatus: () => {
        return {
          isAvailable: false,
          message: 'Transcoding service temporarily unavailable',
          queueLength: 0,
          activeJobs: 0,
          completedJobs: 0,
          failedJobs: 0
        };
      },
      addToQueue: async (filePath, options) => {
        throw new Error('Transcoding service temporarily unavailable');
      },
      addToQueueWithOpus: async (filePath, options) => {
        throw new Error('Transcoding service temporarily unavailable');
      }
    };
    
    // Socket.IO connection handling
    io.on('connection', (socket) => {
      const clientIP = socket.handshake.address;
      const userAgent = socket.handshake.headers['user-agent'];
      
      // Handle session registration
      socket.on('register-session', (data) => {
        
        if (data && data.sessionId) {
          const sessionId = data.sessionId;
          
          // Add socket to session tracking
          if (!global.sessionSockets.has(sessionId)) {
            global.sessionSockets.set(sessionId, new Set());
          }
          global.sessionSockets.get(sessionId).add(socket.id);
          global.socketSessions.set(socket.id, sessionId);
          
          
          // Send confirmation back to client
          socket.emit('session-registered', {
            success: true,
            sessionId: sessionId,
            socketId: socket.id,
            message: 'Session registered successfully'
          });
        } else {
          
          // Send error back to client
          socket.emit('session-registration-failed', {
            success: false,
            error: 'INVALID_DATA',
            message: 'Invalid session registration data - sessionId is required'
          });
        }
      });
      
      // Handle ping/pong for connection testing
      socket.on('ping', (data) => {
        socket.emit('pong', {
          timestamp: Date.now(),
          originalData: data,
          message: 'Pong from server'
        });
      });
      
      socket.on('disconnect', (reason) => {
        
        // Clean up session tracking
        const sessionId = global.socketSessions.get(socket.id);
        if (sessionId) {
          const sessionSockets = global.sessionSockets.get(sessionId);
          if (sessionSockets) {
            sessionSockets.delete(socket.id);
            if (sessionSockets.size === 0) {
              global.sessionSockets.delete(sessionId);
            }
          }
          global.socketSessions.delete(socket.id);
        }
      });
      
      socket.on('error', (error) => {
        console.error(`🚫 Socket error for ${socket.id}:`, error);
      });
      
      // Send current transcoding status when client connects
      try {
        if (global.transcodingService && global.transcodingService.getQueueStatus) {
          const status = global.transcodingService.getQueueStatus();
          socket.emit('transcoding-status', status);
        } else {
          // Fallback status when transcoding service is not available
          socket.emit('transcoding-status', {
            isAvailable: false,
            message: 'Transcoding service temporarily unavailable'
          });
        }
      } catch (error) {
        console.error(`❌ Failed to send initial status to ${socket.id}:`, error);
      }
    });
    
    server.listen(PORT, () => {
      
      if (httpsConfig.httpsEnabled) {
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await database.close();
  process.exit(0);
});

startServer(); 
