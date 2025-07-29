import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const WatchHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWatchHistory();
  }, []);

  const fetchWatchHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/content/watch-history', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data.history);
      } else {
        setError('Failed to load watch history');
      }
    } catch (error) {
      console.error('Error fetching watch history:', error);
      setError('Failed to load watch history');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleResume = (item) => {
    navigate(`/player/${item.mediaId}`);
  };

  const handleRemoveFromHistory = async (mediaId) => {
    try {
      const response = await fetch(`/api/content/${mediaId}/watch-progress`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setHistory(history.filter(item => item.mediaId !== mediaId));
      }
    } catch (error) {
      console.error('Error removing from history:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading watch history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Watch History</h1>
          <button
            onClick={() => navigate('/')}
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📺</div>
            <h2 className="text-2xl font-bold mb-2">No Watch History</h2>
            <p className="text-slate-400">Start watching some content to see your history here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {history.map((item) => (
              <div key={item.id} className="bg-slate-800 rounded-lg overflow-hidden hover:bg-slate-700 transition-colors">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-700">
                  {item.thumbnailPath ? (
                    <img
                      src={item.thumbnailPath}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">
                        {item.mediaType === 'video' ? '🎬' : item.mediaType === 'audio' ? '🎵' : '📄'}
                      </span>
                    </div>
                  )}
                  
                  {/* Progress Bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-600">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${item.progressPercentage}%` }}
                    />
                  </div>
                  
                  {/* Progress Percentage */}
                  <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs">
                    {item.progressPercentage.toFixed(0)}%
                  </div>
                </div>

                {/* Content Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-2 line-clamp-2">{item.title}</h3>
                  
                  <div className="text-sm text-slate-400 space-y-1 mb-4">
                    <p>Progress: {formatTime(item.currentTime)} / {formatTime(item.duration)}</p>
                    <p>Size: {formatFileSize(item.fileSize)}</p>
                    <p>Last watched: {formatDate(item.lastWatched)}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleResume(item)}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 py-2 px-3 rounded text-sm transition-colors"
                    >
                      {item.completed ? 'Watch Again' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleRemoveFromHistory(item.mediaId)}
                      className="bg-slate-600 hover:bg-slate-500 py-2 px-3 rounded text-sm transition-colors"
                      title="Remove from history"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchHistory; 