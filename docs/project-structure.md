# Project Structure

This document outlines the complete file structure and organization of the Personal Media Server project.

## 📁 Root Directory Structure

```
personal-media-server/
├── 📁 backend/                 # Node.js API server
├── 📁 frontend/                # React web client
├── 📁 roku-client/             # Roku SceneGraph application
├── 📁 shared/                  # Shared utilities and types
├── 📁 media/                   # Media file storage
├── 📁 docs/                    # Project documentation
├── 📁 scripts/                 # Deployment and utility scripts
├── 📁 nginx/                   # Nginx configuration
├── 📁 temp/                    # Temporary files (transcoding, uploads)
├── 📁 logs/                    # Application logs
├── 📄 docker-compose.yml       # Docker orchestration
├── 📄 package.json             # Root package.json (monorepo)
├── 📄 README.md                # Project overview
└── 📄 .gitignore               # Git ignore rules
```

## 🔧 Backend Structure (`/backend/`)

```
backend/
├── 📁 src/
│   ├── 📁 routes/              # API route handlers
│   │   ├── auth.js             # Authentication endpoints
│   │   ├── users.js            # User management
│   │   ├── media.js            # Media library management
│   │   ├── stream.js           # Video streaming endpoints
│   │   └── admin.js            # Admin functionality
│   ├── 📁 middleware/          # Express middleware
│   │   ├── auth.js             # JWT authentication
│   │   ├── validation.js       # Request validation
│   │   ├── upload.js           # File upload handling
│   │   └── rateLimit.js        # Rate limiting
│   ├── 📁 models/              # Database models
│   │   ├── User.js             # User model
│   │   ├── Media.js            # Media item model
│   │   ├── InviteToken.js      # Invite token model
│   │   └── WatchHistory.js     # Watch history model
│   ├── 📁 services/            # Business logic services
│   │   ├── authService.js      # Authentication logic
│   │   ├── mediaService.js     # Media processing
│   │   ├── transcodingService.js # Video transcoding
│   │   ├── metadataService.js  # Metadata extraction
│   │   └── streamingService.js # HLS streaming
│   ├── 📁 utils/               # Utility functions
│   │   ├── database.js         # Database connection
│   │   ├── logger.js           # Logging configuration
│   │   ├── fileSystem.js       # File operations
│   │   └── validation.js       # Input validation
│   ├── 📁 config/              # Configuration files
│   │   ├── database.js         # Database config
│   │   ├── redis.js            # Redis config
│   │   └── ffmpeg.js           # FFmpeg config
│   └── server.js               # Main server entry point
├── 📁 database/                # Database related files
│   ├── 📁 migrations/          # Database migrations
│   ├── 📁 seeds/               # Database seed data
│   └── 📁 init/                # Database initialization
├── 📁 tests/                   # Backend tests
│   ├── 📁 unit/                # Unit tests
│   ├── 📁 integration/         # Integration tests
│   └── 📁 fixtures/            # Test data
├── 📄 package.json             # Backend dependencies
├── 📄 Dockerfile              # Backend Docker image
├── 📄 env.example              # Environment variables template
└── 📄 knexfile.js              # Database migration config
```

## 🎨 Frontend Structure (`/frontend/`)

```
frontend/
├── 📁 src/
│   ├── 📁 components/          # Reusable React components
│   │   ├── 📁 common/          # Common UI components
│   │   │   ├── Button.jsx      # Button component
│   │   │   ├── Input.jsx       # Input component
│   │   │   ├── Modal.jsx       # Modal component
│   │   │   └── Loading.jsx     # Loading spinner
│   │   ├── 📁 media/           # Media-specific components
│   │   │   ├── MediaCard.jsx   # Media item card
│   │   │   ├── MediaGrid.jsx   # Media grid layout
│   │   │   ├── VideoPlayer.jsx # HLS video player
│   │   │   └── MediaDetails.jsx # Media details view
│   │   ├── 📁 navigation/      # Navigation components
│   │   │   ├── Header.jsx      # Main header
│   │   │   ├── Sidebar.jsx     # Sidebar navigation
│   │   │   └── Breadcrumb.jsx  # Breadcrumb navigation
│   │   ├── Layout.jsx          # Main layout wrapper
│   │   └── ProtectedRoute.jsx  # Route protection
│   ├── 📁 pages/               # Page components
│   │   ├── Home.jsx            # Home/dashboard page
│   │   ├── Login.jsx           # Login page
│   │   ├── Register.jsx        # Registration page
│   │   ├── Movies.jsx          # Movies library
│   │   ├── TVShows.jsx         # TV shows library
│   │   ├── Player.jsx          # Video player page
│   │   ├── Profile.jsx         # User profile
│   │   ├── Admin.jsx           # Admin dashboard
│   │   └── NotFound.jsx        # 404 page
│   ├── 📁 hooks/               # Custom React hooks
│   │   ├── useAuth.js          # Authentication hook
│   │   ├── useMedia.js         # Media data hook
│   │   ├── usePlayer.js        # Video player hook
│   │   └── useLocalStorage.js  # Local storage hook
│   ├── 📁 services/            # API service functions
│   │   ├── api.js              # Axios configuration
│   │   ├── authService.js      # Authentication API
│   │   ├── mediaService.js     # Media API
│   │   └── userService.js      # User API
│   ├── 📁 store/               # State management
│   │   ├── authStore.js        # Authentication state
│   │   ├── mediaStore.js       # Media state
│   │   └── uiStore.js          # UI state
│   ├── 📁 utils/               # Utility functions
│   │   ├── constants.js        # App constants
│   │   ├── helpers.js          # Helper functions
│   │   └── formatters.js       # Data formatters
│   ├── 📁 styles/              # CSS and styling
│   │   ├── globals.css         # Global styles
│   │   ├── components.css      # Component styles
│   │   └── tailwind.css        # Tailwind imports
│   ├── App.jsx                 # Main App component
│   └── main.jsx                # React entry point
├── 📁 public/                  # Static assets
│   ├── favicon.ico             # Favicon
│   ├── logo.png                # App logo
│   └── manifest.json           # PWA manifest
├── 📁 tests/                   # Frontend tests
│   ├── 📁 components/          # Component tests
│   ├── 📁 pages/               # Page tests
│   └── 📁 utils/               # Utility tests
├── 📄 package.json             # Frontend dependencies
├── 📄 vite.config.js           # Vite configuration
├── 📄 tailwind.config.js       # Tailwind CSS config
├── 📄 Dockerfile              # Frontend Docker image
└── 📄 index.html               # HTML template
```

