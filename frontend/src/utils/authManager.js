class AuthManager {
  constructor() {
    this.apiBaseUrl = ''; // Use relative URLs
    this.token = null;
    this.refreshToken = null;
    this.user = null;
    this.listeners = new Set();
    this.refreshTimer = null;

    // Load existing auth data from sessionStorage (tab-specific)
    this.loadFromStorage();

    // Start token refresh if we have a token
    this.startTokenRefresh();

    // Validate session when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange();
    });

    // Note: Removed storage event listener for cross-tab sync
    // Each tab now maintains independent authentication state
  }

  // Load authentication data from sessionStorage (tab-specific)
  loadFromStorage() {
    try {
      this.token = sessionStorage.getItem('token');
      this.refreshToken = sessionStorage.getItem('refreshToken');
      const userData = sessionStorage.getItem('user');
      this.user = userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error loading auth data from storage:', error);
      this.clearAuth();
    }
  }

  // Handle tab visibility changes
  handleVisibilityChange() {
    if (!document.hidden && this.token) {
      // Tab became visible, check if token is still valid
      this.validateCurrentSession();
    }
  }

  // Validate current session
  async validateCurrentSession() {
    if (!this.token) return false;

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.updateUser(data.user);
          return true;
        }
      }
      
      // Token is invalid, try to refresh
      return await this.attemptTokenRefresh();
    } catch (error) {
      console.error('Session validation error:', error);
      return await this.attemptTokenRefresh();
    }
  }

  // Attempt to refresh token
  async attemptTokenRefresh() {
    if (!this.refreshToken) {
      this.logout();
      return false;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken: this.refreshToken
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.setAuth(data.token, data.refreshToken, data.user);
          return true;
        }
      }
      
      // Refresh failed, logout
      this.logout();
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.logout();
      return false;
    }
  }

  // Start automatic token refresh
  startTokenRefresh() {
    // Clear existing timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    if (!this.token) return;

    // Refresh token every 50 minutes (tokens expire in 1 hour)
    this.refreshTimer = setInterval(() => {
      this.attemptTokenRefresh();
    }, 50 * 60 * 1000);
  }

  // Set authentication data
  setAuth(token, refreshToken, user) {
    this.token = token;
    this.refreshToken = refreshToken;
    this.user = user;

    // Store in sessionStorage (tab-specific)
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('refreshToken', refreshToken);
    sessionStorage.setItem('user', JSON.stringify(user));

    // Start token refresh
    this.startTokenRefresh();

    // Notify listeners
    this.notifyListeners();

    // Note: Removed cross-tab event dispatch for independent tab authentication
  }

  // Update user data
  updateUser(user) {
    this.user = user;
    sessionStorage.setItem('user', JSON.stringify(user));
    this.notifyListeners();

    // Note: Removed cross-tab event dispatch for independent tab authentication
  }

  // Clear authentication data
  clearAuth() {
    this.token = null;
    this.refreshToken = null;
    this.user = null;

    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('obselis-animation-shown'); // Clear animation flag for next login

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Logout
  logout() {
    this.clearAuth();
    this.notifyListeners();

    // Note: Removed cross-tab event dispatch for independent tab authentication
  }

  // Logout from all devices
  async logoutAllDevices() {
    try {
      const response = await this.apiRequest('/api/users/logout-all-devices', {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Clear local auth state
        this.logout();
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error || 'Failed to logout from all devices' };
      }
    } catch (error) {
      console.error('Logout all devices error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Get active sessions
  async getSessions() {
    try {
      const response = await this.apiRequest('/api/users/sessions');
      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true, sessions: data.sessions };
      } else {
        return { success: false, error: data.error || 'Failed to get sessions' };
      }
    } catch (error) {
      console.error('Get sessions error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Logout specific session
  async logoutSession(sessionId) {
    try {
      const response = await this.apiRequest(`/api/users/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error || 'Failed to logout session' };
      }
    } catch (error) {
      console.error('Logout session error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Login
  async login(email, password) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.setAuth(data.token, data.refreshToken, data.user);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // Get current authentication state
  getAuthState() {
    return {
      isAuthenticated: !!this.token,
      user: this.user,
      token: this.token
    };
  }

  // Get current token
  getToken() {
    return this.token;
  }

  // Get current user
  getCurrentUser() {
    return this.user;
  }

  // Add listener for auth state changes
  addListener(callback) {
    this.listeners.add(callback);
    
    // Immediately call the callback with current state
    const currentState = this.getAuthState();
    callback(currentState);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  // Notify all listeners
  notifyListeners() {
    const authState = this.getAuthState();
    this.listeners.forEach(callback => {
      try {
        callback(authState);
      } catch (error) {
        console.error('Auth listener error:', error);
      }
    });
  }

  // Make authenticated API request
  async apiRequest(url, options = {}) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    // If unauthorized, try to refresh token
    if (response.status === 401) {
      const refreshed = await this.attemptTokenRefresh();
      if (refreshed) {
        // Retry the request with new token - use this.token which was updated by attemptTokenRefresh
        const retryHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          ...options.headers
        };
        return fetch(url, { ...options, headers: retryHeaders });
      } else {
        throw new Error('Authentication failed');
      }
    }

    return response;
  }
}

// Create singleton instance
const authManager = new AuthManager();

export { authManager };
export default authManager; 