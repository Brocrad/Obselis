#!/bin/bash

# Personal Media Server - Initial Setup Script
echo "🚀 Setting up Personal Media Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && npm install && cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Install shared dependencies
echo "📦 Installing shared dependencies..."
cd shared && npm install && cd ..

# Create necessary directories
echo "📁 Creating directory structure..."
mkdir -p media/movies media/tv-shows media/uploads media/metadata/posters media/metadata/backdrops media/metadata/thumbnails
mkdir -p temp logs nginx/ssl
mkdir -p backend/database/migrations backend/database/seeds

# Create .gitkeep files
touch media/movies/.gitkeep media/tv-shows/.gitkeep media/uploads/.gitkeep temp/.gitkeep logs/.gitkeep

# Copy environment file
if [ ! -f backend/.env ]; then
    echo "📝 Creating environment file..."
    cp backend/env.example backend/.env
    echo "⚠️  Please edit backend/.env with your configuration"
fi

# Check for FFmpeg
if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg detected: $(ffmpeg -version | head -n1)"
else
    echo "⚠️  FFmpeg not found. Please install FFmpeg for video transcoding."
fi

# Check for Docker
if command -v docker &> /dev/null; then
    echo "✅ Docker detected: $(docker --version)"
else
    echo "⚠️  Docker not found. Install Docker for containerized deployment."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your configuration"
echo "2. Install FFmpeg if not already installed"
echo "3. Run 'npm run dev' to start development servers"
echo "4. Visit http://localhost:3000 for the web client"
echo ""
echo "For production deployment:"
echo "1. Configure SSL certificates in nginx/ssl/"
echo "2. Run 'docker-compose up -d' to start all services"
echo "" 