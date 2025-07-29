import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSocket } from '../hooks/useSocket';
import useAuth from '../hooks/useAuth';
import ObselisLoadingAnimation from '../components/ObselisLoadingAnimation';
import { formatFileSize, formatDuration } from '../utils/formatters';


const Home = () => {
  const { user } = useAuth();
  const { isConnected, transcodingProgress } = useSocket();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showLoading, setShowLoading] = useState(() => {
    // Only show loading animation if user hasn't seen it in this session
    return !sessionStorage.getItem('obselis-animation-shown');
  });

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch dashboard data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const [contentRes, analyticsRes, statusRes, bandwidthRes] = await Promise.all([
        fetch('/api/content?limit=6', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/storage/analytics', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/storage/transcoding/status', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/streaming/my-bandwidth', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const content = contentRes.ok ? await contentRes.json() : { content: [] };
      const analytics = analyticsRes.ok ? await analyticsRes.json() : null;
      const status = statusRes.ok ? await statusRes.json() : null;
      const bandwidth = bandwidthRes.ok ? await bandwidthRes.json() : null;

      return { content, analytics, status, bandwidth };
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Using shared formatters from utils/formatters.js

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const canManageContent = user?.role === 'admin' || user?.role === 'manager' || user?.is_admin;
  const isAdmin = user?.is_admin || user?.role === 'admin';

  // Show loading animation only on first login (when user hasn't seen it in this session)
  if (showLoading) {
    return (
      <ObselisLoadingAnimation 
        onComplete={() => {
          setShowLoading(false);
          // Mark animation as shown for this session
          sessionStorage.setItem('obselis-animation-shown', 'true');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                {getGreeting()}, {user?.display_name || user?.username}!
              </h1>
              <p className="text-slate-400 text-lg">
                Welcome to your personal media server
              </p>
              <p className="text-slate-500 text-sm mt-1">
                {currentTime.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            
            {/* System Status */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
                <span className="text-sm text-slate-400">
                  {isConnected ? 'System Online' : 'System Offline'}
                </span>
              </div>
              {isAdmin && transcodingProgress && (
                <div className="text-xs text-blue-400">
                  🎬 Transcoding: {transcodingProgress.progress}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        {dashboardData?.analytics?.analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg p-6 border border-blue-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-400 text-sm font-medium">Total Content</span>
                <span className="text-2xl">📚</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {dashboardData.content?.content?.length || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {dashboardData.analytics.analytics.original?.formattedTotalSize || '0 GB'}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-lg p-6 border border-green-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-green-400 text-sm font-medium">Space Saved</span>
                <span className="text-2xl">💾</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {dashboardData.analytics.analytics.compression?.formattedStats?.spaceSaved || '0 GB'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {dashboardData.analytics.analytics.compression?.compressionRatio || '0%'} compression
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg p-6 border border-purple-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-purple-400 text-sm font-medium">Transcoding Queue</span>
                <span className="text-2xl">🎬</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {dashboardData.status?.queue?.queueLength || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {dashboardData.status?.queue?.isProcessing ? 'Processing...' : 'Idle'}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 rounded-lg p-6 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-yellow-400 text-sm font-medium">Your Role</span>
                <span className="text-2xl">👤</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {user?.role_display_name || user?.role || 'User'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {isAdmin ? 'Full Access' : canManageContent ? 'Content Manager' : 'Viewer'}
              </div>
            </div>
          </div>
        )}



        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Link to="/movies" className="group">
            <div className="bg-gradient-to-br from-red-500/20 to-pink-600/20 rounded-lg p-6 border border-red-500/30 hover:border-red-400/50 transition-all duration-200 group-hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <span className="text-red-400 text-lg font-medium">Movies</span>
                <span className="text-3xl group-hover:scale-110 transition-transform">🎬</span>
              </div>
              <p className="text-slate-300 text-sm">Browse and watch your movie collection</p>
              <div className="mt-4 text-red-400 text-sm font-medium">
                Explore Movies →
              </div>
            </div>
          </Link>
          
          <Link to="/tv-shows" className="group">
            <div className="bg-gradient-to-br from-purple-500/20 to-blue-600/20 rounded-lg p-6 border border-purple-500/30 hover:border-purple-400/50 transition-all duration-200 group-hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <span className="text-purple-400 text-lg font-medium">TV Shows</span>
                <span className="text-3xl group-hover:scale-110 transition-transform">📺</span>
              </div>
              <p className="text-slate-300 text-sm">Discover series and episodes</p>
              <div className="mt-4 text-purple-400 text-sm font-medium">
                Browse Shows →
              </div>
            </div>
          </Link>
          
          {canManageContent && (
            <Link to="/content" className="group">
              <div className="bg-gradient-to-br from-green-500/20 to-teal-600/20 rounded-lg p-6 border border-green-500/30 hover:border-green-400/50 transition-all duration-200 group-hover:scale-105">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-green-400 text-lg font-medium">Content Manager</span>
                  <span className="text-3xl group-hover:scale-110 transition-transform">📁</span>
                </div>
                <p className="text-slate-300 text-sm">Upload and manage media files</p>
                <div className="mt-4 text-green-400 text-sm font-medium">
                  Manage Content →
                </div>
              </div>
            </Link>
          )}
          
          {isAdmin && (
            <>
              <Link to="/admin" className="group">
                <div className="bg-gradient-to-br from-orange-500/20 to-red-600/20 rounded-lg p-6 border border-orange-500/30 hover:border-orange-400/50 transition-all duration-200 group-hover:scale-105">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-orange-400 text-lg font-medium">Admin Panel</span>
                    <span className="text-3xl group-hover:scale-110 transition-transform">⚙️</span>
                  </div>
                  <p className="text-slate-300 text-sm">System administration and user management</p>
                  <div className="mt-4 text-orange-400 text-sm font-medium">
                    Admin Dashboard →
                  </div>
                </div>
              </Link>
              
              <Link to="/admin?tab=storage" className="group">
                <div className="bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-lg p-6 border border-cyan-500/30 hover:border-cyan-400/50 transition-all duration-200 group-hover:scale-105">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-cyan-400 text-lg font-medium">Storage Optimization</span>
                    <span className="text-3xl group-hover:scale-110 transition-transform">💾</span>
                  </div>
                  <p className="text-slate-300 text-sm">Manage transcoding and storage analytics</p>
                  <div className="mt-4 text-cyan-400 text-sm font-medium">
                    Optimize Storage →
                  </div>
                </div>
              </Link>
            </>
          )}
          
          <Link to="/profile" className="group">
            <div className="bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-lg p-6 border border-indigo-500/30 hover:border-indigo-400/50 transition-all duration-200 group-hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <span className="text-indigo-400 text-lg font-medium">Profile</span>
                <span className="text-3xl group-hover:scale-110 transition-transform">👤</span>
              </div>
              <p className="text-slate-300 text-sm">Manage your account settings</p>
              <div className="mt-4 text-indigo-400 text-sm font-medium">
                View Profile →
              </div>
            </div>
          </Link>
        </div>

        {/* Personal Bandwidth Usage */}
        {dashboardData?.bandwidth && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">My Usage This Month</h2>
              <Link to="/profile" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                View Details →
              </Link>
            </div>
            
            {dashboardData.bandwidth.userHistory && dashboardData.bandwidth.userHistory.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 rounded-lg p-6 border border-emerald-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-emerald-400 text-sm font-medium">Bandwidth Used</span>
                    <span className="text-2xl">📊</span>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {dashboardData.bandwidth.formatted?.[0]?.totalBandwidth || '0 GB'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    This month's data usage
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-lg p-6 border border-blue-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-blue-400 text-sm font-medium">Watch Time</span>
                    <span className="text-2xl">⏱️</span>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {dashboardData.bandwidth.formatted?.[0]?.totalDuration || '0h 0m'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Total viewing time
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-500/20 to-pink-600/20 rounded-lg p-6 border border-purple-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-purple-400 text-sm font-medium">Streams</span>
                    <span className="text-2xl">📺</span>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {dashboardData.bandwidth.userHistory?.[0]?.total_streams || 0}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Streaming sessions
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/30 rounded-lg p-8 border border-slate-700/50 text-center">
                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📺</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">No Usage Data Yet</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Start watching content to see your bandwidth usage here
                </p>
                <Link to="/movies" className="inline-flex items-center px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition-colors text-sm font-medium">
                  <span>🎬</span>
                  <span className="ml-2">Start Watching</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Recent Content */}
        {dashboardData?.content?.content && dashboardData.content.content.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recently Added</h2>
              <Link to="/movies" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dashboardData.content.content.slice(0, 6).map((item) => (
                <div key={item.id} className="bg-slate-800/50 rounded-lg p-4 hover:bg-slate-700/50 transition-colors group cursor-pointer">
                  <div className="aspect-video bg-slate-700/50 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                    {item.thumbnail_path ? (
                      <img 
                        src={item.thumbnail_path} 
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl">🎬</span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-2xl">▶️</span>
                    </div>
                  </div>
                  <h3 className="font-semibold text-white mb-2 truncate">{item.title}</h3>
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>{formatFileSize(item.file_size)}</span>
                    {item.duration && <span>{formatDuration(item.duration)}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {item.views || 0} views
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Information & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* System Status */}
          <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🖥️</span>
              <span>System Status</span>
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Server Status:</span>
                <span className={`${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? '🟢 Online' : '🔴 Offline'}
                </span>
              </div>
              {!isAdmin && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Content Library:</span>
                    <span className="text-purple-400">
                      📚 {dashboardData?.content?.content?.length || 0} items
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Your Access:</span>
                    <span className="text-green-400">
                      ✅ {canManageContent ? 'Manager' : 'Viewer'}
                    </span>
                  </div>
                </>
              )}
              {isAdmin && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Transcoding:</span>
                    <span className="text-blue-400">
                      {dashboardData?.status?.queue?.isProcessing ? '🎬 Active' : '⏸️ Idle'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Queue Length:</span>
                    <span className="text-yellow-400">
                      📋 {dashboardData?.status?.queue?.queueLength || 0} jobs
                    </span>
                  </div>
                  {transcodingProgress && (
                    <div className="mt-4 p-3 bg-blue-500/20 rounded-lg border border-blue-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-blue-400 text-sm font-medium">Currently Processing</span>
                        <span className="text-blue-300 text-sm">{transcodingProgress.progress}%</span>
                      </div>
                      <div className="text-xs text-slate-300 truncate">
                        {transcodingProgress.filename} ({transcodingProgress.quality})
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${transcodingProgress.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>💡</span>
              <span>Quick Tips</span>
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✅</span>
                <div>
                  <span className="text-slate-300">Mobile Access:</span>
                  <p className="text-slate-400 text-xs mt-1">
                    Access your server from mobile using your IP address
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 mt-0.5">🎬</span>
                <div>
                  <span className="text-slate-300">Auto Transcoding:</span>
                  <p className="text-slate-400 text-xs mt-1">
                    Files are automatically optimized to save storage space
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-400 mt-0.5">⚡</span>
                <div>
                  <span className="text-slate-300">GPU Acceleration:</span>
                  <p className="text-slate-400 text-xs mt-1">
                    RTX 2070 Super provides fast H.265 encoding
                  </p>
                </div>
              </div>
              {isAdmin && (
                <div className="mt-4 p-3 bg-orange-500/20 rounded-lg border border-orange-500/30">
                  <Link to="/admin?tab=storage" className="text-orange-400 hover:text-orange-300 text-sm font-medium">
                    📊 View Storage Analytics →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 