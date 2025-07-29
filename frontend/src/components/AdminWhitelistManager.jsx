import React, { useState, useEffect } from 'react';

const AdminWhitelistManager = () => {
  const [whitelistData, setWhitelistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newEmailName, setNewEmailName] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);

  const fetchWhitelist = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/support/whitelist', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch admin whitelist');
      }

      const data = await response.json();
      setWhitelistData(data);
    } catch (err) {
      console.error('Error fetching admin whitelist:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshCache = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      const response = await fetch('/api/support/whitelist/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to refresh whitelist cache');
      }

      const data = await response.json();
      
      // Refetch the whitelist data
      await fetchWhitelist();
      
      // Show success message
      alert(`✅ Cache refreshed successfully! ${data.adminCount} admin(s) in whitelist.`);
    } catch (err) {
      console.error('Error refreshing cache:', err);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const addEmail = async () => {
    if (!newEmail.trim()) {
      alert('Please enter an email address');
      return;
    }

    try {
      setAddingEmail(true);
      setError(null);
      
      const response = await fetch('/api/support/emails/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newEmailName.trim() || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add email');
      }

      // Refetch the whitelist data
      await fetchWhitelist();
      
      // Reset form
      setNewEmail('');
      setNewEmailName('');
      setShowAddEmail(false);
      
      // Show success message
      alert(`✅ ${data.message}`);
    } catch (err) {
      console.error('Error adding email:', err);
      setError(err.message);
    } finally {
      setAddingEmail(false);
    }
  };

  const removeEmail = async (emailId) => {
    if (!confirm('Are you sure you want to remove this email from the support whitelist?')) {
      return;
    }

    try {
      setError(null);
      
      const response = await fetch(`/api/support/emails/${emailId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove email');
      }

      // Refetch the whitelist data
      await fetchWhitelist();
      
      // Show success message
      alert(`✅ ${data.message}`);
    } catch (err) {
      console.error('Error removing email:', err);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchWhitelist();
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-slate-300">Loading admin whitelist...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
        <div className="text-red-400 mb-4">
          <h3 className="text-lg font-semibold mb-2">❌ Error Loading Whitelist</h3>
          <p>{error}</p>
        </div>
        <button
          onClick={fetchWhitelist}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">📧 Admin Support Whitelist</h2>
        <button
          onClick={refreshCache}
          disabled={refreshing}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {refreshing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Refreshing...
            </>
          ) : (
            <>
              🔄 Refresh Cache
            </>
          )}
        </button>
      </div>

      {/* Statistics */}
      {whitelistData?.stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{whitelistData.stats.totalAdmins}</div>
            <div className="text-sm text-slate-400">Total Admins</div>
          </div>
          <div className="bg-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-400">{whitelistData.stats.admins}</div>
            <div className="text-sm text-slate-400">Full Admins</div>
          </div>
          <div className="bg-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">{whitelistData.stats.managers}</div>
            <div className="text-sm text-slate-400">Managers</div>
          </div>
          <div className="bg-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-400">
              {whitelistData.stats.cacheValid ? '✅' : '⚠️'}
            </div>
            <div className="text-sm text-slate-400">Cache Status</div>
          </div>
        </div>
      )}

      {/* Admin List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Admin Users (Automatic)</h3>
        
        {whitelistData?.admins && whitelistData.admins.length > 0 ? (
          <div className="space-y-3">
            {whitelistData.admins.map((admin) => (
              <div
                key={admin.id}
                className="bg-slate-700 p-4 rounded-lg border border-slate-600"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="px-2 py-1 rounded text-xs font-semibold bg-red-600 text-white">
                        {admin.role.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {admin.displayName}
                        </div>
                        <div className="text-sm text-slate-400">
                          @{admin.username}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-300 font-mono">
                      {admin.email}
                    </div>
                    <div className="text-xs text-slate-500">
                      ID: {admin.id}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">No Admins Found</h3>
            <p className="text-slate-400">
              No admin users are currently configured to receive support emails.
              <br />
              Contact support emails will not be delivered.
            </p>
          </div>
        )}
      </div>

      {/* Additional Emails List */}
      <div className="space-y-4 mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Additional Emails (Manual)</h3>
          <button
            onClick={() => setShowAddEmail(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            + Add Email
          </button>
        </div>
        
        {whitelistData?.additionalEmails && whitelistData.additionalEmails.length > 0 ? (
          <div className="space-y-3">
            {whitelistData.additionalEmails.map((email) => (
              <div
                key={email.id}
                className="bg-slate-700 p-4 rounded-lg border border-slate-600"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white">
                        ADDITIONAL
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {email.name || 'No name provided'}
                        </div>
                        <div className="text-sm text-slate-400">
                          Added {new Date(email.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm text-slate-300 font-mono">
                        {email.email}
                      </div>
                      <div className="text-xs text-slate-500">
                        ID: {email.id}
                      </div>
                    </div>
                    <button
                      onClick={() => removeEmail(email.id)}
                      className="text-red-400 hover:text-red-300 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 bg-slate-700 rounded-lg border border-slate-600">
            <div className="text-4xl mb-2">📧</div>
            <h4 className="text-sm font-semibold text-slate-300 mb-1">No Additional Emails</h4>
            <p className="text-xs text-slate-400">
              Click "Add Email" to manually add email addresses to the support whitelist.
            </p>
          </div>
        )}
      </div>

      {/* Add Email Modal */}
      {showAddEmail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-md mx-auto">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white mb-2">Add Support Email</h3>
              <p className="text-slate-400 text-sm">
                Add an email address to receive support messages
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="support@example.com"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Name/Description (Optional)
                </label>
                <input
                  type="text"
                  value={newEmailName}
                  onChange={(e) => setNewEmailName(e.target.value)}
                  placeholder="Support Team, External Partner, etc."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={addEmail}
                  disabled={addingEmail || !newEmail.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium py-3 px-4 rounded-md transition duration-200 flex items-center justify-center gap-2"
                >
                  {addingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <span>Add Email</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => {
                    setShowAddEmail(false);
                    setNewEmail('');
                    setNewEmailName('');
                    setError(null);
                  }}
                  disabled={addingEmail}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-800 text-white font-medium py-3 px-4 rounded-md transition duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cache Info */}
      {whitelistData?.stats && (
        <div className="mt-6 p-4 bg-slate-700 rounded-lg">
          <h4 className="text-sm font-semibold text-slate-300 mb-2">Cache Information</h4>
          <div className="text-xs text-slate-400 space-y-1">
            <div>Last Updated: {new Date(whitelistData.stats.lastUpdated).toLocaleString()}</div>
            <div>Cache Valid: {whitelistData.stats.cacheValid ? 'Yes' : 'No'}</div>
            <div>Cache Expiry: 5 minutes</div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-300 mb-2">How It Works</h4>
        <div className="text-xs text-slate-400 space-y-1">
          <div>• Contact support messages are sent to all admin users automatically</div>
          <div>• Additional email addresses can be manually added by admins</div>
          <div>• Only verified, active admin accounts receive emails automatically</div>
          <div>• The whitelist is cached for 5 minutes to improve performance</div>
          <div>• Use "Refresh Cache" to immediately update the list after role changes</div>
        </div>
      </div>
    </div>
  );
};

export default AdminWhitelistManager; 