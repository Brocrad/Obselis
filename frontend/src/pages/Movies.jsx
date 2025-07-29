import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAuth from '../hooks/useAuth';
import MediaPlayer from '../components/MediaPlayer';
import MediaCard from '../components/MediaCard';

const API_BASE_URL = 'http://162.206.88.79:3001';

// Helper function to decode HTML entities
const decodeHtmlEntities = (text) => {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

const Movies = () => {
  const { user } = useAuth();
  const [selectedContent, setSelectedContent] = useState(null);
  const [showMediaCard, setShowMediaCard] = useState(false);
  const [mediaCardContent, setMediaCardContent] = useState(null);
  const [playResolution, setPlayResolution] = useState('auto');
  const [playResumeTime, setPlayResumeTime] = useState(null);

  // Fetch movies (content with category 'movie')
  const { data: moviesData, isLoading: moviesLoading } = useQuery({
    queryKey: ['content', 'movies'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content?category=movie', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch movies');
      return response.json();
    },
    enabled: !!user
  });

  // Fetch watch history for progress indicators
  const { data: watchHistory } = useQuery({
    queryKey: ['watch-history'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/watch-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return { history: [] };
      return response.json();
    },
    enabled: !!user
  });

  // Create a map of media ID to watch progress
  const progressMap = watchHistory?.history?.reduce((map, item) => {
    map[item.mediaId] = item;
    return map;
  }, {}) || {};

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMovieClick = (movie) => {
    console.log('[Movies] Movie clicked:', movie.title);
    setMediaCardContent(movie);
    setShowMediaCard(true);
  };

  const handlePlayFromCard = (content, resolution, resumeTime = null) => {
    console.log('[Movies] Play from card:', content.title, 'resolution:', resolution, 'resumeTime:', resumeTime);
    setSelectedContent(content);
    setShowMediaCard(false);
    setPlayResolution(resolution);
    setPlayResumeTime(resumeTime);
  };

  const handleCloseMediaCard = () => {
    console.log('[Movies] Media card closed');
    setShowMediaCard(false);
    setMediaCardContent(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="card-modern p-8 text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-pink-500 rounded-large flex items-center justify-center shadow-large">
              <span className="text-2xl">🎬</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 to-pink-400 bg-clip-text text-transparent">
                Movies
              </h1>
              <p className="text-slate-400">
                Discover and watch your favorite movies
              </p>
            </div>
          </div>
        </div>

        {/* Movies Grid */}
        <div className="card-modern p-8">
          {moviesLoading ? (
            <div className="text-center py-12">
              <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading movies...</p>
            </div>
          ) : moviesData?.content?.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center space-x-2">
                  <span>🎬</span>
                  <span>Movie Library</span>
                </h2>
                <div className="text-sm text-slate-400">
                  {moviesData.content.length} movie{moviesData.content.length !== 1 ? 's' : ''} available
                </div>
              </div>
              
              {/* Netflix-style Movie Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {moviesData.content.map((movie) => {
                  // Parse tags properly - first tag is category, rest are additional tags
                  // Decode HTML entities first, then split and parse
                  const decodedTags = decodeHtmlEntities(movie.tags || '');
                  const allTags = decodedTags.split(',').map(tag => tag.trim()).filter(tag => tag);
                  const additionalTags = allTags.slice(1); // Skip the category tag
                  
                  return (
                    <div 
                      key={movie.id} 
                      className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:z-10"
                      onClick={() => handleMovieClick(movie)}
                    >
                      {/* Netflix-style Card */}
                      <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-slate-800 shadow-lg group-hover:shadow-2xl">
                        {movie.thumbnail_path ? (
                          <img 
                            src={movie.thumbnail_path} 
                            alt={movie.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                            <span className="text-4xl text-slate-400">🎬</span>
                          </div>
                        )}
                        
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        {/* Watch Progress Bar */}
                        {progressMap[movie.id] && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-600/50">
                            <div
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${progressMap[movie.id].progressPercentage}%` }}
                            />
                          </div>
                        )}
                        
                        {/* Progress Percentage Badge */}
                        {progressMap[movie.id] && progressMap[movie.id].progressPercentage > 5 && (
                          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                            {progressMap[movie.id].progressPercentage.toFixed(0)}%
                          </div>
                        )}
                        
                        {/* Play button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 transform scale-75 group-hover:scale-100 transition-transform duration-300">
                            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                        
                        {/* Duration badge */}
                        {movie.duration && (
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                            {formatDuration(movie.duration)}
                          </div>
                        )}
                        
                        {/* Quality badge */}
                        {movie.resolution && (
                          <div className="absolute top-2 left-2 bg-red-600/90 text-white text-xs px-2 py-1 rounded font-medium">
                            {movie.resolution.includes('1920') ? 'HD' : 
                             movie.resolution.includes('3840') ? '4K' : 
                             movie.resolution.includes('1280') ? 'HD' : 'SD'}
                          </div>
                        )}
                      </div>
                      
                      {/* Movie Info */}
                      <div className="mt-3 space-y-2">
                        <h3 className="font-semibold text-white text-sm leading-tight line-clamp-2 group-hover:text-red-400 transition-colors">
                          {movie.title}
                        </h3>
                        
                        {/* Tags - Clean display */}
                        {additionalTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {additionalTags.slice(0, 2).map((tag, index) => (
                              <span 
                                key={index} 
                                className="text-xs bg-slate-700/60 text-slate-300 px-2 py-1 rounded-full border border-slate-600/50"
                              >
                                {decodeHtmlEntities(tag)}
                              </span>
                            ))}
                            {additionalTags.length > 2 && (
                              <span className="text-xs text-slate-400">
                                +{additionalTags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Metadata */}
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>{formatFileSize(movie.file_size)}</span>
                          {movie.views > 0 && (
                            <span>{movie.views} view{movie.views !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        
                        {/* Description on hover */}
                        {movie.description && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <p className="text-xs text-slate-400 line-clamp-3 mt-2">
                              {decodeHtmlEntities(movie.description)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎬</div>
              <h2 className="text-2xl font-bold mb-2">No Movies Found</h2>
              <p className="text-slate-400">No movies are available in your library.</p>
            </div>
          )}
        </div>
      </div>

      {/* Media Card Modal */}
      {showMediaCard && mediaCardContent && (
        <MediaCard
          content={mediaCardContent}
          onPlay={handlePlayFromCard}
          onClose={handleCloseMediaCard}
          isOpen={showMediaCard}
        />
      )}

      {/* Media Player */}
      {selectedContent && (
        <MediaPlayer
          content={selectedContent}
          onClose={() => setSelectedContent(null)}
          resolution={playResolution}
          resumeTime={playResumeTime}
        />
      )}
    </div>
  );
};

export default Movies; 