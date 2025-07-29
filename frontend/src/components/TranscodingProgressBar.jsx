import React, { useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';

const TranscodingProgressBar = ({ mediaId, fileName, onComplete }) => {
  const { transcodingProgress, isConnected } = useSocket();
  const [localProgress, setLocalProgress] = useState(null);
  const [isComplete, setIsComplete] = useState(false);

  // Filter progress for this specific file
  useEffect(() => {
    if (transcodingProgress) {
      // Check if this progress update is for our file
      if (fileName && (
        transcodingProgress.fileName?.includes(fileName.split('.')[0]) ||
        transcodingProgress.inputFile?.includes(fileName.split('.')[0])
      )) {
        setLocalProgress(transcodingProgress);
        
        // Check if transcoding is complete
        if (transcodingProgress.status === 'completed' || transcodingProgress.progress >= 100) {
          setIsComplete(true);
          setTimeout(() => {
            onComplete?.();
          }, 2000); // Wait 2 seconds before calling onComplete
        }
      }
    }
  }, [transcodingProgress, fileName, onComplete]);

  // If no progress data, don't render
  if (!localProgress && !isComplete) {
    return null;
  }

  const progress = localProgress?.progress || 0;
  const quality = localProgress?.quality || 'Unknown';
  const status = localProgress?.status || 'processing';
  const eta = localProgress?.eta;

  return (
    <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-4 mb-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <h3 className="text-sm font-semibold text-white truncate">
            {isComplete ? '✅ Transcoding Complete' : '🎬 Transcoding in Progress'}
          </h3>
        </div>
        <div className="text-xs text-slate-400 flex-shrink-0">
          {isComplete ? 'Ready to watch!' : `${progress}%`}
        </div>
      </div>

      {!isComplete && (
        <>
          {/* Progress Bar */}
          <div className="w-full bg-slate-700/50 rounded-full h-2 mb-3 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${Math.min(progress, 100)}%` }}
            >
              <div className="w-full h-full bg-white/20 rounded-full animate-pulse"></div>
            </div>
          </div>

          {/* Status Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs">
            <div className="text-slate-300 truncate">
              <span className="text-slate-500">Quality:</span> {quality}
            </div>
            <div className="text-slate-300 truncate">
              <span className="text-slate-500">Status:</span> {status}
            </div>
            {eta && (
              <div className="text-slate-300 col-span-1 sm:col-span-2 truncate">
                <span className="text-slate-500">ETA:</span> {eta}
              </div>
            )}
          </div>

          {/* Processing indicator */}
          <div className="mt-3 flex items-center space-x-2 text-xs text-slate-400">
            <div className="flex space-x-1 flex-shrink-0">
              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="truncate">Converting to web-optimized format...</span>
          </div>
        </>
      )}

      {isComplete && (
        <div className="flex items-center justify-between mt-3 p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">✓</span>
            </div>
            <div className="text-sm min-w-0">
              <div className="text-green-400 font-medium truncate">Video is ready to stream!</div>
              <div className="text-green-300/70 text-xs truncate">Optimized for all devices</div>
            </div>
          </div>
          <button 
            onClick={onComplete}
            className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors flex-shrink-0"
          >
            View Now
          </button>
        </div>
      )}
    </div>
  );
};

export default TranscodingProgressBar; 