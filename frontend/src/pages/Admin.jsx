import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StorageOptimization from '../components/StorageOptimization';
import StorageAnalysis from '../components/StorageAnalysis';
import AdminWhitelistManager from '../components/AdminWhitelistManager';

const Admin = () => {
  const [activeTab, setActiveTab] = useState(() => {
    // Try to get the last active tab from localStorage, default to 'error-testing'
    return localStorage.getItem('adminActiveTab') || 'error-testing';
  });

  // Save active tab to localStorage whenever it changes
  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    localStorage.setItem('adminActiveTab', tabName);
  };
  const [storageSubTab, setStorageSubTab] = useState('optimization');
  const [inviteForm, setInviteForm] = useState({
    expiresInDays: 7,
    maxUses: 1,
    isIndefinite: false
  });
  const [emailInviteForm, setEmailInviteForm] = useState({
    email: '',
    expiresInDays: 7,
    maxUses: 1,
    isIndefinite: false
  });
  
  // Streaming management state
  const [activeStreams, setActiveStreams] = useState([]);
  const [activeStreamsLoading, setActiveStreamsLoading] = useState(false);
  const [bandwidthInvestigationData, setBandwidthInvestigationData] = useState(null);
  const [bandwidthInvestigationLoading, setBandwidthInvestigationLoading] = useState(false);
  const [investigationFilters, setInvestigationFilters] = useState({
    userId: '',
    periodType: 'all',
    period: '',
    periodEnd: '',
    limit: 50
  });
  const [monthlyBandwidthData, setMonthlyBandwidthData] = useState(null);
  const [monthlyBandwidthLoading, setMonthlyBandwidthLoading] = useState(false);
  const [showInvestigationModal, setShowInvestigationModal] = useState(false);
  const [investigationDetailsTab, setInvestigationDetailsTab] = useState('summary');
  
  // Streaming settings state
  const [streamingSettings, setStreamingSettings] = useState(null);
  const [streamingSettingsLoading, setStreamingSettingsLoading] = useState(false);
  const [streamingSettingsForm, setStreamingSettingsForm] = useState({
    maxResolution: '1080p',
    bitrateLimit: '20',
    totalBandwidthLimit: '150',
    perUserBandwidthLimit: '25'
  });
  const [savingSettings, setSavingSettings] = useState(false);
  
  const queryClient = useQueryClient();
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const [showRefreshNotification, setShowRefreshNotification] = useState(false);

  // Fetch users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/auth/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not active
    staleTime: 5000 // Consider data stale after 5 seconds
  });

  // Fetch invite tokens
  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/auth/invites', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch invites');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not active
    staleTime: 5000 // Consider data stale after 5 seconds
  });

  // Create invite mutation
  const createInviteMutation = useMutation({
    mutationFn: async (inviteData) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/auth/invites', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inviteData)
      });
      if (!response.ok) throw new Error('Failed to create invite');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invites']);
      setInviteForm({ expiresInDays: 7, maxUses: 1, isIndefinite: false });
    }
  });

  // Send invite via email mutation
  const sendEmailInviteMutation = useMutation({
    mutationFn: async (inviteData) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/auth/invites/send-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inviteData)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invite email');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['invites']);
      setEmailInviteForm({ email: '', expiresInDays: 7, maxUses: 1, isIndefinite: false });
      
      // Show appropriate notification based on email status
      const notification = document.createElement('div');
      if (data.emailSent) {
        notification.textContent = `✅ Invite sent to ${data.sentTo}!`;
        notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-md z-50 text-sm';
      } else {
        notification.textContent = `⚠️ Invite created but email failed. Copy the code manually.`;
        notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-md z-50 text-sm';
      }
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 4000);
    },
    onError: (error) => {
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = error.message;
      notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-md z-50 text-sm';
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 3000);
    }
  });

  // Delete invite mutation
  const deleteInviteMutation = useMutation({
    mutationFn: async (token) => {
      const authToken = sessionStorage.getItem('token');
      const response = await fetch(`/api/auth/invites/${token}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!response.ok) throw new Error('Failed to delete invite');
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['invites']);
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
    }
  });

  // Toggle admin role mutation (legacy)
  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }) => {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/auth/users/${userId}/admin`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_admin: !isAdmin })
      });
      if (!response.ok) throw new Error('Failed to update user role');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
    }
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }) => {
      const token = sessionStorage.getItem('token');
      console.log('🔄 Attempting role update:', { userId, role });
      
      const response = await fetch(`/api/auth/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });
      
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Role update failed:', errorData);
        throw new Error(errorData.error || 'Failed to update user role');
      }
      
      const result = await response.json();
      console.log('✅ Role update successful:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('🎉 Role update mutation succeeded:', data);
      queryClient.invalidateQueries(['users']);
    },
    onError: (error) => {
      console.error('💥 Role update mutation failed:', error);
    }
  });

  const handleCreateInvite = (e) => {
    e.preventDefault();
    createInviteMutation.mutate(inviteForm);
  };

  const handleSendEmailInvite = (e) => {
    e.preventDefault();
    sendEmailInviteMutation.mutate(emailInviteForm);
  };

  const handleDeleteUser = (userId, username) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  // Bandwidth investigation functions
  const fetchBandwidthInvestigation = async (filters = {}) => {
    try {
      setBandwidthInvestigationLoading(true);
      const token = sessionStorage.getItem('token');
      
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.periodType) params.append('periodType', filters.periodType);
      if (filters.period) params.append('period', filters.period);
      if (filters.periodEnd) params.append('periodEnd', filters.periodEnd);
      if (filters.limit) params.append('limit', filters.limit);

      const response = await fetch(`/api/streaming/bandwidth-investigation?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bandwidth investigation data');
      }

      const result = await response.json();
      setBandwidthInvestigationData(result.success ? result.data : null);
    } catch (error) {
      console.error('Bandwidth investigation error:', error);
      setBandwidthInvestigationData(null);
    } finally {
      setBandwidthInvestigationLoading(false);
    }
  };

  // Monthly bandwidth data functions
  const fetchMonthlyBandwidthData = async () => {
    try {
      setMonthlyBandwidthLoading(true);
      const token = sessionStorage.getItem('token');
      
      const streamingResponse = await fetch('/api/streaming/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!streamingResponse.ok) {
        throw new Error('Failed to fetch streaming analytics');
      }
      
      const streamingResult = await streamingResponse.json();
      setMonthlyBandwidthData(streamingResult.success ? streamingResult : null);
      
      // Update active streams from the analytics data
      if (streamingResult.success && streamingResult.activeStreams) {
        setActiveStreams(streamingResult.activeStreams);
      }
    } catch (error) {
      console.error('Monthly bandwidth error:', error);
      setMonthlyBandwidthData(null);
    } finally {
      setMonthlyBandwidthLoading(false);
    }
  };

  // Active streams management
  const fetchActiveStreams = async () => {
    try {
      setActiveStreamsLoading(true);
      const token = sessionStorage.getItem('token');
      
      const response = await fetch('/api/streaming/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch active streams');
      }
      
      const result = await response.json();
      if (result.success && result.activeStreams) {
        setActiveStreams(result.activeStreams);
      }
    } catch (error) {
      console.error('Active streams error:', error);
    } finally {
      setActiveStreamsLoading(false);
    }
  };

  // Terminate streaming session
  const terminateStream = async (streamId) => {
    try {
      const response = await fetch('/api/streaming/session/terminate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: streamId })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Refresh active streams
          await fetchActiveStreams();
          
          // Show success notification
          const notification = document.createElement('div');
          notification.textContent = '✅ Stream terminated successfully';
          notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md z-50 text-sm';
          document.body.appendChild(notification);
          setTimeout(() => document.body.removeChild(notification), 3000);
        } else {
          throw new Error(result.error || 'Failed to terminate stream');
        }
      } else if (response.status === 404) {
        // Session not found or already terminated - refresh the list anyway
        await fetchActiveStreams();
        
        const notification = document.createElement('div');
        notification.textContent = 'ℹ️ Stream already terminated or not found';
        notification.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50 text-sm';
        document.body.appendChild(notification);
        setTimeout(() => document.body.removeChild(notification), 3000);
      } else {
        throw new Error('Failed to terminate stream');
      }
      
    } catch (error) {
      console.error('Terminate stream error:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = '❌ Failed to terminate stream';
      notification.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-md z-50 text-sm';
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 3000);
    }
  };

  // Reset rate limiting for user
  const resetUserRateLimit = async (userId, username) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/reset-rate-limit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log(`Rate limit reset for ${username}`);
          alert(`✅ Rate limit reset for ${username}`);
          // Refresh user data
          queryClient.invalidateQueries(['users']);
        } else {
          console.error(result.error || 'Failed to reset rate limit');
          alert(`❌ Failed to reset rate limit: ${result.error || 'Unknown error'}`);
        }
      } else {
        console.error('Failed to reset rate limit');
      }
    } catch (error) {
      console.error('Reset rate limit error:', error);
      console.error('Failed to reset rate limit');
    }
  };

  // Fetch streaming settings
  const fetchStreamingSettings = async () => {
    setStreamingSettingsLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/streaming/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.settings) {
          setStreamingSettings(result.settings);
          // Only update form if we have actual settings from server
          setStreamingSettingsForm({
            maxResolution: result.settings.maxResolution !== undefined ? result.settings.maxResolution : '1080p',
            bitrateLimit: result.settings.bitrateLimit !== undefined ? result.settings.bitrateLimit : '20',
            totalBandwidthLimit: result.settings.totalBandwidthLimit !== undefined ? result.settings.totalBandwidthLimit : '150',
            perUserBandwidthLimit: result.settings.perUserBandwidthLimit !== undefined ? result.settings.perUserBandwidthLimit : '25'
          });
        }
      }
    } catch (error) {
      console.error('Fetch streaming settings error:', error);
      alert('❌ Failed to load streaming settings');
    } finally {
      setStreamingSettingsLoading(false);
    }
  };

  // Save streaming settings
  const saveStreamingSettings = async () => {
    setSavingSettings(true);
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/streaming/settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamingSettingsForm),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Streaming settings saved successfully');
          alert('✅ Streaming settings saved successfully');
          setStreamingSettings(result.settings);
        } else {
          console.error(result.error || 'Failed to save settings');
          alert(`❌ Failed to save settings: ${result.error || 'Unknown error'}`);
        }
      } else {
        console.error('Failed to save streaming settings');
        alert('❌ Failed to save streaming settings');
      }
    } catch (error) {
      console.error('Save streaming settings error:', error);
      alert('❌ Failed to save streaming settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Utility functions
  const formatBandwidth = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const handleToggleAdmin = (userId, username, isAdmin) => {
    const action = isAdmin ? 'remove admin privileges from' : 'grant admin privileges to';
    if (window.confirm(`Are you sure you want to ${action} user "${username}"?`)) {
      toggleAdminMutation.mutate({ userId, isAdmin });
    }
  };

  const handleRoleChange = (userId, username, newRole) => {
    const roleNames = {
      'admin': 'Administrator',
      'manager': 'Content Manager',
      'user': 'User'
    };
    
    if (window.confirm(`Are you sure you want to change "${username}" to ${roleNames[newRole]}?`)) {
      updateRoleMutation.mutate({ userId, role: newRole });
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      case 'user':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getInviteStatus = (invite) => {
    const now = new Date();
    const expiresAt = new Date(invite.expires_at);
    
    if (invite.current_uses >= invite.max_uses && invite.max_uses !== -1) {
      return { status: 'Used Up', color: 'bg-gray-500' };
    } else if (expiresAt < now && !invite.is_indefinite) {
      return { status: 'Expired', color: 'bg-red-500' };
    } else if (invite.is_indefinite) {
      return { status: 'Indefinite', color: 'bg-blue-500' };
    } else {
      return { status: 'Active', color: 'bg-green-500' };
    }
  };

  // Load data when switching to streaming tab
  useEffect(() => {
    if (activeTab === 'streaming') {
      fetchActiveStreams();
      fetchMonthlyBandwidthData();
      fetchStreamingSettings();
    }
  }, [activeTab]);

  // Update last refresh time when data is fetched
  useEffect(() => {
    if (users && !usersLoading) {
      setLastRefreshTime(new Date());
      // Show notification for automatic refresh (but not for initial load)
      if (users.length > 0) {
        setShowRefreshNotification(true);
        setTimeout(() => setShowRefreshNotification(false), 3000);
      }
    }
  }, [users, usersLoading]);

  useEffect(() => {
    if (invites && !invitesLoading) {
      setLastRefreshTime(new Date());
      // Show notification for automatic refresh (but not for initial load)
      if (invites.length > 0) {
        setShowRefreshNotification(true);
        setTimeout(() => setShowRefreshNotification(false), 3000);
      }
    }
  }, [invites, invitesLoading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Auto-refresh notification */}
      {showRefreshNotification && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center space-x-2">
          <span>🔄</span>
          <span>Data automatically refreshed</span>
        </div>
      )}
      <div className="flex">
        {/* Left Sidebar Navigation */}
        <div className="w-80 bg-slate-800/50 backdrop-blur-sm border-r border-slate-700/50 min-h-screen">
          {/* Header */}
          <div className="p-6 border-b border-slate-700/50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-lg">⚙️</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-slate-400 text-sm">System Management</p>
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="p-4 space-y-2">
            <button
              onClick={() => handleTabChange('users')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                activeTab === 'users' 
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-xl">{usersLoading ? '⏳' : '👥'}</span>
              <div>
                <div className="font-medium">User Management</div>
                <div className="text-xs opacity-75">
                  {usersLoading ? 'Refreshing...' : `${users?.length || 0} users`}
                </div>
              </div>
            </button>
            
            <button
              onClick={() => handleTabChange('invites')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                activeTab === 'invites' 
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-xl">{invitesLoading ? '⏳' : '📧'}</span>
              <div>
                <div className="font-medium">Invite System</div>
                <div className="text-xs opacity-75">
                  {invitesLoading ? 'Refreshing...' : `${invites?.length || 0} active codes`}
                </div>
              </div>
            </button>
            
            <button
              onClick={() => handleTabChange('streaming')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                activeTab === 'streaming' 
                  ? 'bg-red-600/20 text-red-300 border border-red-600/30' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-xl">🎬</span>
              <div>
                <div className="font-medium">Streaming Control</div>
                <div className="text-xs opacity-75">Monitor & manage streams</div>
              </div>
            </button>
            
            <button
              onClick={() => handleTabChange('storage')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                activeTab === 'storage' 
                  ? 'bg-green-600/20 text-green-300 border border-green-600/30' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-xl">💾</span>
              <div>
                <div className="font-medium">Storage Management</div>
                <div className="text-xs opacity-75">Optimize & analyze</div>
              </div>
            </button>
            
            <button
              onClick={() => handleTabChange('error-testing')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                activeTab === 'error-testing' 
                  ? 'bg-orange-600/20 text-orange-300 border border-orange-600/30' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-xl">🧪</span>
              <div>
                <div className="font-medium">Error Testing</div>
                <div className="text-xs opacity-75">Test error tracking</div>
              </div>
            </button>
            <button
              onClick={() => handleTabChange('support-whitelist')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                activeTab === 'support-whitelist' 
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-xl">📧</span>
              <div>
                <div className="font-medium">Support Whitelist</div>
                <div className="text-xs opacity-75">Manage admin recipients</div>
              </div>
            </button>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-8 overflow-auto">

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">User Management</h2>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    queryClient.invalidateQueries(['users']);
                    queryClient.invalidateQueries(['invites']);
                    setLastRefreshTime(new Date());
                  }}
                  disabled={usersLoading || invitesLoading}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg text-sm font-semibold transition-all duration-200 transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center space-x-2"
                >
                  <span className={usersLoading || invitesLoading ? 'animate-spin' : ''}>🔄</span>
                  <span>{usersLoading || invitesLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                <div className="text-sm text-slate-400">
                  Total: {users?.length || 0} users
                  <div className="text-xs text-slate-500">
                    Last updated: {lastRefreshTime.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
            
            {usersLoading ? (
              <div className="card-modern p-12 text-center">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading users...</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block card-modern overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {users?.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-700/30 transition-colors duration-200">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                                {user.username?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-white">{user.username}</div>
                                <div className="text-sm text-slate-400">{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`role-badge ${user.role || (user.is_admin ? 'admin' : 'user')}`}>
                              {user.role === 'admin' && '👑 Admin'}
                              {user.role === 'manager' && '🎬 Manager'}
                              {(user.role === 'user' || (!user.role && !user.is_admin)) && '👤 User'}
                              {user.is_admin && !user.role && '👑 Admin'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full ${
                              user.is_active 
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}>
                              <div className={`w-2 h-2 rounded-full mr-2 ${user.is_active ? 'bg-green-400' : 'bg-red-400'}`}></div>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex flex-col space-y-2">
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => handleRoleChange(user.id, user.username, 'user')}
                                  disabled={updateRoleMutation.isLoading}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 shadow-md ${
                                    (user.role || (user.is_admin ? 'admin' : 'user')) === 'user'
                                      ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg ring-2 ring-gray-400 ring-opacity-50'
                                      : 'bg-gradient-to-r from-gray-600 to-gray-700 text-gray-200 hover:from-gray-500 hover:to-gray-600 hover:text-white hover:shadow-lg'
                                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                                >
                                  👤 User
                                </button>
                                <button
                                  onClick={() => handleRoleChange(user.id, user.username, 'manager')}
                                  disabled={updateRoleMutation.isLoading}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 shadow-md ${
                                    (user.role || (user.is_admin ? 'admin' : 'user')) === 'manager'
                                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50'
                                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-blue-100 hover:from-blue-500 hover:to-blue-600 hover:text-white hover:shadow-lg'
                                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                                >
                                  🎬 Manager
                                </button>
                                <button
                                  onClick={() => handleRoleChange(user.id, user.username, 'admin')}
                                  disabled={updateRoleMutation.isLoading}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 shadow-md ${
                                    (user.role || (user.is_admin ? 'admin' : 'user')) === 'admin'
                                      ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg ring-2 ring-purple-400 ring-opacity-50'
                                      : 'bg-gradient-to-r from-purple-600 to-purple-700 text-purple-100 hover:from-purple-500 hover:to-purple-600 hover:text-white hover:shadow-lg'
                                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                                >
                                  👑 Admin
                                </button>
                              </div>
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Reset rate limiting for user "${user.username}"? This will clear any current rate limits.`)) {
                                      resetUserRateLimit(user.id, user.username);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                  title="Reset rate limiting for this user"
                                >
                                  ⚡ Reset Rate Limit
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id, user.username)}
                                  className="px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                  disabled={deleteUserMutation.isLoading}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {users?.map((user) => (
                    <div key={user.id} className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-white">{user.username}</h3>
                          <p className="text-sm text-gray-400">{user.email}</p>
                        </div>
                        <div className="flex flex-col space-y-1">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(user.role || (user.is_admin ? 'admin' : 'user'))}`}>
                            {user.role_display_name || (user.is_admin ? 'Administrator' : 'User')}
                          </span>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mb-3">
                        Created: {formatDate(user.created_at)}
                      </div>
                      <div className="flex flex-col space-y-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Change Role:</label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => handleRoleChange(user.id, user.username, 'user')}
                              disabled={updateRoleMutation.isLoading}
                              className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 shadow-md ${
                                (user.role || (user.is_admin ? 'admin' : 'user')) === 'user'
                                  ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg ring-2 ring-gray-400 ring-opacity-50'
                                  : 'bg-gradient-to-r from-gray-600 to-gray-700 text-gray-200 hover:from-gray-500 hover:to-gray-600 hover:text-white hover:shadow-lg'
                              } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                            >
                              <div className="flex flex-col items-center space-y-1">
                                <span className="text-sm">👤</span>
                                <span>User</span>
                              </div>
                            </button>
                            <button
                              onClick={() => handleRoleChange(user.id, user.username, 'manager')}
                              disabled={updateRoleMutation.isLoading}
                              className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 shadow-md ${
                                (user.role || (user.is_admin ? 'admin' : 'user')) === 'manager'
                                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50'
                                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-blue-100 hover:from-blue-500 hover:to-blue-600 hover:text-white hover:shadow-lg'
                              } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                            >
                              <div className="flex flex-col items-center space-y-1">
                                <span className="text-sm">🎬</span>
                                <span>Manager</span>
                              </div>
                            </button>
                            <button
                              onClick={() => handleRoleChange(user.id, user.username, 'admin')}
                              disabled={updateRoleMutation.isLoading}
                              className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 shadow-md ${
                                (user.role || (user.is_admin ? 'admin' : 'user')) === 'admin'
                                  ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg ring-2 ring-purple-400 ring-opacity-50'
                                  : 'bg-gradient-to-r from-purple-600 to-purple-700 text-purple-100 hover:from-purple-500 hover:to-purple-600 hover:text-white hover:shadow-lg'
                              } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                            >
                              <div className="flex flex-col items-center space-y-1">
                                <span className="text-sm">👑</span>
                                <span>Admin</span>
                              </div>
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          className="w-full px-3 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                          disabled={deleteUserMutation.isLoading}
                        >
                          🗑️ Delete User
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Invites Tab */}
        {activeTab === 'invites' && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Invite Code Management</h2>
            
            {/* Create Invite Forms */}
            <div className="space-y-6 mb-6 md:mb-8">
              {/* Regular Invite Form */}
              <div className="bg-gray-800 rounded-lg p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-4">📝 Create New Invite Code</h3>
                <form onSubmit={handleCreateInvite} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Expires In (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={inviteForm.expiresInDays}
                        onChange={(e) => setInviteForm({...inviteForm, expiresInDays: parseInt(e.target.value)})}
                        disabled={inviteForm.isIndefinite}
                        className="w-full px-3 py-3 md:py-2 bg-gray-700 border border-gray-600 rounded-md text-white disabled:opacity-50 text-base"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Max Uses
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={inviteForm.maxUses}
                        onChange={(e) => setInviteForm({...inviteForm, maxUses: parseInt(e.target.value)})}
                        className="w-full px-3 py-3 md:py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-base"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={inviteForm.isIndefinite}
                          onChange={(e) => setInviteForm({...inviteForm, isIndefinite: e.target.checked})}
                          className="rounded bg-gray-700 border-gray-600 text-blue-600 w-5 h-5"
                        />
                        <span className="text-sm text-gray-300">Indefinite (Auto-renewing)</span>
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={createInviteMutation.isLoading}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50 text-base"
                  >
                    {createInviteMutation.isLoading ? 'Creating...' : 'Create Invite Code'}
                  </button>
                </form>
              </div>

              {/* Email Invite Form */}
              <div className="bg-gray-800 rounded-lg p-4 md:p-6">
                <h3 className="text-lg font-semibold mb-4">📧 Send Invite via Email</h3>
                <form onSubmit={handleSendEmailInvite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={emailInviteForm.email}
                      onChange={(e) => setEmailInviteForm({...emailInviteForm, email: e.target.value})}
                      placeholder="user@example.com"
                      className="w-full px-3 py-3 md:py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-base"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Expires In (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={emailInviteForm.expiresInDays}
                        onChange={(e) => setEmailInviteForm({...emailInviteForm, expiresInDays: parseInt(e.target.value)})}
                        disabled={emailInviteForm.isIndefinite}
                        className="w-full px-3 py-3 md:py-2 bg-gray-700 border border-gray-600 rounded-md text-white disabled:opacity-50 text-base"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Max Uses
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={emailInviteForm.maxUses}
                        onChange={(e) => setEmailInviteForm({...emailInviteForm, maxUses: parseInt(e.target.value)})}
                        className="w-full px-3 py-3 md:py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-base"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={emailInviteForm.isIndefinite}
                          onChange={(e) => setEmailInviteForm({...emailInviteForm, isIndefinite: e.target.checked})}
                          className="rounded bg-gray-700 border-gray-600 text-blue-600 w-5 h-5"
                        />
                        <span className="text-sm text-gray-300">Indefinite (Auto-renewing)</span>
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={sendEmailInviteMutation.isLoading}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium disabled:opacity-50 text-base"
                  >
                    {sendEmailInviteMutation.isLoading ? 'Sending...' : '📧 Send Invite Email'}
                  </button>
                </form>
              </div>
            </div>

            {/* Invite Codes List Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Invite Codes</h3>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    queryClient.invalidateQueries(['invites']);
                    setLastRefreshTime(new Date());
                  }}
                  disabled={invitesLoading}
                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white rounded-lg text-sm font-semibold transition-all duration-200 transform hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center space-x-2"
                >
                  <span className={invitesLoading ? 'animate-spin' : ''}>🔄</span>
                  <span>{invitesLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                <div className="text-sm text-slate-400">
                  Total: {invites?.length || 0} codes
                  <div className="text-xs text-slate-500">
                    Last updated: {lastRefreshTime.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Invite Codes List */}
            {invitesLoading ? (
              <div className="text-center py-8">Loading invite codes...</div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block bg-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Usage
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Used By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Expires
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {invites?.map((invite) => {
                        const statusInfo = getInviteStatus(invite);
                        return (
                          <tr key={invite.id} className="hover:bg-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-mono text-sm bg-gray-700 px-2 py-1 rounded">
                                {invite.token.substring(0, 16)}...
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full text-white ${statusInfo.color}`}>
                                {statusInfo.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                              {invite.current_uses} / {invite.max_uses === -1 ? '∞' : invite.max_uses}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                              {invite.used_by_username ? (
                                <div>
                                  <div className="font-medium text-white">{invite.used_by_display_name || invite.used_by_username}</div>
                                  <div className="text-xs text-gray-500">{invite.used_by_email}</div>
                                  {invite.used_at && <div className="text-xs text-gray-500">{formatDate(invite.used_at)}</div>}
                                </div>
                              ) : (
                                <span className="text-gray-500">Not used</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                              {invite.is_indefinite ? 'Never (Auto-renewing)' : formatDate(invite.expires_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                              {formatDate(invite.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(invite.token);
                                  alert('Invite code copied to clipboard!');
                                }}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium mr-2"
                              >
                                Copy
                              </button>
                              <button
                                onClick={() => deleteInviteMutation.mutate(invite.token)}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                                disabled={deleteInviteMutation.isLoading}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {invites?.length === 0 ? (
                    <div className="bg-gray-800 rounded-lg p-6 text-center">
                      <div className="text-gray-400 mb-2">📝</div>
                      <h3 className="text-lg font-medium text-white mb-2">No Invite Codes</h3>
                      <p className="text-gray-400 text-sm">Create your first invite code above to get started.</p>
                    </div>
                  ) : (
                    invites?.map((invite) => {
                      const statusInfo = getInviteStatus(invite);
                      return (
                        <div key={invite.id} className="bg-gray-800 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="font-mono text-sm bg-gray-700 px-3 py-2 rounded mb-2 break-all">
                                {invite.token.substring(0, 24)}...
                              </div>
                              <div className="flex items-center space-x-2 mb-2">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full text-white ${statusInfo.color}`}>
                                  {statusInfo.status}
                                </span>
                                <span className="text-sm text-gray-400">
                                  {invite.current_uses} / {invite.max_uses === -1 ? '∞' : invite.max_uses} uses
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-2 text-sm text-gray-400 mb-4">
                            <div>
                              <span className="font-medium">Expires:</span> {invite.is_indefinite ? 'Never (Auto-renewing)' : formatDate(invite.expires_at)}
                            </div>
                            <div>
                              <span className="font-medium">Created:</span> {formatDate(invite.created_at)}
                            </div>
                            {invite.used_by_username ? (
                              <div>
                                <span className="font-medium">Used by:</span>
                                <div className="ml-2 mt-1">
                                  <div className="font-medium text-white">{invite.used_by_display_name || invite.used_by_username}</div>
                                  <div className="text-xs text-gray-500">{invite.used_by_email}</div>
                                  {invite.used_at && <div className="text-xs text-gray-500">on {formatDate(invite.used_at)}</div>}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="font-medium">Used by:</span> <span className="text-gray-500">Not used yet</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col space-y-2">
                            <button
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(invite.token);
                                  // Use a more mobile-friendly notification
                                  const notification = document.createElement('div');
                                  notification.textContent = 'Invite code copied!';
                                  notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-md z-50 text-sm';
                                  document.body.appendChild(notification);
                                  setTimeout(() => document.body.removeChild(notification), 2000);
                                } catch (err) {
                                  // Fallback for older browsers
                                  const textArea = document.createElement('textarea');
                                  textArea.value = invite.token;
                                  document.body.appendChild(textArea);
                                  textArea.select();
                                  document.execCommand('copy');
                                  document.body.removeChild(textArea);
                                  alert('Invite code copied to clipboard!');
                                }
                              }}
                              className="w-full px-3 py-3 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium touch-target"
                            >
                              📋 Copy Invite Code
                            </button>
                            <button
                              onClick={() => {
                                const confirmMessage = `⚠️ DELETE INVITE CODE\n\nCode: ${invite.token.substring(0, 16)}...\nStatus: ${statusInfo.status}\nUses: ${invite.current_uses}/${invite.max_uses === -1 ? '∞' : invite.max_uses}\n\n❌ This action CANNOT be undone!\n\nAre you sure you want to delete this invite code?`;
                                
                                if (window.confirm(confirmMessage)) {
                                  deleteInviteMutation.mutate(invite.token);
                                }
                              }}
                              className="w-full px-3 py-3 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium touch-target"
                              disabled={deleteInviteMutation.isLoading}
                            >
                              {deleteInviteMutation.isLoading ? '🗑️ Deleting...' : '🗑️ Delete Invite Code'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
               </>
            )}
          </div>
        )}

        {/* Streaming Management Tab */}
        {activeTab === 'streaming' && (
          <div className="space-y-8">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-red-500 bg-clip-text text-transparent mb-2">
                🎬 Streaming Management
              </h1>
              <p className="text-slate-400">
                Monitor active streams, analyze bandwidth usage, and manage server performance
              </p>
            </div>

            {/* Active Streams Section */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span>🔴</span>
                  <span>Active Streaming Sessions</span>
                </h2>
                <button
                  onClick={() => {
                    fetchActiveStreams();
                    fetchMonthlyBandwidthData();
                  }}
                  disabled={activeStreamsLoading || monthlyBandwidthLoading}
                  className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition-colors font-medium disabled:opacity-50"
                >
                  {activeStreamsLoading ? '🔄 Refreshing...' : '🔄 Refresh Streams'}
                </button>
              </div>

              {activeStreams.length > 0 ? (
                <div className="space-y-3">
                  {activeStreams.map((stream, index) => (
                    <div key={stream.id || index} className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <div className="text-white font-semibold truncate">
                              {stream.title || 'Unknown Content'}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-slate-400">User</div>
                              <div className="text-white font-medium">{stream.username || 'Unknown'}</div>
                            </div>
                            <div>
                              <div className="text-slate-400">Quality</div>
                              <div className="text-white font-medium">{stream.quality || 'Auto'}</div>
                            </div>
                            <div>
                              <div className="text-slate-400">Bandwidth</div>
                              <div className="text-white font-medium">{stream.bandwidth || 0} GB/s</div>
                            </div>
                            <div>
                              <div className="text-slate-400">Duration</div>
                              <div className="text-white font-medium">{stream.duration || '0:00'}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-400">
                            IP: {stream.clientIP || 'Unknown'} • Started: {stream.startTime ? new Date(stream.startTime).toLocaleString() : 'Unknown'}
                          </div>
                        </div>
                        <div className="ml-6">
                          <button
                            onClick={() => {
                              if (window.confirm(`Terminate stream for "${stream.username}"?\n\nContent: ${stream.title}\nThis will immediately end their streaming session.`)) {
                                terminateStream(stream.id);
                              }
                            }}
                            className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors font-medium"
                          >
                            🛑 Terminate
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📺</span>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">No Active Streams</h3>
                  <p className="text-slate-400 text-sm">All streaming sessions have ended</p>
                </div>
              )}
            </div>

            {/* User Rate Limit Management Section */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span>⚡</span>
                  <span>User Rate Limit Management</span>
                </h2>
                <button
                  onClick={() => {
                    fetchUsers();
                    fetchActiveStreams();
                  }}
                  disabled={usersLoading || activeStreamsLoading}
                  className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition-colors font-medium disabled:opacity-50"
                >
                  {usersLoading ? '🔄 Refreshing...' : '🔄 Refresh Users'}
                </button>
              </div>

              {users.length > 0 ? (
                <div className="space-y-3">
                  {users.map((user) => (
                    <div key={user.id} className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className={`w-3 h-3 rounded-full ${
                              user.is_active ? 'bg-green-500' : 'bg-slate-500'
                            }`}></div>
                            <div className="text-white font-semibold truncate">
                              {user.username}
                            </div>
                            {user.role === 'admin' && (
                              <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded-full border border-purple-600/30">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-slate-400">Email</div>
                              <div className="text-white font-medium truncate">{user.email}</div>
                            </div>
                            <div>
                              <div className="text-slate-400">Status</div>
                              <div className={`font-medium ${
                                user.is_active ? 'text-green-400' : 'text-slate-400'
                              }`}>
                                {user.is_active ? 'Active' : 'Inactive'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400">Role</div>
                              <div className={`font-medium ${getRoleColor(user.role)}`}>
                                {user.role}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400">Joined</div>
                              <div className="text-white font-medium">{formatDate(user.created_at)}</div>
                            </div>
                          </div>
                        </div>
                        <div className="ml-6 flex space-x-2">
                          <button
                            onClick={() => {
                              if (window.confirm(`Reset rate limit for user "${user.username}"?\n\nThis will clear all rate limiting restrictions for this user, allowing them to make requests normally.`)) {
                                resetUserRateLimit(user.id, user.username);
                              }
                            }}
                            className="px-4 py-2 bg-orange-600/20 text-orange-400 border border-orange-600/30 rounded-lg hover:bg-orange-600/30 transition-colors font-medium"
                          >
                            ⚡ Reset Rate Limit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">👥</span>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">No Users Found</h3>
                  <p className="text-slate-400 text-sm">No users are currently registered on the server</p>
                </div>
              )}
            </div>

            {/* Streaming Settings Management Section */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <span>⚙️</span>
                  <span>Server-Wide Bandwidth Controls</span>
                </h2>
                <button
                  onClick={fetchStreamingSettings}
                  disabled={streamingSettingsLoading}
                  className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition-colors font-medium disabled:opacity-50"
                >
                  {streamingSettingsLoading ? '🔄 Loading...' : '🔄 Refresh Settings'}
                </button>
              </div>

              {streamingSettings ? (
                <div className="space-y-6">
                  {/* Current Settings Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Max Resolution</div>
                      <div className="text-white text-lg font-bold">{streamingSettings.maxResolution}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Bitrate Limit</div>
                      <div className="text-white text-lg font-bold">{streamingSettings.bitrateLimit} Mbps</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Bandwidth Limit</div>
                      <div className="text-white text-lg font-bold">{streamingSettings.totalBandwidthLimit} GB</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Per-User Limit</div>
                      <div className="text-white text-lg font-bold">{streamingSettings.perUserBandwidthLimit} GB</div>
                    </div>
                  </div>

                  {/* Settings Form */}
                  <div className="bg-slate-700/20 rounded-lg p-6">
                    <h3 className="text-white font-semibold mb-4">Update Bandwidth Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Maximum Resolution
                        </label>
                        <select
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={streamingSettingsForm.maxResolution}
                          onChange={(e) => setStreamingSettingsForm(prev => ({ ...prev, maxResolution: e.target.value }))}
                        >
                          <option value="480p">480p (SD)</option>
                          <option value="720p">720p (HD)</option>
                          <option value="1080p">1080p (Full HD)</option>
                          <option value="4k">4K (Ultra HD)</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Maximum video resolution allowed for streaming</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Bitrate Limit (Mbps)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={streamingSettingsForm.bitrateLimit}
                          onChange={(e) => setStreamingSettingsForm(prev => ({ ...prev, bitrateLimit: e.target.value }))}
                        />
                        <p className="text-xs text-slate-400 mt-1">Maximum bitrate per stream in Mbps</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Total Server Bandwidth Limit (GB)
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="10000"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={streamingSettingsForm.totalBandwidthLimit}
                          onChange={(e) => setStreamingSettingsForm(prev => ({ ...prev, totalBandwidthLimit: e.target.value }))}
                        />
                        <p className="text-xs text-slate-400 mt-1">Maximum total bandwidth usage across all users</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Per-User Bandwidth Limit (GB)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={streamingSettingsForm.perUserBandwidthLimit}
                          onChange={(e) => setStreamingSettingsForm(prev => ({ ...prev, perUserBandwidthLimit: e.target.value }))}
                        />
                        <p className="text-xs text-slate-400 mt-1">Maximum bandwidth usage per individual user</p>
                      </div>
                    </div>

                    <div className="mt-6 flex space-x-4">
                      <button
                        onClick={saveStreamingSettings}
                        disabled={savingSettings}
                        className="px-6 py-3 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition-colors font-semibold disabled:opacity-50"
                      >
                        {savingSettings ? '💾 Saving...' : '💾 Save Settings'}
                      </button>
                      <button
                        onClick={() => {
                          setStreamingSettingsForm({
                            maxResolution: streamingSettings.maxResolution || '1080p',
                            bitrateLimit: streamingSettings.bitrateLimit || '20',
                            totalBandwidthLimit: streamingSettings.totalBandwidthLimit || '150',
                            perUserBandwidthLimit: streamingSettings.perUserBandwidthLimit || '25'
                          });
                        }}
                        className="px-6 py-3 bg-slate-600/20 text-slate-400 border border-slate-600/30 rounded-lg hover:bg-slate-600/30 transition-colors font-semibold"
                      >
                        🔄 Reset to Current
                      </button>
                    </div>
                  </div>

                  {/* Bandwidth Usage Status */}
                  {monthlyBandwidthData?.analytics?.monthlyStats && (
                    <div className="bg-slate-700/20 rounded-lg p-6">
                      <h3 className="text-white font-semibold mb-4">Current Bandwidth Usage Status</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Current Month Usage</div>
                          <div className="text-white text-lg font-bold">
                            {monthlyBandwidthData.analytics.monthlyStats.totalBandwidth} GB
                          </div>
                          <div className="text-xs text-slate-400">
                            of {streamingSettings.totalBandwidthLimit} GB limit
                          </div>
                          <div className="mt-2">
                            <div className="w-full bg-slate-600 rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ 
                                  width: `${Math.min((parseFloat(monthlyBandwidthData.analytics.monthlyStats.totalBandwidth) / parseFloat(streamingSettings.totalBandwidthLimit)) * 100, 100)}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Active Users</div>
                          <div className="text-white text-lg font-bold">
                            {monthlyBandwidthData.analytics.monthlyStats.activeUsers}
                          </div>
                          <div className="text-xs text-slate-400">
                            users streaming this month
                          </div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Average Per User</div>
                          <div className="text-white text-lg font-bold">
                            {monthlyBandwidthData.analytics.monthlyStats.avgBandwidthPerUser} GB
                          </div>
                          <div className="text-xs text-slate-400">
                            of {streamingSettings.perUserBandwidthLimit} GB limit
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">⚙️</span>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">No Settings Found</h3>
                  <p className="text-slate-400 text-sm">Click "Refresh Settings" to load current bandwidth controls</p>
                </div>
              )}
            </div>

            {/* Bandwidth Investigation Section */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center space-x-2">
                <span>🔍</span>
                <span>Bandwidth Investigation</span>
              </h2>

              {/* Investigation Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">User Filter</label>
                  <input
                    type="text"
                    placeholder="Username (optional)"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={investigationFilters.userId}
                    onChange={(e) => setInvestigationFilters(prev => ({ ...prev, userId: e.target.value }))}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Period Type</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={investigationFilters.periodType}
                    onChange={(e) => setInvestigationFilters(prev => ({ ...prev, periodType: e.target.value }))}
                  >
                    <option value="all">All Time</option>
                    <option value="month">Specific Month</option>
                    <option value="monthRange">Month Range</option>
                    <option value="dayRange">Custom Date Range</option>
                  </select>
                </div>

                {investigationFilters.periodType === 'month' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Month</label>
                    <input
                      type="month"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={investigationFilters.period}
                      onChange={(e) => setInvestigationFilters(prev => ({ ...prev, period: e.target.value }))}
                    />
                  </div>
                )}

                {(investigationFilters.periodType === 'monthRange' || investigationFilters.periodType === 'dayRange') && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        {investigationFilters.periodType === 'monthRange' ? 'Start Month' : 'Start Date'}
                      </label>
                      <input
                        type={investigationFilters.periodType === 'monthRange' ? 'month' : 'date'}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={investigationFilters.period}
                        onChange={(e) => setInvestigationFilters(prev => ({ ...prev, period: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        {investigationFilters.periodType === 'monthRange' ? 'End Month' : 'End Date'}
                      </label>
                      <input
                        type={investigationFilters.periodType === 'monthRange' ? 'month' : 'date'}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={investigationFilters.periodEnd}
                        onChange={(e) => setInvestigationFilters(prev => ({ ...prev, periodEnd: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Results Limit</label>
                  <select
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={investigationFilters.limit}
                    onChange={(e) => setInvestigationFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
                  >
                    <option value={25}>25 results</option>
                    <option value={50}>50 results</option>
                    <option value={100}>100 results</option>
                    <option value={200}>200 results</option>
                  </select>
                </div>
              </div>

              {/* Investigation Buttons */}
              <div className="mb-6 flex space-x-4">
                <button
                  onClick={() => fetchBandwidthInvestigation(investigationFilters)}
                  disabled={bandwidthInvestigationLoading}
                  className="px-6 py-3 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition-colors font-semibold disabled:opacity-50"
                >
                  {bandwidthInvestigationLoading ? '🔍 Investigating...' : '🔍 Start Investigation'}
                </button>
                {bandwidthInvestigationData && (
                  <button
                    onClick={() => setShowInvestigationModal(true)}
                    className="px-6 py-3 bg-purple-600/20 text-purple-400 border border-purple-600/30 rounded-lg hover:bg-purple-600/30 transition-colors font-semibold"
                  >
                    📋 View Detailed Sessions
                  </button>
                )}
              </div>

              {/* Investigation Results */}
              {bandwidthInvestigationData && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Sessions</div>
                      <div className="text-white text-2xl font-bold">{bandwidthInvestigationData.summary?.totalSessions || 0}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Users</div>
                      <div className="text-white text-2xl font-bold">{bandwidthInvestigationData.summary?.totalUsers || 0}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Bandwidth</div>
                      <div className="text-white text-2xl font-bold">{formatBandwidth(bandwidthInvestigationData.summary?.totalBandwidth || 0)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Avg Daily Usage</div>
                      <div className="text-white text-2xl font-bold">
                        {bandwidthInvestigationData.dailyBreakdown?.length > 0
                          ? formatBandwidth(
                              bandwidthInvestigationData.dailyBreakdown.reduce((sum, d) => sum + (d.total_bandwidth || 0), 0) / 
                              bandwidthInvestigationData.dailyBreakdown.length
                            )
                          : '0 B'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Daily Breakdown */}
                  {bandwidthInvestigationData.dailyBreakdown?.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">Daily Usage Breakdown</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {bandwidthInvestigationData.dailyBreakdown.map((day, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                            <div>
                              <div className="text-white font-medium">{new Date(day.date).toLocaleDateString()}</div>
                              <div className="text-slate-400 text-xs">{day.session_count} sessions</div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-semibold">{formatBandwidth(day.total_bandwidth)}</div>
                              <div className="text-slate-400 text-xs">{formatDuration(day.total_duration)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!bandwidthInvestigationData && !bandwidthInvestigationLoading && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🔍</span>
                  </div>
                  <h4 className="text-white font-semibold text-lg mb-2">No Investigation Data</h4>
                  <p className="text-slate-400 text-sm mb-4">Click "Start Investigation" to analyze bandwidth usage</p>
                </div>
              )}
            </div>

            {/* Server Bandwidth Analytics Section */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center space-x-2">
                <span>📈</span>
                <span>Server Bandwidth Analytics</span>
              </h2>

              {/* Analytics Button */}
              <div className="mb-6">
                <button
                  onClick={fetchMonthlyBandwidthData}
                  disabled={monthlyBandwidthLoading}
                  className="px-6 py-3 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition-colors font-semibold disabled:opacity-50"
                >
                  {monthlyBandwidthLoading ? '📊 Loading Analytics...' : '📊 Load Server Analytics'}
                </button>
              </div>

              {/* Server Analytics Results */}
              {monthlyBandwidthData && (
                <div className="space-y-6">
                  {/* Current Analytics Overview */}
                  {monthlyBandwidthData.analytics && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">Current Server Status</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Active Streams</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.activeStreamCount || 0}</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Current Bandwidth</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.totalBandwidth || 0} GB/s</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Peak Concurrent</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.peakConcurrent || 0}</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Avg Quality</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.avgQuality || 'Auto'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Monthly Statistics */}
                  {monthlyBandwidthData.analytics?.monthlyStats && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">
                        📅 Monthly Statistics ({monthlyBandwidthData.analytics.monthlyStats.currentPeriod?.start} to {monthlyBandwidthData.analytics.monthlyStats.currentPeriod?.end})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Total Bandwidth</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.monthlyStats.totalBandwidth} GB</div>
                          <div className="text-xs text-slate-500">
                            {monthlyBandwidthData.analytics.monthlyStats.trends?.bandwidthGrowth === 'increasing' ? '📈' : 
                             monthlyBandwidthData.analytics.monthlyStats.trends?.bandwidthGrowth === 'decreasing' ? '📉' : '➡️'} 
                            {monthlyBandwidthData.analytics.monthlyStats.trends?.bandwidthGrowth}
                          </div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Total Streams</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.monthlyStats.totalStreams}</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Active Users</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.monthlyStats.activeUsers}</div>
                          <div className="text-xs text-slate-500">
                            {monthlyBandwidthData.analytics.monthlyStats.trends?.userGrowth === 'increasing' ? '📈' : 
                             monthlyBandwidthData.analytics.monthlyStats.trends?.userGrowth === 'decreasing' ? '📉' : '➡️'} 
                            {monthlyBandwidthData.analytics.monthlyStats.trends?.userGrowth}
                          </div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Avg Session Length</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.monthlyStats.avgSessionLength}m</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Avg Bandwidth/User</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.monthlyStats.avgBandwidthPerUser} GB</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Max User Bandwidth</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.monthlyStats.maxBandwidthUser} GB</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Total Duration</div>
                          <div className="text-white text-lg font-bold">{formatDuration(monthlyBandwidthData.analytics.monthlyStats.totalDuration)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Users by Bandwidth */}
                  {monthlyBandwidthData.analytics?.topUsers && monthlyBandwidthData.analytics.topUsers.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">🏆 Top Users by Bandwidth (This Month)</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {monthlyBandwidthData.analytics.topUsers.map((user, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <div className="text-slate-400 text-sm w-6">#{index + 1}</div>
                              <div>
                                <div className="text-white font-medium">{user.username}</div>
                                <div className="text-slate-400 text-xs">
                                  {user.streams} streams • {formatDuration(user.duration)}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-semibold">{user.bandwidth} GB</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historical Data */}
                  {monthlyBandwidthData.analytics?.serverHistory && monthlyBandwidthData.analytics.serverHistory.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">📊 Server History (Last 6 Months)</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {monthlyBandwidthData.analytics.serverHistory.map((record, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                            <div>
                              <div className="text-white font-medium">{record.period}</div>
                              <div className="text-slate-400 text-xs">
                                {record.activeUsers} users • {record.streams} streams
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-semibold">{record.bandwidth} GB</div>
                              <div className="text-slate-400 text-xs">{formatDuration(record.duration)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Streams */}
                  {monthlyBandwidthData.activeStreams && monthlyBandwidthData.activeStreams.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">Currently Active Streams</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {monthlyBandwidthData.activeStreams.map((stream, index) => {
                          return (
                            <div key={index} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-medium truncate">{stream.title || 'Unknown Content'}</div>
                                <div className="text-slate-400 text-xs">
                                  {stream.username || 'Unknown User'} • {stream.quality || 'Auto'} • {stream.clientIP || 'Unknown IP'}
                                </div>
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-white font-semibold">{stream.bandwidth || 0} GB/s</div>
                                <div className="text-slate-400 text-xs">{stream.duration || '0:00'}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Daily Stats */}
                  {monthlyBandwidthData.analytics?.dailyStats && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">Daily Statistics</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Total Streams Today</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.dailyStats.totalStreams || 0}</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Bandwidth Used Today</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.dailyStats.totalBandwidthUsed || 0} GB</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4">
                          <div className="text-slate-400 text-sm">Peak Concurrent Today</div>
                          <div className="text-white text-lg font-bold">{monthlyBandwidthData.analytics.dailyStats.peakConcurrentToday || 0}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!monthlyBandwidthData && !monthlyBandwidthLoading && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📈</span>
                  </div>
                  <h4 className="text-white font-semibold text-lg mb-2">No Analytics Data</h4>
                  <p className="text-slate-400 text-sm mb-4">Click "Load Server Analytics" to view bandwidth statistics</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Storage Management Tab */}
        {activeTab === 'storage' && (
          <div>
            {/* Storage Sub-tab Navigation */}
            <div className="flex space-x-1 bg-gray-800/50 p-1 rounded-lg mb-6">
              <button
                onClick={() => setStorageSubTab('optimization')}
                className={`flex-1 px-4 py-2 rounded-md transition-colors text-sm ${
                  storageSubTab === 'optimization'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                🚀 Optimization
              </button>
              <button
                onClick={() => setStorageSubTab('analysis')}
                className={`flex-1 px-4 py-2 rounded-md transition-colors text-sm ${
                  storageSubTab === 'analysis'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                📊 Analysis
              </button>
            </div>

            {/* Storage Sub-tab Content */}
            {storageSubTab === 'optimization' && <StorageOptimization />}
            {storageSubTab === 'analysis' && <StorageAnalysis />}
          </div>
        )}

        {/* Error Testing Tab */}
        {activeTab === 'error-testing' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold text-white">Error Tracking Test Panel</h2>
                <span className="px-3 py-1 bg-orange-600/20 text-orange-300 border border-orange-600/30 rounded-full text-sm font-medium">
                  🧪 Active Tab
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-slate-400">
                  Test the enhanced error tracking system
                </div>
              </div>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-8 text-center">
              <div className="text-6xl mb-4">🧪</div>
              <h3 className="text-xl font-bold text-white mb-4">Error Testing Panel</h3>
              <p className="text-slate-400 mb-6">
                Click the button below to open the comprehensive error testing panel in a new tab.
              </p>
              <a
                href="/error-test"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg text-lg font-semibold transition-all duration-200 transform hover:scale-105 shadow-md space-x-2"
              >
                <span>🧪</span>
                <span>Test Client/Server Error Pages</span>
              </a>
              <div className="text-sm text-slate-500 mt-6">
                Test 4xx client errors and 5xx server errors separately with comprehensive API testing and React page viewing capabilities. Includes 9 client errors (400-429) and 6 server errors (500-505).
              </div>
            </div>
          </div>
        )}

        {/* Support Whitelist Tab */}
        {activeTab === 'support-whitelist' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Support Email Whitelist</h2>
              <div className="text-sm text-slate-400">
                Manage admin recipients for contact support emails
              </div>
            </div>
            
            <AdminWhitelistManager />
          </div>
        )}

        {/* Bandwidth Investigation Details Modal */}
        {showInvestigationModal && bandwidthInvestigationData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-slate-800 rounded-xl p-6 max-w-6xl w-full shadow-2xl relative overflow-y-auto max-h-[90vh]">
              <button
                className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl"
                onClick={() => setShowInvestigationModal(false)}
                aria-label="Close"
              >
                ×
              </button>
              
              <h2 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
                <span>📋</span>
                <span>Detailed Session Analysis</span>
              </h2>

              {/* Tab Navigation */}
              <div className="flex mb-6 bg-slate-700/30 rounded-lg p-1">
                <button
                  onClick={() => setInvestigationDetailsTab('summary')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    investigationDetailsTab === 'summary'
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-600/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📊 Enhanced Summary
                </button>
                <button
                  onClick={() => setInvestigationDetailsTab('sessions')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    investigationDetailsTab === 'sessions'
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-600/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📝 All Sessions ({bandwidthInvestigationData.sessions?.length || 0})
                </button>
              </div>

              {/* Enhanced Summary Tab */}
              {investigationDetailsTab === 'summary' && (
                <div className="space-y-6">
                  {/* Comprehensive Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Sessions</div>
                      <div className="text-white text-2xl font-bold">{bandwidthInvestigationData.summary?.totalSessions || 0}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Unique Users</div>
                      <div className="text-white text-2xl font-bold">{bandwidthInvestigationData.summary?.totalUsers || 0}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Bandwidth</div>
                      <div className="text-white text-2xl font-bold">{formatBandwidth(bandwidthInvestigationData.summary?.totalBandwidth || 0)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Total Duration</div>
                      <div className="text-white text-2xl font-bold">{formatDuration(bandwidthInvestigationData.summary?.totalDuration || 0)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="text-slate-400 text-sm">Avg Session Length</div>
                      <div className="text-white text-2xl font-bold">
                        {bandwidthInvestigationData.summary?.totalSessions > 0 
                          ? formatDuration((bandwidthInvestigationData.summary?.totalDuration || 0) / bandwidthInvestigationData.summary.totalSessions)
                          : '0s'
                        }
                      </div>
                    </div>
                  </div>

                  {/* User Breakdown */}
                  {bandwidthInvestigationData.userBreakdown?.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-3">Top Users by Bandwidth</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {bandwidthInvestigationData.userBreakdown.slice(0, 15).map((user, index) => {
                          const maxBandwidth = Math.max(...bandwidthInvestigationData.userBreakdown.map(u => u.total_bandwidth || 0));
                          const percentage = maxBandwidth > 0 ? ((user.total_bandwidth || 0) / maxBandwidth) * 100 : 0;
                          
                          return (
                            <div key={index} className="flex items-center space-x-3 p-3 bg-slate-700/20 rounded-lg">
                              <div className="w-8 text-slate-400 text-sm font-bold">#{index + 1}</div>
                              <div className="w-24 text-slate-300 text-sm font-medium truncate">
                                {user.username || 'Unknown'}
                              </div>
                              <div className="flex-1 flex items-center space-x-2">
                                <div className="flex-1 bg-slate-600 rounded-full h-3 relative overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                                <div className="w-20 text-white text-sm font-medium text-right">
                                  {formatBandwidth(user.total_bandwidth || 0)}
                                </div>
                                <div className="w-16 text-slate-400 text-sm text-right">
                                  {user.session_count || 0} sessions
                                </div>
                                <div className="w-16 text-slate-400 text-sm text-right">
                                  {formatDuration(user.total_duration || 0)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Sessions Tab */}
              {investigationDetailsTab === 'sessions' && (
                <div className="space-y-4">
                  {bandwidthInvestigationData.sessions?.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {bandwidthInvestigationData.sessions.map((session, index) => (
                        <div key={session.id || index} className="bg-slate-700/20 rounded-lg p-4 border border-slate-600/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                              <div className="text-slate-400 text-xs">Session ID</div>
                              <div className="text-white font-mono text-sm">{session.id || 'N/A'}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">User</div>
                              <div className="text-white font-medium">{session.username || 'Unknown'}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">Content</div>
                              <div className="text-white font-medium truncate" title={session.title}>
                                {session.title || 'Unknown'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">Quality</div>
                              <div className="text-white font-medium">{session.quality || 'Auto'}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">Bandwidth Used</div>
                              <div className="text-white font-medium">{formatBandwidth(session.bandwidth || 0)}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">Duration</div>
                              <div className="text-white font-medium">{formatDuration(session.duration || 0)}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">Started</div>
                              <div className="text-white font-medium text-sm">
                                {session.start_time ? new Date(session.start_time).toLocaleString() : 'Unknown'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs">Client IP</div>
                              <div className="text-white font-mono text-sm">{session.client_ip || 'Unknown'}</div>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-600/30">
                            <div className="flex items-center justify-between text-xs">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                session.status === 'active' 
                                  ? 'bg-green-500/20 text-green-300' 
                                  : 'bg-slate-500/20 text-slate-300'
                              }`}>
                                {session.status || 'completed'}
                              </span>
                              <span className="text-slate-400">
                                Ended: {session.end_time ? new Date(session.end_time).toLocaleString() : 'In progress'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-slate-400">No detailed session data available</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default Admin; 