import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useQuery } from '@tanstack/react-query';
import { formatFileSize, formatDuration } from '../utils/formatters';

const EnhancedProgressTracker = () => {
  const { isConnected, transcodingProgress } = useSocket();
  const [expandedJobs, setExpandedJobs] = useState(new Set());
  const [selectedJob, setSelectedJob] = useState(null);

  // Fetch detailed job progress
  const { data: jobProgress, isLoading } = useQuery({
    queryKey: ['job-progress'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/transcoding-v2/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch job progress');
      return response.json();
    },
    refetchInterval: 2000 // Refresh every 2 seconds for real-time updates
  });

  const toggleJobExpansion = (jobId) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  };

  const getProgressColor = (progress) => {
    if (progress >= 90) return 'bg-green-500';
    if (progress >= 70) return 'bg-blue-500';
    if (progress >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return '✅';
      case 'processing': return '🔄';
      case 'queued': return '⏳';
      case 'failed': return '❌';
      case 'paused': return '⏸️';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'text-green-400';
      case 'processing': return 'text-blue-400';
      case 'queued': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      case 'paused': return 'text-orange-400';
      default: return 'text-slate-400';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-center space-x-2">
          <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-slate-400">Loading job progress...</span>
        </div>
      </div>
    );
  }

  const activeJobs = jobProgress?.activeJobs || [];
  const queuedJobs = jobProgress?.queuedJobs || [];
  const completedJobs = jobProgress?.completedJobs || [];

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-white font-medium">
              {isConnected ? 'Connected to Transcoding Service' : 'Disconnected from Transcoding Service'}
            </span>
          </div>
          <div className="text-sm text-slate-400">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <span>🚀 Active Jobs ({activeJobs.length})</span>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          </h3>
          <div className="space-y-4">
            {activeJobs.map((job, index) => (
              <div key={job.id || index} className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <span className="text-lg">{getStatusIcon(job.status)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {job.inputPath?.split('/').pop() || 'Unknown File'}
                      </p>
                      <p className="text-slate-400 text-sm">
                        Quality: {job.qualities?.join(', ') || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${getStatusColor(job.status)}`}>
                      {job.progress || 0}%
                    </p>
                    <p className="text-slate-500 text-sm capitalize">
                      {job.status || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-600 rounded-full h-3 mb-3">
                  <div 
                    className={`${getProgressColor(job.progress || 0)} h-3 rounded-full transition-all duration-300 relative`}
                    style={{ width: `${Math.min(job.progress || 0, 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                  </div>
                </div>

                {/* Job Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">Started:</span>
                    <p className="text-white">
                      {job.startedAt ? new Date(job.startedAt).toLocaleString() : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">ETA:</span>
                    <p className="text-green-400">
                      {job.eta || 'Calculating...'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Speed:</span>
                    <p className="text-blue-400">
                      {job.speed || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Priority:</span>
                    <p className="text-purple-400">
                      {job.priority === 1 ? 'High' : 'Normal'}
                    </p>
                  </div>
                </div>

                {/* Real-time Progress Updates */}
                {transcodingProgress && transcodingProgress.jobId === job.id && (
                  <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-blue-400">📡</span>
                      <span className="text-blue-300 font-medium">Real-time Update</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-slate-400">Current Frame:</span>
                        <p className="text-white">{transcodingProgress.currentFrame || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">FPS:</span>
                        <p className="text-white">{transcodingProgress.fps || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Bitrate:</span>
                        <p className="text-white">{transcodingProgress.bitrate || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queued Jobs */}
      {queuedJobs.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <span>⏳ Queued Jobs ({queuedJobs.length})</span>
          </h3>
          <div className="space-y-3">
            {queuedJobs.map((job, index) => (
              <div key={job.id || index} className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <span className="text-lg">{getStatusIcon(job.status)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {job.inputPath?.split('/').pop() || 'Unknown File'}
                      </p>
                      <p className="text-slate-400 text-sm">
                        Quality: {job.qualities?.join(', ') || 'Unknown'} | 
                        Priority: {job.priority === 1 ? 'High' : 'Normal'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-sm">
                      Queued: {job.addedAt ? new Date(job.addedAt).toLocaleString() : 'Unknown'}
                    </p>
                    <p className="text-slate-500 text-sm">
                      Position: #{index + 1}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Jobs (Recent) */}
      {completedJobs.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            ✅ Recently Completed ({completedJobs.length})
          </h3>
          <div className="space-y-3">
            {completedJobs.slice(0, 5).map((job, index) => (
              <div key={job.id || index} className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <span className="text-lg">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {job.inputPath?.split('/').pop() || 'Unknown File'}
                      </p>
                      <p className="text-slate-400 text-sm">
                        Quality: {job.qualities?.join(', ') || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 text-sm">
                      {job.completedAt ? new Date(job.completedAt).toLocaleString() : 'Unknown'}
                    </p>
                    {job.processingTime && (
                      <p className="text-slate-500 text-sm">
                        {formatDuration(job.processingTime)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Jobs State */}
      {activeJobs.length === 0 && queuedJobs.length === 0 && completedJobs.length === 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">🎬</div>
          <h3 className="text-lg font-semibold text-white mb-2">No Transcoding Jobs</h3>
          <p className="text-slate-400">
            No active, queued, or recent transcoding jobs found. 
            Start transcoding files to see progress here.
          </p>
        </div>
      )}

      {/* Performance Summary */}
      {jobProgress && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">📊 Performance Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{activeJobs.length}</p>
              <p className="text-slate-400 text-sm">Active Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{queuedJobs.length}</p>
              <p className="text-slate-400 text-sm">Queued Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{completedJobs.length}</p>
              <p className="text-slate-400 text-sm">Completed Today</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">
                {jobProgress.successRate || 0}%
              </p>
              <p className="text-slate-400 text-sm">Success Rate</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedProgressTracker; 