## 📺 Roku Client Structure (`/roku-client/`)

```
roku-client/
├── 📁 components/              # SceneGraph components
│   ├── MainScene.brs           # Main scene
│   ├── MediaGrid.brs           # Media grid view
│   ├── VideoPlayer.brs         # Video player
│   └── LoginScreen.brs         # Login interface
├── 📁 source/                  # BrightScript source files
│   ├── main.brs                # Main entry point
│   ├── api.brs                 # API communication
│   ├── auth.brs                # Authentication
│   └── utils.brs               # Utility functions
├── 📁 images/                  # App images and icons
├── 📄 manifest                 # Roku app manifest
└── 📄 README.md                # Roku development guide
```

## 🔄 Shared Code (`/shared/`)

```
shared/
├── 📁 types/                   # TypeScript type definitions
│   ├── user.ts                 # User types
│   ├── media.ts                # Media types
│   └── api.ts                  # API response types
├── 📁 constants/               # Shared constants
│   ├── mediaTypes.js           # Media type constants
│   ├── userRoles.js            # User role constants
│   └── apiEndpoints.js         # API endpoint constants
├── 📁 utils/                   # Shared utilities
│   ├── validation.js           # Validation schemas
│   ├── formatters.js           # Data formatters
│   └── helpers.js              # Helper functions
└── 📄 package.json             # Shared package config
```

## 🗄️ Media Storage (`/media/`)

```
media/
├── 📁 movies/                  # Movie files
│   ├── 📁 The Matrix (1999)/
│   │   ├── movie.mkv           # Original file
│   │   ├── 📁 transcoded/      # Transcoded versions
│   │   │   ├── 📁 1080p/       # 1080p HLS segments
│   │   │   ├── 📁 720p/        # 720p HLS segments
│   │   │   └── 📁 480p/        # 480p HLS segments
│   │   ├── 📁 subtitles/       # Subtitle files
│   │   └── metadata.json       # Movie metadata
│   └── 📁 Inception (2010)/
├── 📁 tv-shows/                # TV show files
│   ├── 📁 Breaking Bad/
│   │   ├── 📁 Season 01/
│   │   │   ├── S01E01.mkv
│   │   │   └── 📁 transcoded/
│   │   └── 📁 Season 02/
│   └── 📁 The Office/
├── 📁 metadata/                # Cached metadata
│   ├── 📁 posters/             # Movie/show posters
│   ├── 📁 backdrops/           # Background images
│   └── 📁 thumbnails/          # Video thumbnails
└── 📁 uploads/                 # Temporary upload area
```

## 📚 Documentation (`/docs/`)

```
docs/
├── project-structure.md        # This file
├── api-documentation.md        # API endpoint docs
├── deployment-guide.md         # Deployment instructions
├── development-setup.md        # Development environment
├── roku-development.md         # Roku client guide
├── transcoding-guide.md        # Video transcoding setup
├── security-guide.md           # Security best practices
└── troubleshooting.md          # Common issues and fixes
```

## 🚀 Scripts (`/scripts/`)

```
scripts/
├── setup.sh                    # Initial project setup
├── deploy.sh                   # Production deployment
├── backup.sh                   # Database backup
├── media-scan.js               # Media library scanner
├── user-management.js          # User management utilities
└── ssl-setup.sh                # SSL certificate setup
```

## 🌐 Nginx Configuration (`/nginx/`)

```
nginx/
├── nginx.conf                  # Main Nginx config
├── 📁 ssl/                     # SSL certificates
│   ├── cert.pem                # SSL certificate
│   └── private.key             # Private key
└── 📁 conf.d/                  # Additional configs
    └── media-server.conf       # Media server config
```

## Key Features by Directory

### Backend Features
- **Authentication**: JWT-based auth with invite system
- **Media Management**: File upload, metadata extraction, library organization
- **Streaming**: HLS adaptive bitrate streaming with FFmpeg transcoding
- **Admin Panel**: User management, invite generation, system monitoring

### Frontend Features
- **Modern UI**: React with Tailwind CSS, responsive design
- **Video Player**: HLS.js integration with quality selection
- **User Experience**: Netflix-like interface with search and filtering
- **PWA Support**: Offline capabilities and mobile optimization

### Roku Client Features
- **Native Experience**: Custom SceneGraph application
- **Remote Control**: Optimized for Roku remote navigation
- **Direct Streaming**: HLS streaming without transcoding overhead

This structure supports:
- 🔄 **Monorepo Development**: Shared code and coordinated releases
- 🐳 **Containerization**: Docker support for all services
- 📈 **Scalability**: Microservices architecture ready for growth
- 🔒 **Security**: Comprehensive authentication and authorization
- 🌐 **WAN Access**: Optimized for internet streaming with adaptive bitrate 