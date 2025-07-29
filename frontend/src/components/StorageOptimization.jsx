import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../hooks/useSocket';
import { formatFileSize } from '../utils/formatters';
import TranscodingProgressBar from './TranscodingProgressBar';

// Helper function to get filename from path
const getFileName = (filePath) => {
  if (!filePath) return 'Unknown file';
  return filePath.split(/[\\/]/).pop() || filePath;
};

const StorageOptimization = () => {
  const [activeTab, setActiveTab] = useState('analytics');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [optimizationSettings, setOptimizationSettings] = useState({
    qualities: ['1080p', '720p'],
    deleteOriginals: false,
    minFileSize: 500,
    // Enhanced transcoding options
    codec: 'h265',
    preset: 'balanced',
    crf: 23,
    audioCodec: 'aac',
    audioBitrate: 128,
    enableHardwareAcceleration: true,
    enableTwoPass: false,
    enableDeinterlace: false,
    enableSubtitleBurn: false,
    enableMetadataCopy: true,
    enableThumbnailGeneration: true,
    maxConcurrentJobs: 2,
    priorityLevel: 'normal'
  });

  // Preset configurations
  const transcodingPresets = {
    ultra_quality: {
      name: 'Ultra Quality',
      description: 'Maximum quality, larger file sizes',
      codec: 'h265',
      preset: 'slow',
      crf: 18,
      audioBitrate: 192,
      enableTwoPass: true,
      enableHardwareAcceleration: true
    },
    balanced: {
      name: 'Balanced',
      description: 'Good quality with reasonable file sizes',
      codec: 'h265',
      preset: 'medium',
      crf: 23,
      audioBitrate: 128,
      enableTwoPass: false,
      enableHardwareAcceleration: true
    },
    space_saver: {
      name: 'Space Saver',
      description: 'Smaller files, acceptable quality',
      codec: 'h265',
      preset: 'fast',
      crf: 28,
      audioBitrate: 96,
      enableTwoPass: false,
      enableHardwareAcceleration: true
    },
    web_optimized: {
      name: 'Web Optimized',
      description: 'Optimized for streaming and web playback',
      codec: 'h264',
      preset: 'fast',
      crf: 25,
      audioBitrate: 128,
      enableTwoPass: false,
      enableHardwareAcceleration: true
    },
    archive: {
      name: 'Archive',
      description: 'Maximum compression for long-term storage',
      codec: 'h265',
      preset: 'veryslow',
      crf: 30,
      audioBitrate: 64,
      enableTwoPass: true,
      enableHardwareAcceleration: true
    }
  };

  // Quality presets with detailed settings
  const qualityPresets = {
    '1080p': {
      resolution: '1920x1080',
      bitrate: '8000k',
      audioBitrate: 192,
      crf: 20
    },
    '720p': {
      resolution: '1280x720',
      bitrate: '4000k',
      audioBitrate: 128,
      crf: 22
    },
    '480p': {
      resolution: '854x480',
      bitrate: '2000k',
      audioBitrate: 96,
      crf: 25
    },
    '360p': {
      resolution: '640x360',
      bitrate: '1000k',
      audioBitrate: 64,
      crf: 28
    }
  };

  // Apply preset configuration
  const applyPreset = (presetName) => {
    const preset = transcodingPresets[presetName];
    if (preset) {
      setOptimizationSettings(prev => ({
        ...prev,
        ...preset,
        preset: presetName
      }));
    }
  };

  // Update individual quality settings
  const updateQualitySettings = (quality, field, value) => {
    setOptimizationSettings(prev => ({
      ...prev,
      qualitySettings: {
        ...prev.qualitySettings,
        [quality]: {
          ...prev.qualitySettings?.[quality],
          [field]: value
        }
      }
    }));
  };

  const [systemSettings, setSystemSettings] = useState({ autoTranscodingEnabled: false });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState(null);

  const queryClient = useQueryClient();
  
  // Socket.IO connection for real-time updates
  const { isConnected, transcodingProgress } = useSocket();
  
  // Show connection status for debugging
  useEffect(() => {
    console.log(`🔌 Socket.IO connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
  }, [isConnected]);

  // Fetch storage analytics
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['storage-analytics'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/analytics', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch transcoding status
  const { data: transcodingStatus, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['transcoding-status'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/transcoding/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    refetchInterval: 5000 // Refresh every 5 seconds when transcoding
  });

  // Fetch recommendations
  const { data: recommendations, error: recommendationsError } = useQuery({
    queryKey: ['storage-recommendations'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/recommendations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      return response.json();
    }
  });

  // Auto-optimize mutation
  const autoOptimizeMutation = useMutation({
    mutationFn: async (settings) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/optimize', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Failed to start optimization');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['transcoding-status']);
      queryClient.invalidateQueries(['storage-analytics']);
      
      // Show detailed success message
      if (data.jobs && data.jobs.length > 0) {
        console.log(`✅ Auto-optimize: Added ${data.jobs.length} files to queue`);
        if (data.skippedAlreadyTranscoded > 0) {
          console.log(`⏭️ Skipped ${data.skippedAlreadyTranscoded} already transcoded files`);
        }
      } else if (data.alreadyTranscodedCount > 0) {
        console.log(`✅ Auto-optimize: No new files to process. ${data.alreadyTranscodedCount} files already transcoded.`);
      } else {
        console.log('✅ Auto-optimize: No files found that meet optimization criteria');
      }
    }
  });

  // Bulk transcode mutation
  const bulkTranscodeMutation = useMutation({
    mutationFn: async ({ filesWithSettings }) => {
      console.log('🔍 bulkTranscodeMutation.mutationFn called with:', { filesWithSettings });
      const token = sessionStorage.getItem('token');
      console.log('   Token exists:', !!token);
      const response = await fetch('/api/storage/transcoding/bulk-add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filesWithSettings })
      });
      console.log('   Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('   Response error:', errorText);
        throw new Error(`Failed to add files to queue: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      console.log('   Response data:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('✅ bulkTranscodeMutation.onSuccess:', data);
      if (data.errors && data.errors.length > 0) {
        console.log('❌ Backend errors:', data.errors);
        data.errors.forEach(error => {
          console.log(`   File: ${error.file}, Error: ${error.error}`);
        });
      }
      if (data.jobs && data.jobs.length > 0) {
        console.log('✅ Successfully added jobs:', data.jobs);
      }
      setSelectedFiles([]);
      queryClient.invalidateQueries(['transcoding-status']);
    },
    onError: (error) => {
      console.error('❌ Bulk transcode error:', error);
    }
  });

  // Remove job from queue mutation
  const removeJobMutation = useMutation({
    mutationFn: async (jobId) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/storage/transcoding/remove/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to remove job');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['transcoding-status']);
    }
  });

  // Clear queue mutation
  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/transcoding/clear', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to clear queue');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['transcoding-status']);
    }
  });

  // Stop all jobs mutation
  const stopAllJobsMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/transcoding/stop-all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to stop all jobs');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['transcoding-status']);
      console.log(`🛑 Stopped ${data.stoppedActiveJobs} active jobs and cleared ${data.clearedQueuedJobs} queued jobs`);
    }
  });

  // Cleanup corrupted files mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/cleanup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to cleanup files');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['storage-analytics']);
      queryClient.invalidateQueries(['transcoding-status']);
      console.log(`✅ Cleanup completed: ${data.message}`);
    }
  });

  // Force cleanup mutation for 0-byte files
  const forceCleanupMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/cleanup/force', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to force cleanup files');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['storage-analytics']);
      queryClient.invalidateQueries(['transcoding-status']);
      console.log(`✅ Force cleanup completed: ${data.message}`);
    }
  });

  // Refresh analytics mutation
  const refreshAnalyticsMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/storage/analytics/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to refresh analytics');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['storage-analytics']);
      queryClient.invalidateQueries(['transcoding-status']);
      queryClient.invalidateQueries(['storage-recommendations']);
      console.log(`✅ Analytics refreshed: ${data.message}`);
    }
  });

  // Fetch system settings on mount
  useEffect(() => {
    async function fetchSettings() {
      setSettingsLoading(true);
      setSettingsError(null);
      try {
        const token = sessionStorage.getItem('token');
        const res = await fetch('/api/storage/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.settings) {
          setSystemSettings(data.settings);
        }
      } catch (e) {
        setSettingsError('Failed to load system settings');
      } finally {
        setSettingsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  // Update system settings
  const updateSystemSetting = async (key, value) => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/storage/settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ [key]: value })
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setSystemSettings(data.settings);
      }
    } catch (e) {
      setSettingsError('Failed to update system settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleAutoOptimize = () => {
    autoOptimizeMutation.mutate({
      minFileSize: optimizationSettings.minFileSize * 1024 * 1024, // Convert MB to bytes
      qualities: optimizationSettings.qualities,
      deleteOriginals: optimizationSettings.deleteOriginals,
      maxFiles: 10
    });
  };

  const handleBulkTranscode = (customSettings = null) => {
    if (selectedFiles.length === 0) return;
    
    const settings = customSettings || optimizationSettings;
    
    console.log('🔍 Debug - handleBulkTranscode called with:', {
      selectedFiles,
      settings,
      customSettings: !!customSettings
    });
    
    bulkTranscodeMutation.mutate({
      filesWithSettings: selectedFiles.map(filename => ({
        file: filename,
        settings: fileSettings[filename] || settings
      }))
    });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCompressionColor = (ratio) => {
    const numRatio = parseFloat(ratio);
    if (numRatio >= 40) return 'text-green-400';
    if (numRatio >= 20) return 'text-yellow-400';
    return 'text-red-400';
  };

  const [fileSettings, setFileSettings] = useState({});
  const [settingsModalFile, setSettingsModalFile] = useState(null);

  if (analyticsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4 text-white">Loading storage analytics...</span>
      </div>
    );
  }

  // Show error state if there are authentication or other errors
  if (analyticsError || statusError || recommendationsError) {
    return (
      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-bold text-red-400 mb-4">⚠️ Storage Optimization Error</h3>
        <p className="text-red-300 mb-4 text-sm sm:text-base">
          {analyticsError?.message || statusError?.message || recommendationsError?.message || 'Failed to load storage data'}
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn-modern bg-red-600 hover:bg-red-700 text-white text-sm sm:text-base"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">💾 Storage Optimization</h1>
        
        {/* Connection Status and Transcoding Progress - Mobile Optimized */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          {/* Transcoding Progress Indicator */}
          {transcodingProgress && (
            <div className="flex items-center space-x-2 text-sm bg-blue-500/20 px-3 py-1 rounded-lg border border-blue-500/30">
              <span className="text-blue-400">🎬</span>
              <span className="text-blue-300 font-medium">{transcodingProgress.progress}%</span>
              <span className="text-blue-400 text-xs hidden sm:inline">Transcoding</span>
            </div>
          )}
          
          {/* Connection Status */}
          <div className="flex items-center space-x-2 text-sm">
            <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
            <span className="text-gray-400">
              {isConnected ? 'Live Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation - Mobile Optimized */}
      <div className="flex space-x-1 bg-gray-800/50 p-1 rounded-lg overflow-x-auto">
        {[
          { id: 'analytics', label: '📊 Overview', shortLabel: '📊' },
          { id: 'optimize', label: '🚀 Optimize', shortLabel: '🚀' },
          { id: 'maintenance', label: '🔧 Maintenance', shortLabel: '🔧' },
          { id: 'settings', label: '⚙️ Settings', shortLabel: '⚙️' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-2 sm:px-4 py-2 rounded-md transition-colors text-xs sm:text-sm whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        <div className="space-y-4 sm:space-y-6">
          {analytics?.analytics ? (
            <>
              {/* Storage Overview - Mobile Optimized Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-blue-500/20 rounded-lg p-4 sm:p-6 border border-blue-500/30">
                  <h4 className="font-semibold text-blue-400 mb-2 text-sm sm:text-base">📁 Original Files</h4>
                  <div className="text-xl sm:text-2xl font-bold text-white">{analytics.analytics.original?.formattedTotalSize || '0 GB'}</div>
                  <div className="text-xs sm:text-sm text-gray-400">{analytics.analytics.original?.totalFiles || 0} files</div>
                </div>
                <div className="bg-green-500/20 rounded-lg p-4 sm:p-6 border border-green-500/30">
                  <h4 className="font-semibold text-green-400 mb-2 text-sm sm:text-base">🗜️ Compressed Files</h4>
                  <div className="text-xl sm:text-2xl font-bold text-white">{analytics.analytics.transcoded?.formattedTotalSize || '0 GB'}</div>
                  <div className="text-xs sm:text-sm text-gray-400">{analytics.analytics.transcoded?.totalFiles || 0} files</div>
                </div>
                <div className="bg-purple-500/20 rounded-lg p-4 sm:p-6 border border-purple-500/30 sm:col-span-2 lg:col-span-1">
                  <h4 className="font-semibold text-purple-400 mb-2 text-sm sm:text-base">💾 Space Saved</h4>
                  <div className="text-xl sm:text-2xl font-bold text-white">{analytics.analytics.compression?.formattedStats?.spaceSaved || '0 GB'}</div>
                  <div className={`text-xs sm:text-sm ${getCompressionColor(analytics.analytics.compression?.compressionRatio)}`}>
                    {analytics.analytics.compression?.compressionRatio || '0%'} compression
                  </div>
                </div>
              </div>

              {/* Potential Savings - Mobile Optimized */}
              {(analytics.analytics.potentialSavings?.breakdown?.transcoding?.candidateCount > 0 || 
                analytics.analytics.potentialSavings?.breakdown?.duplicates?.duplicateCount > 0 ||
                analytics.analytics.potentialSavings?.candidateCount > 0) && (
                <div className="bg-yellow-500/20 rounded-lg p-4 sm:p-6 border border-yellow-500/30">
                  <h4 className="font-semibold text-yellow-400 mb-4 text-sm sm:text-base">⚡ Optimization Opportunities</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-lg font-bold text-white">
                        {(analytics.analytics.potentialSavings?.breakdown?.transcoding?.candidateCount || 0) + 
                         (analytics.analytics.potentialSavings?.breakdown?.duplicates?.duplicateCount || 0) ||
                         (analytics.analytics.potentialSavings?.candidateCount || 0)} files
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400">
                        {analytics.analytics.potentialSavings?.breakdown?.transcoding?.candidateCount > 0 && 
                         analytics.analytics.potentialSavings?.breakdown?.duplicates?.duplicateCount > 0 
                          ? "Compression + duplicates" 
                          : analytics.analytics.potentialSavings?.breakdown?.transcoding?.candidateCount > 0 
                            ? "Could be compressed" 
                            : analytics.analytics.potentialSavings?.breakdown?.duplicates?.duplicateCount > 0
                              ? "Duplicate files"
                              : "Could be optimized"}
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">{analytics.analytics.potentialSavings.formatted}</div>
                      <div className="text-xs sm:text-sm text-gray-400">Total estimated savings</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('optimize')}
                    className="mt-4 w-full sm:w-auto btn-modern bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-sm sm:text-base"
                  >
                    🚀 Go to Optimization
                  </button>
                </div>
              )}

              {/* Recommendations - Mobile Optimized */}
              {recommendations?.recommendations && recommendations.recommendations.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
                  <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">💡 Recommendations</h4>
                  <div className="space-y-3 sm:space-y-4">
                    {recommendations.recommendations.map((rec, index) => (
                      <div key={index} className={`p-3 sm:p-4 rounded-lg border ${
                        rec.priority === 'high' ? 'bg-red-500/20 border-red-500/30' :
                        rec.priority === 'medium' ? 'bg-yellow-500/20 border-yellow-500/30' :
                        'bg-blue-500/20 border-blue-500/30'
                      }`}>
                        <h5 className="font-semibold text-white text-sm sm:text-base">{rec.title}</h5>
                        <p className="text-gray-300 text-xs sm:text-sm mt-1">{rec.description}</p>
                        <p className="text-gray-400 text-xs mt-1">{rec.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6 text-center">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-4">📊 Storage Analytics</h3>
              <p className="text-gray-400 text-sm sm:text-base">No storage data available yet. Upload some media files to see analytics.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'optimize' && (
        <div className="space-y-4 sm:space-y-6 overflow-hidden">
          {/* Debug Info */}
          {console.log('Transcoding tab active, analytics:', analytics)}
          
          {/* Real-time Progress Bar */}
          {transcodingProgress && (
            <TranscodingProgressBar progressData={transcodingProgress} />
          )}

          {/* Enhanced Original Media Selection Menu */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-xl p-6 sm:p-8 border border-gray-700/50 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-xl">🎬</span>
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg sm:text-xl">Original Media Selection</h4>
                  <p className="text-gray-400 text-sm">Select files for transcoding optimization</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                {analytics?.analytics?.original?.files ? (
                  <>
                    <div className="flex items-center space-x-2 bg-blue-500/20 px-3 py-2 rounded-lg border border-blue-500/30">
                      <span className="text-blue-400">📁</span>
                      <span className="text-blue-300 font-medium">{analytics.analytics.original.files.length} files</span>
                    </div>
                    <div className="flex items-center space-x-2 bg-green-500/20 px-3 py-2 rounded-lg border border-green-500/30">
                      <span className="text-green-400">💾</span>
                      <span className="text-green-300 font-medium">{formatBytes(analytics.analytics.original.totalSize)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center space-x-2 bg-yellow-500/20 px-3 py-2 rounded-lg border border-yellow-500/30">
                    <span className="text-yellow-400">⏳</span>
                    <span className="text-yellow-300 font-medium">Loading files...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Debug Info and Refresh Button */}
            <div className="mb-4 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
              <div className="flex justify-between items-center">
                <span>
                  Debug: analytics exists: {analytics ? 'Yes' : 'No'} | 
                  original files: {analytics?.analytics?.original?.files ? analytics.analytics.original.files.length : 'No data'}
                </span>
                <button
                  onClick={() => refreshAnalyticsMutation.mutate()}
                  disabled={refreshAnalyticsMutation.isLoading}
                  className="text-xs px-2 py-1 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded hover:bg-blue-600/30 transition-colors"
                >
                  {refreshAnalyticsMutation.isLoading ? '🔄 Refreshing...' : '🔄 Refresh'}
                </button>
              </div>
            </div>

            {analytics?.analytics?.original?.files && analytics.analytics.original.files.length > 0 ? (
              <>
                            {/* Filter and Search Controls */}
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                    <span className="text-blue-400">🔍</span>
                    <span>Search Files</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by filename..."
                      className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 backdrop-blur-sm"
                      onChange={(e) => {
                        const searchTerm = e.target.value.toLowerCase();
                        // Filter logic will be implemented
                      }}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-gray-400 text-sm">⌨️</span>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                    <span className="text-purple-400">📺</span>
                    <span>Filter by Codec</span>
                  </label>
                  <select className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 backdrop-blur-sm appearance-none">
                    <option value="">All Codecs</option>
                    <option value="h264">H.264</option>
                    <option value="h265">H.265</option>
                    <option value="mpeg4">MPEG-4</option>
                    <option value="avi">AVI</option>
                    <option value="mkv">MKV</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="text-gray-400">▼</span>
                  </div>
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                    <span className="text-green-400">📏</span>
                    <span>Filter by Size</span>
                  </label>
                  <select className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 backdrop-blur-sm appearance-none">
                    <option value="">All Sizes</option>
                    <option value="small">Small (&lt; 500MB)</option>
                    <option value="medium">Medium (500MB - 2GB)</option>
                    <option value="large">Large (&gt; 2GB)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="text-gray-400">▼</span>
                  </div>
                </div>
              </div>

                                  {/* Quick Selection Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={() => {
                      const largeFiles = analytics.analytics.original.files.filter(f => f.size > 2 * 1024 * 1024 * 1024);
                      setSelectedFiles(largeFiles.map(f => getFileName(f.path)));
                    }}
                    className="group relative p-4 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl hover:from-blue-500/30 hover:to-blue-600/30 transition-all duration-200 hover:scale-105 hover:shadow-lg"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <span className="text-2xl">🐘</span>
                      <span className="text-blue-300 font-medium text-sm text-center">Large Files</span>
                      <span className="text-blue-400 text-xs text-center">&gt;2GB</span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const h264Files = analytics.analytics.original.files.filter(f => 
                        f.codec && f.codec.toLowerCase().includes('h264')
                      );
                      setSelectedFiles(h264Files.map(f => getFileName(f.path)));
                    }}
                    className="group relative p-4 bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 rounded-xl hover:from-green-500/30 hover:to-green-600/30 transition-all duration-200 hover:scale-105 hover:shadow-lg"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <span className="text-2xl">🎬</span>
                      <span className="text-green-300 font-medium text-sm text-center">H.264 Files</span>
                      <span className="text-green-400 text-xs text-center">Convert to H.265</span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const oldFiles = analytics.analytics.original.files.filter(f => 
                        f.modifiedAt && new Date(f.modifiedAt) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                      );
                      setSelectedFiles(oldFiles.map(f => getFileName(f.path)));
                    }}
                    className="group relative p-4 bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-xl hover:from-yellow-500/30 hover:to-yellow-600/30 transition-all duration-200 hover:scale-105 hover:shadow-lg"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <span className="text-2xl">📅</span>
                      <span className="text-yellow-300 font-medium text-sm text-center">Old Files</span>
                      <span className="text-yellow-400 text-xs text-center">&gt;30 days</span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const uncompressedFiles = analytics.analytics.original.files.filter(f => 
                        f.codec && !f.codec.toLowerCase().includes('h265') && !f.codec.toLowerCase().includes('h264')
                      );
                      setSelectedFiles(uncompressedFiles.map(f => getFileName(f.path)));
                    }}
                    className="group relative p-4 bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl hover:from-purple-500/30 hover:to-purple-600/30 transition-all duration-200 hover:scale-105 hover:shadow-lg"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <span className="text-2xl">🗜️</span>
                      <span className="text-purple-300 font-medium text-sm text-center">Uncompressed</span>
                      <span className="text-purple-400 text-xs text-center">Needs compression</span>
                    </div>
                  </button>
                </div>
                </div>

                              {/* File List with Enhanced Details */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {analytics.analytics.original.files.map((file, index) => (
                  <div key={index} className="group relative bg-gradient-to-r from-gray-700/30 to-gray-800/30 border border-gray-600/30 rounded-lg p-3 hover:from-gray-700/50 hover:to-gray-800/50 hover:border-gray-500/50 transition-all duration-200 hover:shadow-lg">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(getFileName(file.path))}
                          onChange={(e) => {
                            const filename = getFileName(file.path);
                            if (e.target.checked) {
                              setSelectedFiles(prev => [...prev, filename]);
                            } else {
                              setSelectedFiles(prev => prev.filter(f => f !== filename));
                            }
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-2 border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-800 transition-all duration-200"
                        />
                        {selectedFiles.includes(getFileName(file.path)) && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-blue-400 text-xs">✓</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center space-x-2 min-w-0 flex-1">
                            <div className="w-6 h-6 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-400 text-xs">🎬</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                                {getFileName(file.path)}
                              </div>
                              <div className="text-xs text-gray-400 truncate">
                                📁 {file.path.split('/').slice(-2).join('/')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                            {fileSettings[file.path] && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFileSettings(prev => {
                                    const updated = { ...prev };
                                    delete updated[file.path];
                                    return updated;
                                  });
                                }}
                                className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs font-medium border border-red-500/30 hover:bg-red-500/30 transition-colors"
                                title="Remove custom settings"
                              >
                                ⚙️ Unapply
                              </button>
                            )}
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              file.size > 2 * 1024 * 1024 * 1024 ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                              file.size > 500 * 1024 * 1024 ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                              'bg-green-500/20 text-green-300 border border-green-500/30'
                            }`}>
                              {formatBytes(file.size)}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-medium border border-blue-500/30">
                              {file.codec || 'Unknown'}
                            </span>
                            <button
                              onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSettingsModalFile(file.path);
                              }}
                              className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-medium border border-blue-500/30 hover:bg-blue-500/30 transition-colors ml-1"
                              title="Show active settings"
                            >
                              ℹ️
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-gray-400">
                          {file.duration && (
                            <div className="flex items-center space-x-1">
                              <span className="text-purple-400">⏱️</span>
                              <span>{Math.round(file.duration / 60)}min</span>
                            </div>
                          )}
                          {file.resolution && (
                            <div className="flex items-center space-x-1">
                              <span className="text-green-400">📺</span>
                              <span>{file.resolution}</span>
                            </div>
                          )}
                          {file.modifiedAt && (
                            <div className="flex items-center space-x-1">
                              <span className="text-yellow-400">📅</span>
                              <span>{new Date(file.modifiedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                        {fileSettings[file.path] && (
                          <div className="text-xs text-green-400 font-bold mt-1">Custom Settings Applied</div>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>

                            {/* Selection Summary and Actions */}
            <div className="mt-6 p-6 bg-gradient-to-r from-gray-700/30 to-gray-800/30 border border-gray-600/30 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <span className="text-blue-400 text-sm">📊</span>
                    </div>
                    <div>
                      <div className="text-sm text-gray-300">
                        <span className="font-bold text-white text-lg">{selectedFiles.length}</span> of {analytics.analytics.original.files.length} files selected
                      </div>
                      {selectedFiles.length > 0 && (
                        <div className="text-xs text-gray-400">
                          Total size: <span className="text-blue-300 font-medium">{formatBytes(selectedFiles.reduce((total, path) => {
                            const file = analytics.analytics.original.files.find(f => f.path === path);
                            return total + (file?.size || 0);
                          }, 0))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedFiles(analytics.analytics.original.files.map(f => getFileName(f.path)))}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 text-blue-300 rounded-lg hover:from-blue-500/30 hover:to-blue-600/30 transition-all duration-200 text-sm font-medium"
                  >
                    ✅ Select All
                  </button>
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="px-4 py-2 bg-gradient-to-r from-gray-500/20 to-gray-600/20 border border-gray-500/30 text-gray-300 rounded-lg hover:from-gray-500/30 hover:to-gray-600/30 transition-all duration-200 text-sm font-medium"
                  >
                    🗑️ Clear All
                  </button>
                  <button
                    onClick={() => {
                      const unselected = analytics.analytics.original.files
                        .map(f => getFileName(f.path))
                        .filter(filename => !selectedFiles.includes(filename));
                      setSelectedFiles(unselected);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500/20 to-orange-600/20 border border-orange-500/30 text-orange-300 rounded-lg hover:from-orange-500/30 hover:to-orange-600/30 transition-all duration-200 text-sm font-medium"
                  >
                    🔄 Invert Selection
                  </button>
                </div>
              </div>
              
              {/* Estimated Savings */}
              {selectedFiles.length > 0 && (
                <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm">💡</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-blue-300">
                        Estimated savings after transcoding
                      </div>
                      <div className="text-lg font-bold text-white">
                        ~{Math.round(selectedFiles.reduce((total, path) => {
                          const file = analytics.analytics.original.files.find(f => f.path === path);
                          return total + (file?.size || 0) * 0.4; // Assume 40% compression
                        }, 0) / (1024 * 1024 * 1024) * 10) / 10}GB
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

                              {/* Transcode Action Buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => {
                    console.log('🎬 Transcode Selected clicked');
                    console.log('   selectedFiles:', selectedFiles);
                    console.log('   fileSettings:', fileSettings);
                    if (selectedFiles.length === 0) {
                      console.log('   No files selected, returning');
                      return;
                    }
                    const filesWithSettings = selectedFiles.map(filename => ({
                      file: filename,
                      settings: fileSettings[filename] || optimizationSettings
                    }));
                    console.log('🚀 Transcode Selected clicked, sending:', filesWithSettings);
                    bulkTranscodeMutation.mutate({ filesWithSettings });
                  }}
                  disabled={selectedFiles.length === 0 || bulkTranscodeMutation.isLoading}
                  className="group relative px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed text-base font-bold rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-2xl disabled:hover:scale-100 disabled:hover:shadow-none"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🎬</span>
                    <span>{bulkTranscodeMutation.isLoading ? '🔄 Adding to Queue...' : `Transcode Selected (${selectedFiles.length})`}</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                </button>
                
                {/* Progress Display Box */}
                {transcodingProgress ? (
                  <div className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white text-base font-bold rounded-xl">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">📊</span>
                      <span>Progress: {Math.round(transcodingProgress.progress || 0)}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-3 bg-gray-600 text-gray-300 text-base font-bold rounded-xl">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">📊</span>
                      <span>No Active Jobs</span>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => {
                    console.log('🔧 Apply from Settings clicked');
                    console.log('   selectedFiles:', selectedFiles);
                    console.log('   optimizationSettings:', optimizationSettings);
                    if (selectedFiles.length === 0) {
                      console.log('   No files selected, returning');
                      return;
                    }
                    setFileSettings(prev => {
                      const updated = { ...prev };
                      selectedFiles.forEach(filename => {
                        updated[filename] = { ...optimizationSettings };
                      });
                      console.log('   Updated fileSettings:', updated);
                      return updated;
                    });
                    console.log('   Settings applied successfully');
                  }}
                  disabled={selectedFiles.length === 0}
                  className="group relative px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed text-base font-bold rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-2xl disabled:hover:scale-100 disabled:hover:shadow-none"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">⚙️</span>
                    <span>Apply from Settings</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                </button>
              </div>
              </>
            ) : (
              <div className="text-center p-4">
                <p className="text-gray-400 text-sm sm:text-base">No original media files found. Upload some media files to see them here.</p>
              </div>
            )}
          </div>

          {transcodingStatus?.queue ? (
            <>
              {/* Active Jobs - Mobile Optimized */}
              {transcodingStatus.queue.activeJobs && transcodingStatus.queue.activeJobs.length > 0 && (
                <div className="bg-blue-500/20 rounded-lg p-4 sm:p-6 border border-blue-500/30 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 className="font-semibold text-blue-400 text-sm sm:text-base">🚀 Active Jobs ({transcodingStatus.queue.activeJobs.length})</h4>
                    <button
                      onClick={() => stopAllJobsMutation.mutate()}
                      disabled={stopAllJobsMutation.isLoading}
                      className="btn-modern bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm px-3 py-1 w-full sm:w-auto"
                    >
                      {stopAllJobsMutation.isLoading ? '🔄' : '🛑'} Stop All Jobs
                    </button>
                  </div>
                  <div className="space-y-3 sm:space-y-4 overflow-hidden">
                    {transcodingStatus.queue.activeJobs.map((job, index) => (
                      <div key={job.id || index} className="bg-blue-500/20 rounded-lg p-3 sm:p-4 border border-blue-500/30 overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-white text-sm sm:text-base truncate block">
                              {getFileName(job.inputPath) || `Job ${job.id}`}
                            </span>
                          </div>
                          <span className="text-blue-400 text-xs sm:text-sm flex-shrink-0">{job.status || 'Processing'}</span>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400 mb-2">
                          Started: {job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : 'Just now'}
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300 animate-pulse" 
                            style={{ width: '100%' }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next in Queue - Mobile Optimized */}
              {transcodingStatus.queue.nextInQueue && (
                <div className="bg-orange-500/20 rounded-lg p-4 sm:p-6 border border-orange-500/30">
                  <h4 className="font-semibold text-orange-400 mb-2 text-sm sm:text-base">⏳ Next in Queue</h4>
                  <div className="font-medium text-white text-sm sm:text-base truncate">
                    {getFileName(transcodingStatus.queue.nextInQueue.inputPath)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-400">
                    Added: {transcodingStatus.queue.nextInQueue.addedAt ? 
                      new Date(transcodingStatus.queue.nextInQueue.addedAt).toLocaleString() : 
                      'Recently'
                    }
                  </div>
                </div>
              )}

              {/* Queued Jobs - Mobile Optimized */}
              {transcodingStatus.queue.queuedJobs && transcodingStatus.queue.queuedJobs.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 className="font-semibold text-white text-sm sm:text-base">📋 Queued Jobs ({transcodingStatus.queue.queuedJobs.length})</h4>
                    <button
                      onClick={() => clearQueueMutation.mutate()}
                      disabled={clearQueueMutation.isLoading}
                      className="btn-modern bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm px-3 py-1 w-full sm:w-auto"
                    >
                      {clearQueueMutation.isLoading ? '🔄' : '🧹'} Clear All
                    </button>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {transcodingStatus.queue.queuedJobs.map((job, index) => (
                      <div key={job.id} className="bg-gray-700/50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm truncate">
                            {getFileName(job.inputPath)}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Qualities: {job.qualities?.join(', ') || 'Default'} • 
                            Added: {job.addedAt ? new Date(job.addedAt).toLocaleTimeString() : 'Recently'}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end space-x-2">
                          <span className="text-xs text-blue-400 bg-blue-500/20 px-2 py-1 rounded">
                            #{index + 1}
                          </span>
                          <button
                            onClick={() => removeJobMutation.mutate(job.id)}
                            disabled={removeJobMutation.isLoading}
                            className="text-red-400 hover:text-red-300 p-1 hover:bg-red-500/20 rounded transition-colors"
                            title="Remove from queue"
                          >
                            {removeJobMutation.isLoading ? '🔄' : '🗑️'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Queue Status - Mobile Optimized */}
              <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
                <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">📊 Queue Status</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl font-bold text-blue-400">{transcodingStatus.queue.queueLength || 0}</div>
                    <div className="text-xs sm:text-sm text-gray-400">Queued</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl font-bold text-orange-400">{transcodingStatus.queue.activeJobs?.length || 0}</div>
                    <div className="text-xs sm:text-sm text-gray-400">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl font-bold text-green-400">{transcodingStatus.stats?.filesProcessed || 0}</div>
                    <div className="text-xs sm:text-sm text-gray-400">Completed</div>
                  </div>
                </div>
                
                {/* Processing Status */}
                {transcodingStatus.queue.isProcessing && (
                  <div className="mt-4 flex items-center justify-center space-x-2 text-blue-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    <span className="text-xs sm:text-sm">🚀 Processing with RTX 2070 Super GPU acceleration...</span>
                  </div>
                )}
              </div>

              {/* Compression Stats - Mobile Optimized */}
              {transcodingStatus.stats && (
                <div className="bg-purple-500/20 rounded-lg p-4 sm:p-6 border border-purple-500/30">
                  <h4 className="font-semibold text-purple-400 mb-4 text-sm sm:text-base">📊 Compression Statistics</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        {transcodingStatus.stats.formattedStats?.spaceSaved || '0 GB'}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400">Space Saved</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        {transcodingStatus.stats.compressionRatio || '0%'}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400">Compression Ratio</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        {transcodingStatus.stats.filesProcessed || 0}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400">Files Processed</div>
                    </div>
                  </div>
                </div>
              )}


            </>
          ) : (
            <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6 text-center">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-4">🎬 Transcoding Queue</h3>
              <p className="text-gray-400 text-sm sm:text-base">No transcoding data available.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Maintenance Actions */}
          <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
            <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">🔧 System Maintenance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isLoading}
                className="btn-modern bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm"
              >
                {cleanupMutation.isLoading ? '🔄 Cleaning...' : '🧹 Cleanup Corrupted'}
              </button>
              <button
                onClick={() => forceCleanupMutation.mutate()}
                disabled={forceCleanupMutation.isLoading}
                className="btn-modern bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm"
              >
                {forceCleanupMutation.isLoading ? '🔄 Force Cleaning...' : '💥 Force Cleanup 0-byte'}
              </button>
              <button
                onClick={() => refreshAnalyticsMutation.mutate()}
                disabled={refreshAnalyticsMutation.isLoading}
                className="btn-modern bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
              >
                {refreshAnalyticsMutation.isLoading ? '🔄 Refreshing...' : '🔄 Refresh Analytics'}
              </button>
              <button
                onClick={() => clearQueueMutation.mutate()}
                disabled={clearQueueMutation.isLoading}
                className="btn-modern bg-gray-600 hover:bg-gray-700 text-white text-xs sm:text-sm"
              >
                {clearQueueMutation.isLoading ? '🔄' : '🧹'} Clear Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6 mb-4">
            <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">⚙️ System Settings</h4>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white text-sm sm:text-base">Enable Auto-Transcoding on Upload</span>
              <button
                onClick={() => updateSystemSetting('autoTranscodingEnabled', !systemSettings.autoTranscodingEnabled)}
                disabled={settingsLoading}
                className={`relative inline-flex items-center h-6 rounded-full w-12 transition-colors focus:outline-none ${systemSettings.autoTranscodingEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
              >
                <span
                  className={`inline-block w-6 h-6 transform bg-white rounded-full shadow transition-transform ${systemSettings.autoTranscodingEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>
            <div className="text-xs text-gray-400">
              {systemSettings.autoTranscodingEnabled
                ? 'New uploads will be automatically transcoded based on system defaults.'
                : 'Auto-transcoding is disabled. Use manual optimization for new uploads.'}
            </div>
            {settingsLoading && <div className="text-blue-400 text-xs mt-2">Saving...</div>}
            {settingsError && <div className="text-red-400 text-xs mt-2">{settingsError}</div>}
          </div>
          {/* Enhanced Optimization Settings */}
          <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
            <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">⚙️ Advanced Transcoding Settings</h4>
            
            {/* Preset Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-3">🎯 Quality Presets</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(transcodingPresets).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`p-3 rounded-lg border transition-colors text-left ${
                      optimizationSettings.preset === key
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'
                    }`}
                  >
                    <div className="font-medium text-sm">{preset.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Settings with Individual Controls */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-3">📺 Output Qualities</label>
              <div className="space-y-3">
                {Object.entries(qualityPresets).map(([quality, settings]) => (
                  <div key={quality} className="bg-gray-700/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={optimizationSettings.qualities.includes(quality)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setOptimizationSettings(prev => ({
                                ...prev,
                                qualities: [...prev.qualities, quality]
                              }));
                            } else {
                              setOptimizationSettings(prev => ({
                                ...prev,
                                qualities: prev.qualities.filter(q => q !== quality)
                              }));
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-white">{quality}</span>
                        <span className="text-xs text-gray-400">({settings.resolution})</span>
                      </label>
                      {optimizationSettings.qualities.includes(quality) && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400">CRF:</span>
                          <input
                            type="number"
                            value={settings.crf}
                            onChange={(e) => updateQualitySettings(quality, 'crf', parseInt(e.target.value))}
                            className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs text-white"
                            min="0"
                            max="51"
                          />
                          <span className="text-xs text-gray-400">Bitrate:</span>
                          <input
                            type="text"
                            value={settings.bitrate}
                            onChange={(e) => updateQualitySettings(quality, 'bitrate', e.target.value)}
                            className="w-20 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs text-white"
                            placeholder="8000k"
                          />
                        </div>
                      )}
                    </div>
                    {optimizationSettings.qualities.includes(quality) && (
                      <div className="text-xs text-gray-400 ml-6">
                        Target: {settings.bitrate} • Audio: {settings.audioBitrate}k • CRF: {settings.crf}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Codec and Encoding Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">🎬 Video Codec</label>
                <select
                  value={optimizationSettings.codec}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, codec: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="h265">H.265 (HEVC) - Best compression</option>
                  <option value="h264">H.264 (AVC) - Better compatibility</option>
                  <option value="vp9">VP9 - Web optimized</option>
                  <option value="av1">AV1 - Latest compression</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">🎵 Audio Codec</label>
                <select
                  value={optimizationSettings.audioCodec}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, audioCodec: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="aac">AAC - Best compatibility</option>
                  <option value="opus">Opus - Best compression</option>
                  <option value="mp3">MP3 - Universal support</option>
                  <option value="ac3">AC3 - Surround sound</option>
                </select>
              </div>
            </div>

            {/* Advanced Settings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">🎯 CRF Value</label>
                <input
                  type="range"
                  min="0"
                  max="51"
                  value={optimizationSettings.crf}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, crf: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0 (Lossless)</span>
                  <span className="font-medium">{optimizationSettings.crf}</span>
                  <span>51 (Worst)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">🎵 Audio Bitrate (kbps)</label>
                <select
                  value={optimizationSettings.audioBitrate}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, audioBitrate: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="64">64 kbps</option>
                  <option value="96">96 kbps</option>
                  <option value="128">128 kbps</option>
                  <option value="192">192 kbps</option>
                  <option value="256">256 kbps</option>
                  <option value="320">320 kbps</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">⚡ Max Concurrent Jobs</label>
                <select
                  value={optimizationSettings.maxConcurrentJobs}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, maxConcurrentJobs: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1">1 (Conservative)</option>
                  <option value="2">2 (Balanced)</option>
                  <option value="3">3 (Aggressive)</option>
                  <option value="4">4 (Maximum)</option>
                </select>
              </div>
            </div>

            {/* Hardware Acceleration Toggle - Prominent */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
              <label className="block text-sm font-medium text-gray-300 mb-3">🚀 Hardware Acceleration</label>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">Acceleration Method</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      optimizationSettings.enableHardwareAcceleration 
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                        : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                    }`}>
                      {optimizationSettings.enableHardwareAcceleration ? 'GPU (NVIDIA)' : 'CPU'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    {optimizationSettings.enableHardwareAcceleration 
                      ? 'Using NVIDIA GPU acceleration for faster encoding (RTX 2070 Super)' 
                      : 'Using CPU encoding (slower but more compatible)'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">CPU</span>
                  <button
                    onClick={() => setOptimizationSettings(prev => ({
                      ...prev,
                      enableHardwareAcceleration: !prev.enableHardwareAcceleration
                    }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                      optimizationSettings.enableHardwareAcceleration 
                        ? 'bg-green-600' 
                        : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        optimizationSettings.enableHardwareAcceleration 
                          ? 'translate-x-6' 
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-xs text-gray-400">GPU</span>
                </div>
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-3">🔧 Advanced Features</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optimizationSettings.enableTwoPass}
                      onChange={(e) => setOptimizationSettings(prev => ({
                        ...prev,
                        enableTwoPass: e.target.checked
                      }))}
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">Two-Pass Encoding</span>
                      <p className="text-xs text-gray-400">Better quality, slower encoding</p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optimizationSettings.enableDeinterlace}
                      onChange={(e) => setOptimizationSettings(prev => ({
                        ...prev,
                        enableDeinterlace: e.target.checked
                      }))}
                      className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">Deinterlace</span>
                      <p className="text-xs text-gray-400">Remove interlacing artifacts</p>
                    </div>
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optimizationSettings.enableSubtitleBurn}
                      onChange={(e) => setOptimizationSettings(prev => ({
                        ...prev,
                        enableSubtitleBurn: e.target.checked
                      }))}
                      className="rounded border-gray-600 bg-gray-700 text-yellow-600 focus:ring-yellow-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">Burn Subtitles</span>
                      <p className="text-xs text-gray-400">Embed subtitles into video</p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optimizationSettings.enableMetadataCopy}
                      onChange={(e) => setOptimizationSettings(prev => ({
                        ...prev,
                        enableMetadataCopy: e.target.checked
                      }))}
                      className="rounded border-gray-600 bg-gray-700 text-green-600 focus:ring-green-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">Copy Metadata</span>
                      <p className="text-xs text-gray-400">Preserve original file metadata</p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optimizationSettings.enableThumbnailGeneration}
                      onChange={(e) => setOptimizationSettings(prev => ({
                        ...prev,
                        enableThumbnailGeneration: e.target.checked
                      }))}
                      className="rounded border-gray-600 bg-gray-700 text-pink-600 focus:ring-pink-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">Generate Thumbnails</span>
                      <p className="text-xs text-gray-400">Create preview thumbnails</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Priority and File Management */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">⚡ Priority Level</label>
                <select
                  value={optimizationSettings.priorityLevel}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, priorityLevel: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low - Background processing</option>
                  <option value="normal">Normal - Balanced</option>
                  <option value="high">High - Priority processing</option>
                  <option value="urgent">Urgent - Immediate processing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">📁 Minimum File Size (MB)</label>
                <input
                  type="number"
                  value={optimizationSettings.minFileSize}
                  onChange={(e) => setOptimizationSettings(prev => ({
                    ...prev,
                    minFileSize: parseInt(e.target.value) || 100
                  }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="10000"
                />
                <p className="text-xs text-gray-400 mt-1">Only process files larger than this size</p>
              </div>
            </div>

            {/* Delete Originals Warning */}
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={optimizationSettings.deleteOriginals}
                  onChange={(e) => setOptimizationSettings(prev => ({
                    ...prev,
                    deleteOriginals: e.target.checked
                  }))}
                  className="rounded border-gray-600 bg-gray-700 text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="text-sm font-medium text-red-400">🗑️ Delete Original Files</span>
                  <p className="text-xs text-red-300 mt-1">
                    ⚠️ Original files will be permanently deleted after successful transcoding. 
                    This action cannot be undone!
                  </p>
                </div>
              </label>
            </div>



            {/* Settings Summary */}
            <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
              <h5 className="text-sm font-medium text-white mb-2">📋 Current Settings Summary</h5>
              <div className="text-xs text-gray-400 space-y-1">
                <div>Codec: {optimizationSettings.codec.toUpperCase()} • CRF: {optimizationSettings.crf} • Audio: {optimizationSettings.audioCodec.toUpperCase()} {optimizationSettings.audioBitrate}k</div>
                <div>Qualities: {optimizationSettings.qualities.join(', ')} • Concurrent Jobs: {optimizationSettings.maxConcurrentJobs}</div>
                <div>Features: {[
                  optimizationSettings.enableHardwareAcceleration && 'GPU',
                  optimizationSettings.enableTwoPass && '2-Pass',
                  optimizationSettings.enableDeinterlace && 'Deinterlace',
                  optimizationSettings.enableSubtitleBurn && 'Subtitles',
                  optimizationSettings.enableMetadataCopy && 'Metadata',
                  optimizationSettings.enableThumbnailGeneration && 'Thumbnails'
                ].filter(Boolean).join(', ') || 'None'}</div>
              </div>
            </div>
          </div>

          

          {/* System Information - Mobile Optimized */}
          <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
            <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">🖥️ System Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">GPU:</span>
                <span className="text-white ml-2">RTX 2070 Super (NVENC)</span>
              </div>
              <div>
                <span className="text-gray-400">Codec:</span>
                <span className="text-white ml-2">H.265 (HEVC)</span>
              </div>
              <div>
                <span className="text-gray-400">Quality:</span>
                <span className="text-white ml-2">CQ 23 (High Quality)</span>
              </div>
              <div>
                <span className="text-gray-400">Connection:</span>
                <span className={`ml-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? 'Live Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-gray-900 rounded-xl shadow-2xl p-6 w-full max-w-md relative">
            <button
              onClick={() => setSettingsModalFile(null)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl"
              title="Close"
            >
              ×
            </button>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              {getFileName(settingsModalFile)}
              {fileSettings[settingsModalFile] ? (
                <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs font-medium border border-green-500/30">Custom Settings</span>
              ) : (
                <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-medium border border-blue-500/30">Global Settings</span>
              )}
            </h3>
            <div className="text-sm text-gray-200 space-y-1">
              {Object.entries(fileSettings[settingsModalFile] || optimizationSettings).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-gray-700 py-1">
                  <span className="font-medium text-gray-400">{key}</span>
                  <span className="text-white">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(', ') : value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Global Transcoding Settings */}
          <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
            <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">⚙️ Default Transcoding Settings</h4>
            
            {/* Video Quality Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target Qualities</label>
                <div className="space-y-2">
                  {['1080p', '720p', '480p'].map(quality => (
                    <label key={quality} className="flex items-center text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={optimizationSettings.qualities.includes(quality)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setOptimizationSettings(prev => ({
                              ...prev,
                              qualities: [...prev.qualities, quality]
                            }));
                          } else {
                            setOptimizationSettings(prev => ({
                              ...prev,
                              qualities: prev.qualities.filter(q => q !== quality)
                            }));
                          }
                        }}
                        className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                      />
                      {quality}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Video Codec</label>
                <select
                  value={optimizationSettings.codec}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, codec: e.target.value }))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                >
                  <option value="h264">H.264 (Compatible)</option>
                  <option value="h265">H.265/HEVC (Efficient)</option>
                  <option value="vp9">VP9 (Web Optimized)</option>
                </select>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Encoding Preset</label>
                <select
                  value={optimizationSettings.preset}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, preset: e.target.value }))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                >
                  <option value="ultrafast">Ultra Fast</option>
                  <option value="fast">Fast</option>
                  <option value="balanced">Balanced</option>
                  <option value="slow">High Quality</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Quality (CRF)</label>
                <input
                  type="range"
                  min="18"
                  max="32"
                  value={optimizationSettings.crf}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, crf: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>High Quality (18)</span>
                  <span className="font-medium text-white">{optimizationSettings.crf}</span>
                  <span>Small Size (32)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Audio Codec</label>
                <select
                  value={optimizationSettings.audioCodec}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, audioCodec: e.target.value }))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                >
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                  <option value="opus">Opus</option>
                </select>
              </div>
            </div>

            {/* Hardware & Performance Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-3">
                <label className="flex items-center text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={optimizationSettings.enableHardwareAcceleration}
                    onChange={(e) => setOptimizationSettings(prev => ({ ...prev, enableHardwareAcceleration: e.target.checked }))}
                    className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  Enable GPU Acceleration (NVENC)
                </label>
                
                <label className="flex items-center text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={optimizationSettings.enableTwoPass}
                    onChange={(e) => setOptimizationSettings(prev => ({ ...prev, enableTwoPass: e.target.checked }))}
                    className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  Two-Pass Encoding (Better Quality)
                </label>

                <label className="flex items-center text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={optimizationSettings.deleteOriginals}
                    onChange={(e) => setOptimizationSettings(prev => ({ ...prev, deleteOriginals: e.target.checked }))}
                    className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  Delete Original Files After Transcoding
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Max Concurrent Jobs</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={optimizationSettings.maxConcurrentJobs}
                  onChange={(e) => setOptimizationSettings(prev => ({ ...prev, maxConcurrentJobs: parseInt(e.target.value) }))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Higher values use more system resources</p>
              </div>
            </div>

            {/* Save Settings Button */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  // Save settings to localStorage or API
                  localStorage.setItem('transcodingSettings', JSON.stringify(optimizationSettings));
                  // Show success message
                  alert('Settings saved successfully!');
                }}
                className="btn-modern bg-green-600 hover:bg-green-700 text-white text-sm"
              >
                💾 Save Settings
              </button>
            </div>
          </div>

          {/* Manual Transcoding Section */}
          <div className="bg-gray-800/50 rounded-lg p-4 sm:p-6">
            <h4 className="font-semibold text-white mb-4 text-sm sm:text-base">🎬 Manual Transcoding</h4>
            <p className="text-gray-300 text-sm mb-4">
              For manual transcoding with custom settings, use the <strong>🚀 Optimize</strong> tab to select files and apply these settings.
            </p>
            <button
              onClick={() => setActiveTab('optimize')}
              className="btn-modern bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              🚀 Go to Optimization
            </button>
          </div>
        </div>
      )}



    </div>
  );
};

export default StorageOptimization; 