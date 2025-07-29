import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authManager } from '../utils/authManager';
import { useSocket } from '../hooks/useSocket';

const Profile = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [authState, setAuthState] = useState(authManager.getAuthState());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  
  // Initialize Socket.IO for real-time session invalidation
  const { isConnected } = useSocket();

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    display_name: '',
    bio: ''
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: ''
  });

  // Profile picture state
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  // Security state
  const [loggingOutAllDevices, setLoggingOutAllDevices] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loggingOutSession, setLoggingOutSession] = useState(null);

  // Personal bandwidth usage state
  const [userBandwidthData, setUserBandwidthData] = useState(null);
  const [bandwidthLoading, setBandwidthLoading] = useState(false);

  // Delete account state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = authManager.addListener((newAuthState) => {
      setAuthState(newAuthState);
      
      if (!newAuthState.isAuthenticated) {
        navigate('/login');
        return;
      }
      
      if (newAuthState.user) {
        setProfileForm({
          username: newAuthState.user.username || '',
          email: newAuthState.user.email || '',
          display_name: newAuthState.user.display_name || '',
          bio: newAuthState.user.bio || ''
        });
        setLoading(false);
      }
    });

    // Load initial profile if authenticated
    if (authState.isAuthenticated && authState.user) {
      setProfileForm({
        username: authState.user.username || '',
        email: authState.user.email || '',
        display_name: authState.user.display_name || '',
        bio: authState.user.bio || ''
      });
      setLoading(false);
    } else if (!authState.isAuthenticated) {
      navigate('/login');
    } else {
      loadUserProfile();
    }

    return unsubscribe;
  }, [navigate]);

  const loadUserProfile = async () => {
    try {
      const response = await authManager.apiRequest('/api/users/profile');
      const data = await response.json();

      if (response.ok && data.success) {
        authManager.updateUser(data.user);
      } else {
        setError('Failed to load profile');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Load profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authManager.apiRequest('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        authManager.updateUser(data.user);
        setSuccess('Profile updated successfully!');
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Update profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authManager.apiRequest('/api/users/initiate-password-change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(data.message);
        setPasswordForm({
          currentPassword: ''
        });
      } else {
        setError(data.error || 'Failed to initiate password change');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Initiate password change error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (50MB limit)
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        return;
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setError('Only JPEG, PNG, GIF, and WebP images are allowed');
        return;
      }

      setProfilePicture(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePicturePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfilePictureUpload = async () => {
    if (!profilePicture) return;

    setUploadingPicture(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('profilePicture', profilePicture);

      const response = await authManager.apiRequest('/api/users/upload-profile-picture', {
        method: 'POST',
        headers: {}, // Remove Content-Type to let browser set it for FormData
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        authManager.updateUser(data.user);
        setSuccess('Profile picture updated successfully!');
        setProfilePicture(null);
        setProfilePicturePreview(null);
      } else {
        setError(data.error || 'Failed to upload profile picture');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Upload profile picture error:', err);
    } finally {
      setUploadingPicture(false);
    }
  };

  const handleDeleteProfilePicture = async () => {
    if (!confirm('Are you sure you want to delete your profile picture?')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authManager.apiRequest('/api/users/profile-picture', {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        authManager.updateUser(data.user);
        setSuccess('Profile picture deleted successfully!');
      } else {
        setError(data.error || 'Failed to delete profile picture');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Delete profile picture error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (form, field, value) => {
    if (form === 'profile') {
      setProfileForm(prev => ({ ...prev, [field]: value }));
    } else if (form === 'password') {
      setPasswordForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleLogoutAllDevices = async () => {
    if (!window.confirm('Are you sure you want to logout from all devices? This will end all active sessions and you will need to log in again.')) {
      return;
    }

    setLoggingOutAllDevices(true);
    setError('');
    setSuccess('');

    try {
      const result = await authManager.logoutAllDevices();

      if (result.success) {
        setSuccess(result.message);
        // The authManager.logoutAllDevices() already handles the logout and redirect
      } else {
        setError(result.error || 'Failed to logout from all devices');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Logout all devices error:', err);
    } finally {
      setLoggingOutAllDevices(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const result = await authManager.getSessions();
      if (result.success) {
        setSessions(result.sessions);
      } else {
        setError(result.error || 'Failed to load sessions');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Load sessions error:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleLogoutSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to logout this session?')) {
      return;
    }

    setLoggingOutSession(sessionId);
    setError('');
    setSuccess('');

    try {
      const result = await authManager.logoutSession(sessionId);

      if (result.success) {
        setSuccess(result.message);
        // Reload sessions to update the list
        await loadSessions();
      } else {
        setError(result.error || 'Failed to logout session');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Logout session error:', err);
    } finally {
      setLoggingOutSession(null);
    }
  };

  // Load sessions when Security tab is active
  useEffect(() => {
    if (activeTab === 'security' && authState.isAuthenticated) {
      loadSessions();
    }
  }, [activeTab, authState.isAuthenticated]);

  const fetchUserBandwidthData = async () => {
    if (!authState.user?.id) return;
    
    try {
      setBandwidthLoading(true);
      const token = sessionStorage.getItem('token');
      const response = await authManager.apiRequest('/api/streaming/my-bandwidth', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUserBandwidthData(data);
      } else {
        console.error('Failed to fetch user bandwidth data');
      }
    } catch (error) {
      console.error('Error fetching user bandwidth data:', error);
    } finally {
      setBandwidthLoading(false);
    }
  };

  useEffect(() => {
    fetchUserBandwidthData();
  }, [authState.user?.id]);

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') {
      setError('Please type DELETE to confirm account deletion');
      return;
    }

    setDeletingAccount(true);
    try {
      const response = await authManager.apiRequest('/api/auth/profile', {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSuccess('Account deleted successfully');
        // Logout and redirect to home
        setTimeout(() => {
          authManager.logout();
          navigate('/');
        }, 2000);
      } else {
        setError(data.error || 'Failed to delete account');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Delete account error:', err);
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirmation(false);
      setDeleteConfirmationText('');
    }
  };

  if (loading && !authState.user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  const user = authState.user;

  return (
    <div className="min-h-screen bg-gray-900 py-6 md:py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-white mb-8">User Profile</h1>

        {/* Tab Navigation - Updated */}
        <div className="bg-gray-800 rounded-lg mb-6 overflow-hidden">
          {/* Mobile Tab Navigation */}
          <div className="md:hidden">
            <div className="relative">
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="w-full bg-gradient-to-r from-purple-900/30 to-purple-800/20 border border-purple-700/30 px-4 py-4 pr-12 text-black focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 appearance-none cursor-pointer text-base font-medium backdrop-blur-sm hover:from-purple-800/40 hover:to-purple-700/30 transition-all duration-200"
              >
                <option value="profile">📝 Profile Information</option>
                <option value="password">🔒 Change Password</option>
                <option value="picture">📷 Profile Picture</option>
                <option value="security">🛡️ Security Settings</option>
              </select>
              {/* Custom dropdown arrow */}
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <svg className="w-5 h-5 text-purple-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>
            </div>
          </div>

          {/* Desktop Tab Navigation */}
          <div className="hidden md:flex border-b border-gray-700">
            {[
              { id: 'profile', icon: '📝', label: 'Profile Information' },
              { id: 'password', icon: '🔒', label: 'Change Password' },
              { id: 'picture', icon: '📷', label: 'Profile Picture' },
              { id: 'security', icon: '🛡️', label: 'Security Settings' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 font-medium whitespace-nowrap flex items-center gap-2 transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/30'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 md:p-6">
            {/* Current Section Indicator */}
            <div className="mb-6 md:hidden">
              {(() => {
                const tabInfo = {
                  profile: { icon: '📝', title: 'Profile Information', desc: 'Update your personal information and bio' },
                  password: { icon: '🔒', title: 'Change Password', desc: 'Change your account password securely' },
                  picture: { icon: '📷', title: 'Profile Picture', desc: 'Upload or update your profile picture' },
                  security: { icon: '🛡️', title: 'Security Settings', desc: 'Manage your account security, sessions, and account deletion' }
                };
                const current = tabInfo[activeTab];
                return (
                  <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg p-4">
                    <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                      <span>{current.icon}</span>
                      {current.title}
                    </h2>
                    <p className="text-blue-200 text-sm mt-1">{current.desc}</p>
                  </div>
                );
              })()}
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="bg-red-600 text-white p-3 rounded-md mb-4 text-sm md:text-base">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-600 text-white p-3 rounded-md mb-4 text-sm md:text-base">
                {success}
              </div>
            )}

            {/* Profile Information Tab */}
            {activeTab === 'profile' && (
              <div className="animate-fadeIn">
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(e) => handleInputChange('profile', 'username', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => handleInputChange('profile', 'email', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Display Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={profileForm.display_name}
                      onChange={(e) => handleInputChange('profile', 'display_name', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      placeholder="How you'd like to be displayed"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Bio (Optional)
                    </label>
                    <textarea
                      value={profileForm.bio}
                      onChange={(e) => handleInputChange('profile', 'bio', e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-none"
                      placeholder="Tell us about yourself..."
                      maxLength={500}
                    />
                    <p className="text-sm text-gray-400 mt-1">
                      {profileForm.bio.length}/500 characters
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                  >
                    {loading ? 'Updating...' : 'Update Profile'}
                  </button>
                </div>
              </form>
              </div>
            )}

            {/* Change Password Tab */}
            {activeTab === 'password' && (
              <div className="animate-fadeIn space-y-6">
                <div className="bg-blue-900 border border-blue-700 rounded-md p-4">
                  <h3 className="text-blue-200 font-medium mb-2">🔒 Enhanced Security</h3>
                  <p className="text-blue-100 text-sm">
                    For your security, password changes require email verification. We'll send you a secure link to complete the password change process.
                  </p>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => handleInputChange('password', 'currentPassword', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your current password to verify identity"
                      required
                    />
                    <p className="text-sm text-gray-400 mt-1">
                      We need to verify your current password before sending the change link.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium py-2 px-6 rounded-md transition duration-200"
                    >
                      {loading ? 'Sending Email...' : 'Send Password Change Email'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Profile Picture Tab */}
            {activeTab === 'picture' && (
              <div className="animate-fadeIn space-y-6">
                <div className="text-center">
                  <div className="mb-4">
                    {user?.profile_picture ? (
                      <img
                        src={`/uploads/profile-pictures/${user.profile_picture}`}
                        alt="Profile"
                        className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-gray-600"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full mx-auto bg-gray-600 flex items-center justify-center border-4 border-gray-600">
                        <span className="text-4xl text-gray-400">
                          {user?.username?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                  </div>

                  {user?.profile_picture && (
                    <button
                      onClick={handleDeleteProfilePicture}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium py-2 px-4 rounded-md transition duration-200 mb-4"
                    >
                      Delete Current Picture
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Upload New Profile Picture
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleProfilePictureChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />
                  <p className="text-sm text-gray-400 mt-1">
                    Supported formats: JPEG, PNG, GIF, WebP. Maximum size: 50MB.
                  </p>
                </div>

                {profilePicturePreview && (
                  <div className="text-center">
                    <p className="text-sm text-gray-300 mb-2">Preview:</p>
                    <img
                      src={profilePicturePreview}
                      alt="Preview"
                      className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-gray-600 mb-4"
                    />
                    <button
                      onClick={handleProfilePictureUpload}
                      disabled={uploadingPicture}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-medium py-2 px-6 rounded-md transition duration-200"
                    >
                      {uploadingPicture ? 'Uploading...' : 'Upload Picture'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="animate-fadeIn space-y-6">
                <div className="bg-yellow-900 border border-yellow-700 rounded-md p-4">
                  <h3 className="text-yellow-200 font-medium mb-2">🔐 Account Security</h3>
                  <p className="text-yellow-100 text-sm">
                    Manage your account security settings. These actions will affect all your active sessions.
                  </p>
                </div>

                <div className="bg-gray-700 rounded-lg p-4 md:p-6">
                  <h4 className="text-lg font-medium text-white mb-4">Session Management</h4>
                  
                  <div className="space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1">
                        <h5 className="text-white font-medium mb-1">Logout All Devices</h5>
                        <p className="text-gray-300 text-sm">
                          This will immediately log you out of all devices and browsers where you're currently signed in. 
                          You'll need to log in again on each device. Use this if you suspect unauthorized access to your account.
                        </p>
                      </div>
                      <button
                        onClick={handleLogoutAllDevices}
                        disabled={loggingOutAllDevices}
                        className="w-full md:w-auto md:ml-4 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium py-2 px-4 rounded-md transition duration-200 flex items-center justify-center gap-2 text-sm md:text-base"
                      >
                        {loggingOutAllDevices ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span className="hidden sm:inline">Logging Out...</span>
                            <span className="sm:hidden">Logging Out...</span>
                          </>
                        ) : (
                          <>
                            🚪 <span className="hidden sm:inline">Logout All Devices</span>
                            <span className="sm:hidden">Logout All</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-700 rounded-lg p-4 md:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h4 className="text-lg font-medium text-white">Active Sessions</h4>
                    <button
                      onClick={loadSessions}
                      disabled={loadingSessions}
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium py-2 px-4 rounded-md transition duration-200 text-sm"
                    >
                      {loadingSessions ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  
                  {loadingSessions ? (
                    <div className="text-center py-4">
                      <div className="text-gray-400">Loading sessions...</div>
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-4">
                      <div className="text-gray-400">No active sessions found</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Show all sessions, sorted by current session first, then by last activity */}
                      {sessions
                        .sort((a, b) => {
                          // Current session always first
                          if (a.is_current_session && !b.is_current_session) return -1;
                          if (!a.is_current_session && b.is_current_session) return 1;
                          // Then sort by last activity (most recent first)
                          return new Date(b.last_activity) - new Date(a.last_activity);
                        })
                        .map((session) => (
                        <div
                          key={session.session_id}
                          className={`border rounded-lg p-4 ${
                            session.is_current_session 
                              ? 'border-green-500 bg-green-900/20' 
                              : 'border-gray-600 bg-gray-800'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                  {/* Device/Browser Icon */}
                                  <span className="text-lg flex-shrink-0">
                                    {session.device_info?.toLowerCase().includes('mobile') || 
                                     session.device_info?.toLowerCase().includes('iphone') || 
                                     session.device_info?.toLowerCase().includes('android') ? '📱' : 
                                     session.browser_info?.toLowerCase().includes('chrome') ? '🌐' :
                                     session.browser_info?.toLowerCase().includes('firefox') ? '🦊' :
                                     session.browser_info?.toLowerCase().includes('safari') ? '🧭' :
                                     session.browser_info?.toLowerCase().includes('edge') ? '🔷' : '💻'}
                                  </span>
                                  <span className="text-white font-medium text-sm md:text-base truncate">
                                    {session.device_info} • {session.browser_info}
                                  </span>
                                </div>
                                {session.is_current_session && (
                                  <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 w-fit">
                                    <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                                    <span className="hidden sm:inline">Current Session</span>
                                    <span className="sm:hidden">Current</span>
                                  </span>
                                )}
                              </div>
                              
                              <div className="text-sm text-gray-300 space-y-1 ml-0 sm:ml-7">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                  <span className="text-gray-400 text-xs sm:text-sm">🕒 Last Activity:</span> 
                                  <span className="text-gray-200 text-xs sm:text-sm">
                                    {new Date(session.last_activity).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                  <span className="text-gray-400 text-xs sm:text-sm">🚀 Started:</span> 
                                  <span className="text-gray-200 text-xs sm:text-sm">
                                    {new Date(session.created_at).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {!session.is_current_session && (
                              <button
                                onClick={() => handleLogoutSession(session.session_id)}
                                disabled={loggingOutSession === session.session_id}
                                className="w-full md:w-auto bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium py-2 px-4 rounded-md transition duration-200 text-sm flex items-center justify-center gap-2"
                              >
                                {loggingOutSession === session.session_id ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span className="hidden sm:inline">Logging Out...</span>
                                    <span className="sm:hidden">Logging Out...</span>
                                  </>
                                ) : (
                                  <>
                                    🚪 <span className="hidden sm:inline">Logout</span>
                                    <span className="sm:hidden">Logout</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-gray-700 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-white mb-4">Security Information</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Password Last Changed:</span>
                      <span className="text-white ml-2">
                        {user?.password_changed_at ? new Date(user.password_changed_at).toLocaleDateString() : 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Account Status:</span>
                      <span className={`ml-2 ${user?.is_active ? 'text-green-400' : 'text-red-400'}`}>
                        {user?.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Active Sessions:</span>
                      <span className="text-white ml-2">
                        {sessions.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Login Method:</span>
                      <span className="text-white ml-2">
                        Email & Password
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-900 border border-blue-700 rounded-md p-4">
                  <h4 className="text-blue-200 font-medium mb-2">💡 Security Tips</h4>
                  <ul className="text-blue-100 text-sm space-y-1">
                    <li>• Use a strong, unique password for your account</li>
                    <li>• Change your password regularly</li>
                    <li>• Log out from shared or public computers</li>
                    <li>• Use "Logout All Devices" if you suspect unauthorized access</li>
                    <li>• Review your active sessions regularly</li>
                  </ul>
                </div>

                {/* Delete Account Section */}
                <div className="bg-red-900 border border-red-700 rounded-lg p-4 md:p-6">
                  <h4 className="text-lg font-medium text-red-200 mb-4">🗑️ Delete Account</h4>
                  <p className="text-red-100 text-sm mb-4">
                    This action is irreversible. Once you delete your account, all your data will be permanently removed.
                  </p>
                  
                  <div className="space-y-4">
                    <div className="bg-yellow-900 border border-yellow-700 rounded-md p-4">
                      <h5 className="text-yellow-200 font-medium mb-2">What will be deleted:</h5>
                      <ul className="text-yellow-100 text-sm space-y-1">
                        <li>• Your user account and profile</li>
                        <li>• All your active sessions</li>
                        <li>• Your watch history and preferences</li>
                        <li>• Your bandwidth usage data</li>
                        <li>• Any unused invite tokens you created</li>
                        <li>• All associated data and settings</li>
                      </ul>
                    </div>

                    <div className="bg-blue-900 border border-blue-700 rounded-md p-4">
                      <h5 className="text-blue-200 font-medium mb-2">What happens after deletion:</h5>
                      <ul className="text-blue-100 text-sm space-y-1">
                        <li>• You will be immediately logged out</li>
                        <li>• Your username will be freed up for others to use</li>
                        <li>• You can create a new account with the same email</li>
                        <li>• All data is permanently removed and cannot be recovered</li>
                      </ul>
                    </div>

                    {!showDeleteConfirmation ? (
                      <button
                        onClick={() => setShowDeleteConfirmation(true)}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                      >
                        🗑️ Delete My Account
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-red-900 border border-red-700 rounded-md p-4">
                          <h5 className="text-red-200 font-medium mb-2">Final Confirmation</h5>
                          <p className="text-red-100 text-sm mb-3">
                            To confirm account deletion, please type <strong>DELETE</strong> in the field below:
                          </p>
                          <input
                            type="text"
                            value={deleteConfirmationText}
                            onChange={(e) => setDeleteConfirmationText(e.target.value)}
                            placeholder="Type DELETE to confirm"
                            className="w-full px-3 py-2 bg-gray-800 border border-red-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={handleDeleteAccount}
                            disabled={deleteConfirmationText !== 'DELETE' || deletingAccount}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium py-3 px-4 rounded-md transition duration-200 flex items-center justify-center gap-2"
                          >
                            {deletingAccount ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Deleting Account...</span>
                              </>
                            ) : (
                              <>
                                🗑️ <span>Permanently Delete Account</span>
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => {
                              setShowDeleteConfirmation(false);
                              setDeleteConfirmationText('');
                            }}
                            disabled={deletingAccount}
                            className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}


          </div>
        </div>

        {/* Account Information */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Account Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Account Created:</span>
              <span className="text-white ml-2">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Last Updated:</span>
              <span className="text-white ml-2">
                {user?.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'Unknown'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Account Type:</span>
              <span className="text-white ml-2">
                {user?.role_display_name || (user?.is_admin ? 'Administrator' : 'User')}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Email Verified:</span>
              <span className={`ml-2 ${user?.email_verified ? 'text-green-400' : 'text-yellow-400'}`}>
                {user?.email_verified ? 'Yes' : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Personal Bandwidth Usage */}
        <div className="bg-gray-800 rounded-lg p-6 mt-8">
          <h2 className="text-xl font-bold text-white mb-4">My Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Total Bandwidth Used:</span>
              <span className="text-white ml-2">
                {bandwidthLoading ? 'Loading...' : userBandwidthData?.formatted?.[0]?.totalBandwidth || '0 GB'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Total Duration:</span>
              <span className="text-white ml-2">
                {bandwidthLoading ? 'Loading...' : userBandwidthData?.formatted?.[0]?.totalDuration || '0h 0m'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Total Streams:</span>
              <span className="text-white ml-2">
                {bandwidthLoading ? 'Loading...' : userBandwidthData?.formatted?.[0]?.totalStreams || '0'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Last Activity:</span>
              <span className="text-white ml-2">
                {bandwidthLoading ? 'Loading...' : userBandwidthData?.lastActivity || 'N/A'}
              </span>
            </div>
          </div>

          {bandwidthLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-400 text-sm">Loading your usage data...</p>
            </div>
          ) : userBandwidthData?.userHistory?.length > 0 ? (
            <div className="space-y-4">
              <div className="text-center p-4 bg-slate-700/30 rounded-lg">
                <div className="text-2xl font-bold text-white mb-1">
                  {userBandwidthData.formatted?.[0]?.totalBandwidth || '0 GB'}
                </div>
                <div className="text-slate-400 text-sm">This Month</div>
              </div>

              <div>
                <h3 className="text-white font-semibold mb-3">Recent Activity</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {userBandwidthData.userHistory.slice(0, 3).map((period, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                      <div>
                        <div className="text-white font-medium">
                          {new Date(period.period_start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {period.total_streams || 0} streams • {period.totalDuration || '0h 0m'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          {period.totalBandwidth || '0 GB'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={fetchUserBandwidthData}
                className="w-full px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition-colors text-sm font-medium"
              >
                🔄 Refresh Data
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📺</span>
              </div>
              <h4 className="text-white font-semibold text-lg mb-2">No Usage Data</h4>
              <p className="text-slate-400 text-sm">Start watching content to see your bandwidth usage here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile; 