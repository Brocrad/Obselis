import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { formatFileSize, formatDuration } from '../utils/formatters';

const TranscodingProgressTracker = () => {
  const { transcodingProgress, isConnected } = useSocket();
  const [queueStatus, setQueueStatus] = useState(null);
  const [compressionStats, setCompressionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch queue status and stats
  const fetchTranscodingStatus = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch('/api/storage/transcoding/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        setError('Authentication expired. Please refresh the page and log in again.');
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data.queue);
        setCompressionStats(data.stats);
        setError(null);
      } else {
        setError(`Failed to fetch transcoding status: ${response.status}`);
      }
    } catch (err) {
      console.error('Transcoding status error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch status on mount and every 5 seconds
  useEffect(() => {
    fetchTranscodingStatus();
    const interval = setInterval(fetchTranscodingStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Using shared formatters from utils/formatters.js

  if (loading && !queueStatus) {
    return (
      <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-6 overflow-hidden">
        <div className="flex items-center justify-center space-x-2">
          <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-slate-400">Loading transcoding status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 overflow-hidden">
        <div className="flex items-center space-x-2">
          <span className="text-red-400">⚠️</span>
          <span className="text-red-300">{error}</span>
          <button 
            onClick={fetchTranscodingStatus}
            className="ml-auto px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded hover:bg-red-600/30 transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isProcessing = queueStatus?.isProcessing || false;
  const queueLength = queueStatus?.queue?.length || 0;
  const activeJobs = queueStatus?.activeJobs || new Map();
  const activeJobCount = activeJobs.size;

  return (
    <div className="space-y-4 overflow-hidden">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-sm font-medium text-white truncate">
            {isConnected ? 'Connected to Transcoding Service' : 'Disconnected from Transcoding Service'}
          </span>
        </div>
        <button 
          onClick={fetchTranscodingStatus}
          className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded hover:bg-blue-600/30 transition-colors flex-shrink-0"
        >
          Refresh
        </button>
      </div>

      {/* Queue Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-slate-400 text-xs">Queue Status</p>
              <p className="text-white font-semibold text-lg truncate">
                {isProcessing ? 'Processing' : 'Idle'}
              </p>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              isProcessing ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/50 text-slate-400'
            }`}>
              {isProcessing ? '⚡' : '⏸️'}
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-slate-400 text-xs">Active Jobs</p>
              <p className="text-white font-semibold text-lg">{activeJobCount}</p>
            </div>
            <div className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center flex-shrink-0">
              🎬
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-slate-400 text-xs">Queued Files</p>
              <p className="text-white font-semibold text-lg">{queueLength}</p>
            </div>
            <div className="w-8 h-8 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center flex-shrink-0">
              📋
            </div>
          </div>
        </div>
      </div>

      {/* Active Jobs */}
      {activeJobCount > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 overflow-hidden">
          <h4 className="text-white font-semibold mb-3 flex items-center space-x-2">
            <span>🎬 Active Transcoding Jobs</span>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full flex-shrink-0">
              {activeJobCount} active
            </span>
          </h4>
          
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {Array.from(activeJobs.entries()).map(([jobId, job]) => (
              <div key={jobId} className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-3 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                    <span className="text-white text-sm font-medium truncate">
                      {job.inputPath ? job.inputPath.split('/').pop() : 'Unknown File'}
                    </span>
                  </div>
                  <span className="text-slate-400 text-xs flex-shrink-0">
                    {job.qualities?.join(', ') || 'Unknown Quality'}
                  </span>
                </div>
                
                {transcodingProgress && transcodingProgress.jobId === jobId && (
                  <div className="space-y-2">
                    <div className="w-full bg-slate-600/50 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${transcodingProgress.progress || 0}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="truncate">{transcodingProgress.progress || 0}% Complete</span>
                      {transcodingProgress.eta && (
                        <span className="flex-shrink-0">ETA: {transcodingProgress.eta}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue List */}
      {queueLength > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 overflow-hidden">
          <h4 className="text-white font-semibold mb-3 flex items-center space-x-2">
            <span>📋 Queued Files</span>
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full flex-shrink-0">
              {queueLength} pending
            </span>
          </h4>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {queueStatus?.queue?.map((job, index) => (
              <div key={job.id || index} className="flex items-center justify-between p-2 bg-slate-700/20 rounded border border-slate-600/30 overflow-hidden">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <span className="text-slate-400 text-xs flex-shrink-0">#{index + 1}</span>
                  <span className="text-white text-sm truncate">
                    {job.inputPath ? job.inputPath.split('/').pop() : 'Unknown File'}
                  </span>
                </div>
                <span className="text-slate-400 text-xs flex-shrink-0">
                  {job.qualities?.join(', ') || 'Unknown Quality'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compression Statistics */}
      {compressionStats && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 overflow-hidden">
          <h4 className="text-white font-semibold mb-3 flex items-center space-x-2">
            <span>📊 Compression Statistics</span>
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full flex-shrink-0">
              This Session
            </span>
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-slate-400 text-xs">Files Processed</p>
              <p className="text-white font-semibold text-lg">{compressionStats.filesProcessed || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs">Original Size</p>
              <p className="text-white font-semibold text-lg truncate">{formatFileSize(compressionStats.totalOriginalSize || 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs">Compressed Size</p>
              <p className="text-white font-semibold text-lg truncate">{formatFileSize(compressionStats.totalCompressedSize || 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs">Space Saved</p>
              <p className="text-green-400 font-semibold text-lg truncate">{formatFileSize(compressionStats.spaceSaved || 0)}</p>
            </div>
          </div>
          
          {compressionStats.filesProcessed > 0 && (
            <div className="mt-3 p-3 bg-green-900/20 border border-green-700/30 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-green-400 text-sm font-medium truncate">
                  Average Compression: {Math.round(((compressionStats.totalOriginalSize - compressionStats.totalCompressedSize) / compressionStats.totalOriginalSize) * 100)}%
                </span>
                <span className="text-green-300 text-xs flex-shrink-0">
                  {formatFileSize(compressionStats.spaceSaved || 0)} saved
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isProcessing && queueLength === 0 && activeJobCount === 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center overflow-hidden">
          <div className="w-12 h-12 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🎬</span>
          </div>
          <h4 className="text-white font-semibold text-lg mb-2">No Active Transcoding</h4>
          <p className="text-slate-400 text-sm mb-4">
            The transcoding queue is currently empty. Files will appear here when added to the queue.
          </p>
          <div className="flex items-center justify-center space-x-2 text-xs text-slate-500">
            <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
            <span>Ready to process new files</span>
            <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscodingProgressTracker; 