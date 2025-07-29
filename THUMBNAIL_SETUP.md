# 🎨 Advanced Thumbnail System Setup

The media server now includes an advanced thumbnail generation system that can automatically create movie poster-style thumbnails with titles. Here's how to set it up:

## 🌟 Features

### 1. **Automatic Movie Poster Fetching**
- Fetches real movie posters from external APIs
- Supports TMDB (The Movie Database) and OMDB (Open Movie Database)
- Automatically extracts movie titles from filenames

### 2. **Intelligent Frame Extraction**
- Extracts high-quality frames from videos at 20% timestamp
- Creates stylized posters with title overlays
- Maintains proper aspect ratios

### 3. **Fallback Text Posters**
- Creates beautiful text-based posters when other methods fail
- Different styles for movies vs TV shows
- Gradient backgrounds with decorative elements

## 🔧 Setup Instructions

### Step 1: Get API Keys (Optional but Recommended)

#### TMDB API Key (Free)
1. Go to [themoviedb.org](https://www.themoviedb.org/)
2. Create a free account
3. Go to Settings → API
4. Request an API key (choose "Developer" option)
5. Add to your environment: `TMDB_API_KEY=your-key-here`

#### OMDB API Key (Free)
1. Go to [omdbapi.com](http://www.omdbapi.com/apikey.aspx)
2. Request a free API key
3. Add to your environment: `OMDB_API_KEY=your-key-here`

### Step 2: Environment Configuration

Add these variables to your `.env` file in the backend directory:

```env
# Movie Poster APIs (Optional)
TMDB_API_KEY=your-tmdb-api-key-here
OMDB_API_KEY=your-omdb-api-key-here
```

### Step 3: Restart the Server

After adding the API keys, restart your server:

```bash
npm run dev
```

## 🎯 How It Works

### Automatic Thumbnail Generation
When you upload a video, the system will:

1. **Extract movie title** from filename (removes quality tags, years, etc.)
2. **Search for poster** using TMDB API first, then OMDB
3. **Download and optimize** the poster if found
4. **Extract video frame** if no poster found
5. **Create stylized poster** with title overlay
6. **Generate text poster** as final fallback

### Manual Regeneration
Admins can regenerate all thumbnails using the "Regenerate Thumbnails" button in the Statistics tab.

## 📁 File Structure

```
backend/
├── src/
│   └── services/
│       └── thumbnailService.js    # Advanced thumbnail generation
├── uploads/
│   ├── thumbnails/               # Generated thumbnails
│   └── temp/                     # Temporary files
```

## 🎨 Thumbnail Types

### 1. **Real Movie Posters**
- High-quality official posters
- Automatically resized to 400x600px
- Optimized for web delivery

### 2. **Stylized Video Frames**
- Extracted from video at 20% timestamp
- Title overlay with gradient background
- Professional movie poster appearance

### 3. **Text-Based Posters**
- Beautiful gradient backgrounds
- Movie/TV show specific styling
- Automatic text wrapping and sizing

## 🔧 Troubleshooting

### No Thumbnails Generated
1. Check if FFmpeg is installed and accessible
2. Verify video file permissions
3. Check server logs for specific errors

### API Rate Limits
- TMDB: 40 requests per 10 seconds
- OMDB: 1000 requests per day (free tier)
- The system includes automatic delays to respect limits

### Poor Title Extraction
The system automatically cleans filenames by removing:
- Quality indicators (720p, 1080p, 4K, etc.)
- Release groups ([YTS], [RARBG], etc.)
- Codec information (x264, x265, HEVC, etc.)
- Years and everything after

## 🚀 Performance

- **Parallel processing** for multiple thumbnails
- **Automatic caching** of downloaded posters
- **Optimized image compression** using Sharp
- **Graceful fallbacks** ensure thumbnails are always generated

## 📊 Admin Features

- **Batch regeneration** of all thumbnails
- **Progress tracking** during regeneration
- **Detailed statistics** on success/failure rates
- **Manual trigger** for specific content

The system is designed to work without API keys, but having them significantly improves the quality and accuracy of thumbnails by fetching real movie posters. 