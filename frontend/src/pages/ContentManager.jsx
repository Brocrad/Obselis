import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuth from '../hooks/useAuth';
import MediaPlayer from '../components/MediaPlayer';
import ChunkedUpload from '../components/ChunkedUpload';
import TranscodingProgressBar from '../components/TranscodingProgressBar';

const API_BASE_URL = 'http://162.206.88.79:3001';

// Helper function to decode HTML entities
const decodeHtmlEntities = (text) => {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

const ContentManager = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);
  const [transcodingFiles, setTranscodingFiles] = useState([]); // Track files being transcoded
  const queryClient = useQueryClient();

  // Check if user has content management permissions
  const canManageContent = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';

  // Fetch content data
  const { data: contentData, isLoading: contentLoading, refetch: refetchContent } = useQuery({
    queryKey: ['content'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch content');
      return response.json();
    },
    enabled: !!user
  });

  // Fetch content statistics (admin only)
  const { data: statistics, isLoading: statsLoading } = useQuery({
    queryKey: ['content-statistics'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/statistics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch statistics');
      const data = await response.json();
      return data.stats; // Extract the stats from the response
    },
    enabled: isAdmin
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      setIsUploading(false);
      setUploadProgress(0);
      queryClient.invalidateQueries(['content']);
      queryClient.invalidateQueries(['content-statistics']);
    },
    onError: (error) => {
      setIsUploading(false);
      setUploadProgress(0);
      console.error('Upload error:', error);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (contentId) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/content/${contentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content']);
      queryClient.invalidateQueries(['content-statistics']);
    }
  });

  // Toggle publish mutation
  const togglePublishMutation = useMutation({
    mutationFn: async ({ contentId, published }) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/content/${contentId}/publish`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ published })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Update failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['content']);
      queryClient.invalidateQueries(['content-statistics']);
    }
  });

  // Regenerate thumbnails mutation
  const regenerateThumbnailsMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/regenerate-thumbnails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Thumbnail regeneration failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['content']);
      queryClient.invalidateQueries(['content-statistics']);
      alert(`Thumbnail regeneration complete!\n${data.message}`);
    },
    onError: (error) => {
      alert(`Thumbnail regeneration failed: ${error.message}`);
    }
  });

  // Fetch metadata mutation
  const fetchMetadataMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/fetch-metadata', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Metadata fetch failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['content']);
      queryClient.invalidateQueries(['content-statistics']);
      alert(`Metadata fetch complete!\n${data.message}`);
    },
    onError: (error) => {
      alert(`Metadata fetch failed: ${error.message}`);
    }
  });

  // Normalize TV shows mutation
  const normalizeTVShowsMutation = useMutation({
    mutationFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/normalize-tv-shows', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'TV show normalization failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['content']);
      queryClient.invalidateQueries(['content-statistics']);
      alert(`TV show normalization complete!\n${data.message}`);
    },
    onError: (error) => {
      alert(`TV show normalization failed: ${error.message}`);
    }
  });



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
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-large flex items-center justify-center shadow-large">
              <span className="text-2xl">📁</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Content Management
              </h1>
              <p className="text-slate-400">
                Welcome, {user.username} ({user.role_display_name || user.role})
              </p>
            </div>
          </div>
        </div>

        {/* Role-based permissions display */}
        <div className="card-modern p-6 mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
            <span>🔐</span>
            <span>Your Permissions</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`permission-card ${user.role === 'user' ? 'denied' : 'granted'}`}>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-full bg-slate-700">
                <span className="text-xl">👁️</span>
              </div>
              <h3 className="font-semibold mb-2">Content Viewing</h3>
              <p className="text-sm text-slate-300">
                {user.role === 'user' ? '✅ Published content only' : '✅ All content (including drafts)'}
              </p>
            </div>
            <div className={`permission-card ${canManageContent ? 'granted' : 'denied'}`}>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-full bg-slate-700">
                <span className="text-xl">🎬</span>
              </div>
              <h3 className="font-semibold mb-2">Content Management</h3>
              <p className="text-sm text-slate-300">
                {canManageContent ? '✅ Upload, edit, delete content' : '❌ View only'}
              </p>
            </div>
            <div className={`permission-card ${isAdmin ? 'granted' : 'denied'}`}>
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-full bg-slate-700">
                <span className="text-xl">👑</span>
              </div>
              <h3 className="font-semibold mb-2">User Management</h3>
              <p className="text-sm text-slate-300">
                {isAdmin ? '✅ Manage users and roles' : '❌ Admin only'}
              </p>
            </div>
          </div>
        </div>

        {/* Content for different roles */}
        {user.role === 'user' && (
          <div className="card-modern p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-large flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎭</span>
              </div>
              <h2 className="text-2xl font-bold mb-4">Available Content</h2>
              <p className="text-slate-400 mb-6">
                As a user, you can view and stream published content.
              </p>
              {contentLoading ? (
                <div className="py-8">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                  <p className="text-slate-400">Loading content...</p>
                </div>
              ) : contentData?.content?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {contentData.content.map((item) => (
                    <div key={item.id} className="card-modern p-4 cursor-pointer hover:bg-slate-700/20 transition-colors" onClick={() => setSelectedContent(item)}>
                      <div className="aspect-video bg-slate-700/50 rounded-modern mb-4 flex items-center justify-center relative group">
                        {item.thumbnail_path ? (
                          <img 
                            src={item.thumbnail_path} 
                            alt={item.title}
                            className="w-full h-full object-cover rounded-modern"
                          />
                        ) : (
                          <span className="text-4xl">🎬</span>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-modern">
                          <span className="text-white text-2xl">▶️</span>
                        </div>
                      </div>
                      <h3 className="font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-slate-400 mb-2">
                        {formatFileSize(item.file_size)}
                        {item.duration && ` • ${formatDuration(item.duration)}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.views || 0} views • Uploaded by {item.uploader_name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8">
                  <div className="w-24 h-24 bg-slate-700/50 rounded-large flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl text-slate-500">📺</span>
                  </div>
                  <p className="text-slate-400 mb-4">No content available yet.</p>
                  <p className="text-sm text-slate-500">Content managers will upload media files here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {canManageContent && (
          <>
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 mb-8">
              <button
                onClick={() => setActiveTab('content')}
                className={`tab-modern ${activeTab === 'content' ? 'active' : ''}`}
              >
                <span className="flex items-center space-x-2">
                  <span>📚</span>
                  <span>Content Library</span>
                </span>
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`tab-modern ${activeTab === 'upload' ? 'active' : ''}`}
              >
                <span className="flex items-center space-x-2">
                  <span>⚡</span>
                  <span>Upload Content</span>
                </span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('statistics')}
                  className={`tab-modern ${activeTab === 'statistics' ? 'active' : ''}`}
                >
                  <span className="flex items-center space-x-2">
                    <span>📊</span>
                    <span>Statistics</span>
                  </span>
                </button>
              )}
            </div>

            {/* Content Library Tab */}
            {activeTab === 'content' && (
              <div className="card-modern p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold flex items-center space-x-2">
                    <span>📚</span>
                    <span>Content Library</span>
                  </h2>
                  <div className="text-sm text-slate-400">
                    Total: {contentData?.content?.length || 0} items
                  </div>
                </div>
                {contentLoading ? (
                  <div className="text-center py-12">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                    <p className="text-slate-400">Loading content...</p>
                  </div>
                ) : contentData?.content?.length > 0 ? (
                  <div className="space-y-4">
                    {contentData.content.map((item) => {
                      // Parse tags properly - first tag is category, rest are additional tags
                      // Decode HTML entities first, then split and parse
                      const decodedTags = decodeHtmlEntities(item.tags || '');
                      const allTags = decodedTags.split(',').map(tag => tag.trim()).filter(tag => tag);
                      const category = allTags[0] || 'unknown';
                      const additionalTags = allTags.slice(1); // Skip the category tag
                      
                      return (
                        <div key={item.id} className="bg-slate-700/30 rounded-modern p-4 flex items-center space-x-4">
                          <div className="w-16 h-16 bg-slate-600/50 rounded-modern flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => setSelectedContent(item)}>
                            {item.thumbnail_path ? (
                              <img 
                                src={item.thumbnail_path}
                                alt={item.title}
                                className="w-full h-full object-cover rounded-modern"
                              />
                            ) : (
                              <span className="text-2xl">
                                {category === 'movie' ? '🎬' : category === 'tv-show' ? '📺' : '🎬'}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="font-semibold text-white truncate">{item.title}</h3>
                              <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full flex-shrink-0">
                                {category === 'movie' ? '🎬 Movie' : category === 'tv-show' ? '📺 TV Show' : '🎬 Video'}
                              </span>
                            </div>
                            <p className="text-sm text-slate-400">
                              {formatFileSize(item.file_size)}
                              {item.duration && ` • ${formatDuration(item.duration)}`}
                            </p>
                            <div className="flex items-center space-x-2 text-xs text-slate-500">
                              <span>{item.views || 0} views</span>
                              <span>•</span>
                              <span>Uploaded by {item.uploader_name}</span>
                              <span>•</span>
                              <span>{new Date(item.upload_date).toLocaleDateString()}</span>
                            </div>
                            {additionalTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {additionalTags.slice(0, 4).map((tag, index) => (
                                  <span key={index} className="text-xs bg-slate-600/50 text-slate-300 px-2 py-1 rounded-full border border-slate-500/30">
                                    {decodeHtmlEntities(tag)}
                                  </span>
                                ))}
                                {additionalTags.length > 4 && (
                                  <span className="text-xs text-slate-400">
                                    +{additionalTags.length - 4} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              item.published 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {item.published ? 'Published' : 'Draft'}
                            </span>
                            <button
                              onClick={() => togglePublishMutation.mutate({ 
                                contentId: item.id, 
                                published: !item.published 
                              })}
                              className="btn-modern bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm px-3 py-1"
                              disabled={togglePublishMutation.isLoading}
                            >
                              {item.published ? 'Unpublish' : 'Publish'}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this content?')) {
                                  deleteMutation.mutate(item.id);
                                }
                              }}
                              className="btn-modern bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm px-3 py-1"
                              disabled={deleteMutation.isLoading}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-24 h-24 bg-slate-700/50 rounded-large flex items-center justify-center mx-auto mb-6">
                      <span className="text-3xl text-slate-500">📁</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">No content uploaded yet</h3>
                    <p className="text-slate-400 mb-6">
                      Use the "Upload Content" tab to add media files to your server.
                    </p>
                    <button
                      onClick={() => setActiveTab('upload')}
                      className="btn-modern bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
                    >
                      <span className="flex items-center space-x-2">
                        <span>⬆️</span>
                        <span>Upload Content</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Upload Content Tab - High-Speed Chunked Upload */}
            {activeTab === 'upload' && (
              <div className="space-y-6">
                {/* Show transcoding progress for files that were recently uploaded */}
                {transcodingFiles.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                      <span>🎬</span>
                      <span>Processing Uploads</span>
                    </h3>
                    {transcodingFiles.map((file, index) => (
                      <TranscodingProgressBar
                        key={`${file.fileName}-${index}`}
                        mediaId={file.mediaId}
                        fileName={file.fileName}
                        onComplete={() => {
                          // Remove this file from transcoding list
                          setTranscodingFiles(prev => 
                            prev.filter((_, i) => i !== index)
                          );
                          // Refresh content list
                          queryClient.invalidateQueries(['content']);
                          if (isAdmin) {
                            queryClient.invalidateQueries(['content-statistics']);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}

                <ChunkedUpload 
                  onUploadComplete={(result) => {
                    console.log('Upload completed:', result);
                    
                    // Show info message about manual transcoding since auto-transcoding is disabled
                    if (!result.transcoding?.queued) {
                      // You could add a toast notification here if you have a toast system
                      console.log('ℹ️ Auto-transcoding is disabled. Use Storage Management to optimize files manually.');
                    }
                    
                    // Add to transcoding files if transcoding was queued (shouldn't happen with auto-transcoding disabled)
                    if (result.transcoding?.queued) {
                      setTranscodingFiles(prev => [...prev, {
                        mediaId: result.media?.id,
                        fileName: result.media?.original_filename || 'Unknown file'
                      }]);
                    }
                    
                    // Refresh content and statistics
                    queryClient.invalidateQueries(['content']);
                    if (isAdmin) {
                      queryClient.invalidateQueries(['content-statistics']);
                    }
                  }}
                  onUploadError={(error) => {
                    console.error('Upload error:', error);
                  }}
                />
                
                {/* Info notice about manual transcoding */}
                <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 mt-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-blue-400 text-xl">ℹ️</span>
                    <div>
                      <h4 className="text-blue-200 font-medium mb-2">Auto-Transcoding Disabled</h4>
                      <p className="text-blue-300/80 text-sm mb-2">
                        Files will upload and stream immediately using their original format. 
                        For storage optimization and better compatibility, manually transcode files using the <span className="font-semibold text-blue-200">Storage Management</span> page.
                      </p>
                                             <p className="text-blue-400 text-sm">
                         💡 <strong>Tip:</strong> Large files (&gt;500MB) can be significantly compressed with H.265 encoding while maintaining quality.
                       </p>
                    </div>
                  </div>
                </div>
                
                {/* Info about legacy upload */}
                <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 rounded-large p-6 border border-gray-700/30">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">💡</span>
                    About This Upload Method
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                      <h4 className="font-semibold text-purple-400 mb-2 flex items-center gap-2">
                        <span>⚡</span>
                        High-Speed Upload Features
                      </h4>
                      <ul className="text-sm text-gray-300 space-y-1">
                        <li>• Chunked parallel uploads (3-5x faster)</li>
                        <li>• Up to 75GB per file</li>
                        <li>• Resume capability if interrupted</li>
                        <li>• Real-time speed & ETA tracking</li>
                        <li>• Optimized for 4K videos</li>
                        <li>• Automatic retry on failures</li>
                      </ul>
                    </div>
                    <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                      <h4 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                        <span>📋</span>
                        Supported Formats
                      </h4>
                      <ul className="text-sm text-gray-300 space-y-1">
                        <li>• MP4, MKV, AVI, MOV, WMV</li>
                        <li>• FLV, WebM, M4V, 3GP, OGG</li>
                        <li>• TS, MTS, M2TS (4K formats)</li>
                        <li>• Maximum: 75GB per file</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <p className="text-sm text-green-400">
                      <strong>✅ Universal Upload Method:</strong> This high-speed upload system works optimally for all video files, from small clips to large 4K movies, providing the best performance regardless of file size or resolution.
                    </p>
                  </div>
                </div>
              </div>
            )}





            {/* Statistics Tab */}
            {activeTab === 'statistics' && isAdmin && (
              <div className="card-modern p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold flex items-center space-x-2">
                    <span>📊</span>
                    <span>Content Statistics</span>
                  </h2>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        if (confirm('This will fetch enhanced metadata (cast, director, ratings, etc.) from TMDB for all movies. This may take several minutes. Continue?')) {
                          fetchMetadataMutation.mutate();
                        }
                      }}
                      disabled={fetchMetadataMutation.isLoading}
                      className="btn-modern bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white flex items-center space-x-2"
                    >
                      {fetchMetadataMutation.isLoading ? (
                        <>
                          <div className="loading-spinner w-4 h-4"></div>
                          <span>Fetching...</span>
                        </>
                      ) : (
                        <>
                          <span>📊</span>
                          <span>Fetch Metadata</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('This will organize TV show episodes under their proper show titles. This helps group episodes correctly when they were uploaded separately. Continue?')) {
                          normalizeTVShowsMutation.mutate();
                        }
                      }}
                      disabled={normalizeTVShowsMutation.isLoading}
                      className="btn-modern bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white flex items-center space-x-2"
                    >
                      {normalizeTVShowsMutation.isLoading ? (
                        <>
                          <div className="loading-spinner w-4 h-4"></div>
                          <span>Organizing...</span>
                        </>
                      ) : (
                        <>
                          <span>📺</span>
                          <span>Organize TV Shows</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('This will regenerate all thumbnails using advanced AI-powered poster generation. This may take several minutes. Continue?')) {
                          regenerateThumbnailsMutation.mutate();
                        }
                      }}
                      disabled={regenerateThumbnailsMutation.isLoading}
                      className="btn-modern bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white flex items-center space-x-2"
                    >
                      {regenerateThumbnailsMutation.isLoading ? (
                        <>
                          <div className="loading-spinner w-4 h-4"></div>
                          <span>Regenerating...</span>
                        </>
                      ) : (
                        <>
                          <span>🎨</span>
                          <span>Regenerate Thumbnails</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {statsLoading ? (
                  <div className="text-center py-12">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                    <p className="text-slate-400">Loading statistics...</p>
                  </div>
                ) : statistics ? (
                  <div className="space-y-8">
                    {/* Overview Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-large p-6 border border-blue-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-blue-400 text-sm font-medium">Total Content</span>
                          <span className="text-2xl">📁</span>
                        </div>
                        <div className="text-3xl font-bold text-white">{statistics.totalContent || 0}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {statistics.totalSizeGb ? `${statistics.totalSizeGb} GB` : '0 GB'}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-large p-6 border border-green-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-green-400 text-sm font-medium">Published</span>
                          <span className="text-2xl">✅</span>
                        </div>
                        <div className="text-3xl font-bold text-white">{statistics.publishedContent || 0}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {statistics.totalContent > 0 ? Math.round((statistics.publishedContent / statistics.totalContent) * 100) : 0}% of total
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 rounded-large p-6 border border-yellow-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-yellow-400 text-sm font-medium">Drafts</span>
                          <span className="text-2xl">📝</span>
                        </div>
                        <div className="text-3xl font-bold text-white">{statistics.draftContent || 0}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {statistics.totalContent > 0 ? Math.round((statistics.draftContent / statistics.totalContent) * 100) : 0}% of total
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-large p-6 border border-purple-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-purple-400 text-sm font-medium">Total Views</span>
                          <span className="text-2xl">👁️</span>
                        </div>
                        <div className="text-3xl font-bold text-white">{statistics.totalViews || 0}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {statistics.avgViewsPerContent ? `${statistics.avgViewsPerContent} avg per item` : '0 avg per item'}
                        </div>
                      </div>
                    </div>

                    {/* Category Breakdown */}
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                        <span>🎭</span>
                        <span>Content by Category</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gradient-to-br from-red-500/20 to-pink-600/20 rounded-large p-6 border border-red-500/30">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-red-400 text-lg font-medium">Movies</span>
                            <span className="text-3xl">🎬</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Total:</span>
                              <span className="text-2xl font-bold text-white">{statistics.movieCount || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Published:</span>
                              <span className="text-lg font-semibold text-green-400">{statistics.publishedMovies || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Drafts:</span>
                              <span className="text-lg font-semibold text-yellow-400">{(statistics.movieCount || 0) - (statistics.publishedMovies || 0)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-500/20 to-blue-600/20 rounded-large p-6 border border-purple-500/30">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-purple-400 text-lg font-medium">TV Shows</span>
                            <span className="text-3xl">📺</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Total:</span>
                              <span className="text-2xl font-bold text-white">{statistics.tvShowCount || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Published:</span>
                              <span className="text-lg font-semibold text-green-400">{statistics.publishedTvShows || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Drafts:</span>
                              <span className="text-lg font-semibold text-yellow-400">{(statistics.tvShowCount || 0) - (statistics.publishedTvShows || 0)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-slate-400">No statistics available.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Media Player Modal */}
      {selectedContent && (
        <MediaPlayer
          content={selectedContent}
          onClose={() => setSelectedContent(null)}
        />
      )}
    </div>
  );
};

export default ContentManager; 