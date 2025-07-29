import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDuration, formatFileSize } from '../utils/formatters';

const MediaCard = ({ content, onPlay, onClose, isOpen }) => {
  const [selectedResolution, setSelectedResolution] = useState('auto');
  const [availableResolutions, setAvailableResolutions] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [formatWarning, setFormatWarning] = useState(null);

  // Detect mobile and check format compatibility
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    setIsMobile(isMobileDevice);
    
    if (isMobileDevice && content.file_path) {
      const fileExtension = content.file_path.split('.').pop()?.toLowerCase();
      const unsupportedFormats = ['mkv', 'avi', 'wmv', 'flv', 'mov'];
      if (unsupportedFormats.includes(fileExtension)) {
        setFormatWarning(`⚠️ This file (.${fileExtension}) may not play on mobile devices. Try selecting a transcoded version.`);
      }
    }
  }, [content.file_path]);

  // Fetch transcoded versions for this content
  const { data: transcodedData } = useQuery({
    queryKey: ['transcoded', content.id],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/content/${content.id}/transcoded`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return { transcoded: [] };
      return response.json();
    },
    enabled: isOpen && !!content.id
  });

  // Fetch watch progress for this content
  const { data: progressData } = useQuery({
    queryKey: ['watch-progress', content.id],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/content/${content.id}/watch-progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return { hasProgress: false };
      return response.json();
    },
    enabled: isOpen && !!content.id
  });

  useEffect(() => {
    if (transcodedData?.transcoded) {
      const resolutions = ['auto']; // Always include auto
      
      // Add available transcoded versions
      transcodedData.transcoded.forEach(file => {
        if (file.quality_level && !resolutions.includes(file.quality_level)) {
          resolutions.push(file.quality_level);
        }
      });
      
      setAvailableResolutions(resolutions);
      
      // On mobile, if we have transcoded versions and there's a format warning, suggest transcoded
      if (isMobile && formatWarning && resolutions.length > 1) {
        // Prefer 720p or 480p for mobile
        const mobilePreferred = resolutions.find(r => r === '720p' || r === '480p');
        if (mobilePreferred) {
          setSelectedResolution(mobilePreferred);
        }
      }
    }
  }, [transcodedData, isMobile, formatWarning]);

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      return () => {
        // Restore scroll position when modal closes
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Using shared formatters from utils/formatters.js

  const handlePlay = () => {
    console.log('[MediaCard] Play button clicked/touched');
    onPlay(content, selectedResolution);
  };

  const handleResume = () => {
    console.log('[MediaCard] Resume button clicked/touched');
    if (progressData?.hasProgress) {
      onPlay(content, selectedResolution, progressData.progress.currentTime);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden'
      }}
    >
      <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Fixed Header - Not scrollable */}
        <div className="relative h-48 sm:h-64 md:h-80 bg-gradient-to-br from-slate-700 to-slate-900 flex-shrink-0">
          {content.thumbnail_path ? (
            <img 
              src={content.thumbnail_path} 
              alt={content.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl sm:text-6xl text-slate-400">
                {content.media_type === 'video' ? '🎬' : content.media_type === 'audio' ? '🎵' : '📄'}
              </span>
            </div>
          )}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-800 via-transparent to-transparent" />
          
          {/* Close button */}
          <button
            onClick={onClose}
            onTouchEnd={onClose}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 w-10 h-10 sm:w-12 sm:h-12 bg-black/50 hover:bg-black/70 active:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors touch-manipulation z-10"
          >
            <span className="text-lg sm:text-xl">✕</span>
          </button>
          
          {/* Progress bar */}
          {progressData?.hasProgress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-600">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progressData.progress.progressPercentage}%` }}
              />
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Title and basic info */}
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">{content.title}</h1>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-300">
                {content.duration && (
                  <span>{formatDuration(content.duration)}</span>
                )}
                {content.resolution && (
                  <span className="bg-red-600 px-2 py-1 rounded text-xs font-medium">
                    {content.resolution.includes('1920') ? 'HD' : 
                     content.resolution.includes('3840') ? '4K' : 
                     content.resolution.includes('1280') ? 'HD' : 'SD'}
                  </span>
                )}
                <span>{formatFileSize(content.file_size)}</span>
                {content.views > 0 && (
                  <span>{content.views} view{content.views !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            {/* Description */}
            {content.description && (
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Synopsis</h3>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{content.description}</p>
              </div>
            )}

            {/* Format Warning */}
            {formatWarning && (
              <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-sm text-yellow-200">{formatWarning}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Details</h3>
                <div className="space-y-1 text-xs sm:text-sm text-slate-300">
                  <p><span className="text-slate-400">Type:</span> {content.media_type}</p>
                  <p><span className="text-slate-400">Uploaded by:</span> {content.uploader_name}</p>
                  <p><span className="text-slate-400">Uploaded:</span> {new Date(content.created_at).toLocaleDateString()}</p>
                  {content.tags && (
                    <p><span className="text-slate-400">Tags:</span> {content.tags}</p>
                  )}
                </div>
              </div>

              {/* Resolution Selection */}
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Quality</h3>
                <div className="space-y-2">
                  {availableResolutions.map((resolution) => (
                    <label key={resolution} className="flex items-center space-x-3 cursor-pointer touch-manipulation">
                      <input
                        type="radio"
                        name="resolution"
                        value={resolution}
                        checked={selectedResolution === resolution}
                        onChange={(e) => setSelectedResolution(e.target.value)}
                        className="text-blue-500 focus:ring-blue-500 w-4 h-4 sm:w-5 sm:h-5"
                      />
                      <span className="text-xs sm:text-sm text-slate-300">
                        {resolution === 'auto' ? 'Auto (Best Available)' : resolution}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              {progressData?.hasProgress && progressData.progress.progressPercentage > 5 && !progressData.progress.completed ? (
                <>
                  <button
                    onClick={handleResume}
                    onTouchEnd={handleResume}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-4 sm:py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 min-h-[48px] touch-manipulation"
                  >
                    <span className="text-lg sm:text-base">▶️</span>
                    <span className="text-sm sm:text-base">Resume ({Math.round(progressData.progress.progressPercentage)}%)</span>
                  </button>
                  <button
                    onClick={handlePlay}
                    onTouchEnd={handlePlay}
                    className="flex-1 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white py-4 sm:py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 min-h-[48px] touch-manipulation"
                  >
                    <span className="text-lg sm:text-base">🔄</span>
                    <span className="text-sm sm:text-base">Start Over</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handlePlay}
                  onTouchEnd={handlePlay}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-4 sm:py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 min-h-[48px] touch-manipulation"
                >
                  <span className="text-lg sm:text-base">▶️</span>
                  <span className="text-sm sm:text-base">{progressData?.hasProgress && progressData.progress.completed ? 'Watch Again' : 'Play'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaCard; 