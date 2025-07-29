# Media Server Project

A comprehensive media streaming server with transcoding capabilities, user management, and modern web interface.

## 🚀 Features

- **Media Streaming**: Stream movies and TV shows with adaptive bitrate
- **Transcoding Engine**: Automatic video transcoding for optimal playback
- **User Management**: Authentication, user sessions, and admin controls
- **Modern UI**: React-based frontend with responsive design
- **Database**: PostgreSQL with comprehensive schema
- **Security**: HTTPS support, session management, and security logging
- **Kubernetes Ready**: Complete deployment manifests for production

## 📁 Project Structure

```
├── backend/                 # Node.js backend server
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Authentication & security
│   │   └── models/         # Database models
│   ├── database/           # Database migrations & seeds
│   └── uploads/            # Media storage (gitignored)
├── frontend/               # React frontend application
├── k8s/                    # Kubernetes deployment manifests
└── docs/                   # Project documentation
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- FFmpeg (for transcoding)
- Docker (optional, for containerized deployment)

### Backend Setup
```bash
cd backend
npm install
cp .env-example .env
# Configure your .env file with database and other settings
npm run migrate
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Database Setup
See `backend/POSTGRESQL_STARTUP_GUIDE.md` for detailed database setup instructions.

## 📝 Important Notes

### Large Files
This repository excludes large media files to maintain reasonable repository size:
- Media files are stored in `backend/uploads/` (gitignored)
- Use external storage solutions for production media
- Directory structure is preserved with `.gitkeep` files

### Environment Configuration
- Copy `backend/.env-example` to `backend/.env`
- Configure database connection, JWT secrets, and other settings
- See individual service documentation for specific configuration options

## 🚀 Deployment

### Kubernetes Deployment
Complete Kubernetes manifests are provided in the `k8s/` directory:
- Production deployment configurations
- Cloudflare integration setup
- Monitoring and load balancing

### Docker Deployment
```bash
docker-compose up -d
```

## 📚 Documentation

- [Transcoding API Documentation](docs/transcoding-api-v2.md)
- [Production Deployment Guide](PRODUCTION-DEPLOYMENT.md)
- [Security Audit Report](SECURITY-AUDIT-REPORT.md)
- [Network Access Guide](NETWORK_ACCESS.md)

## 🔧 Development

### Adding New Features
1. Create feature branch from `main`
2. Implement changes with proper error handling
3. Add tests and documentation
4. Submit pull request

### Code Style
- Follow existing code patterns
- Use comprehensive error handling
- Add JSDoc comments for functions
- Maintain security best practices

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the documentation in the `docs/` directory
- Review error handling guides in `backend/src/middleware/`
- Open an issue for bugs or feature requests 
