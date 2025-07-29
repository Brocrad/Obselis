import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { authManager } from '../utils/authManager';

export const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transcodingProgress, setTranscodingProgress] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Create socket connection - use current host for mobile compatibility
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname;
    const port = process.env.NODE_ENV === 'production' ? window.location.port : '3001';
    const socketUrl = `${protocol}//${host}:${port}`;
    
    console.log(`🔌 Connecting to Socket.IO server: ${socketUrl}`);
    
    const socketInstance = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'], // Fallback for mobile networks
      timeout: 20000, // 20 second timeout
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      maxReconnectionAttempts: 5,
      forceNew: true
    });

    socketInstance.on('connect', () => {
      console.log(`🔌 Connected to server: ${socketUrl}`);
      setIsConnected(true);
      
      // Register this socket with the current session
      console.log('🔍 About to call registerSession...');
      registerSession(socketInstance);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected from server: ${reason}`);
      setIsConnected(false);
      setTranscodingProgress(null);
    });

    socketInstance.on('connect_error', (error) => {
      console.error(`🚫 Connection error: ${error.message}`);
      console.error(`🚫 Attempted URL: ${socketUrl}`);
      setIsConnected(false);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      
      // Re-register session after reconnection
      registerSession(socketInstance);
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error(`🔄 Reconnection failed: ${error.message}`);
    });

    // Listen for transcoding progress updates
    socketInstance.on('transcoding-progress', (data) => {
      console.log('📊 Transcoding progress:', data);
      setTranscodingProgress(data);
    });

    // Listen for transcoding status updates
    socketInstance.on('transcoding-status', (data) => {
      console.log('📋 Transcoding status:', data);
    });

    // Listen for transcoding queue completion
    socketInstance.on('transcoding-queue-completed', (data) => {
      console.log('✅ Transcoding queue completed:', data);
      setTranscodingProgress(null);
      
      // Refresh analytics and status data
      queryClient.invalidateQueries(['storage-analytics']);
      queryClient.invalidateQueries(['transcoding-status']);
      
      // Show completion notification
      console.log('🎉 All transcoding jobs completed! Analytics updated.');
    });

    // Listen for storage analytics updates
    socketInstance.on('storage-analytics-update', (data) => {
      console.log('📊 Storage analytics updated:', data);
      
      // Update cached analytics data
      queryClient.setQueryData(['storage-analytics'], (oldData) => ({
        ...oldData,
        analytics: {
          ...oldData?.analytics,
          compression: data
        }
      }));
    });

    // Listen for session registration confirmation
    socketInstance.on('session-registered', (data) => {
      console.log('✅ Session registration confirmed:', data);
    });

    socketInstance.on('session-registration-error', (error) => {
      console.error('❌ Session registration failed:', error);
    });

    socketInstance.on('session-registration-failed', (error) => {
      console.error('❌ Session registration failed:', error);
    });

    // Listen for session invalidation events
    socketInstance.on('session-invalidated', (data) => {
      console.log('🚨 Session invalidated:', data);
      
      // Get current session ID from token to check if it's our session
      const token = authManager.getToken();
      if (token) {
        try {
          // Decode JWT token to get session ID (without verification)
          const payload = JSON.parse(atob(token.split('.')[1]));
          
          // If this is our session that was invalidated, logout immediately
          if (payload.sessionId === data.sessionId) {
            console.log('🚨 Your current session has been logged out from another device');
            
            // Force logout and redirect to login page
            authManager.logout();
            
            // Use React Router navigation if available, otherwise fallback to window.location
            if (window.location.pathname !== '/login') {
              window.location.href = '/login?message=' + encodeURIComponent(data.message || 'Your session has been logged out from another device');
            }
          } else {
            console.log('🔔 Another session was logged out, but not your current one');
          }
        } catch (error) {
          console.error('Error decoding token for session check:', error);
          // If we can't decode the token, assume it might be our session and logout for safety
          console.log('🚨 Token decode failed, logging out for safety');
          authManager.logout();
          if (window.location.pathname !== '/login') {
            window.location.href = '/login?message=' + encodeURIComponent('Session verification failed, please log in again');
          }
        }
      } else {
        console.log('🔔 Session invalidated but no token found locally');
      }
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, [queryClient]);

  // Function to register session with socket
  const registerSession = (socket) => {
    console.log('🔍 Attempting to register session...');
    console.log('🔍 authManager object:', authManager);
    console.log('🔍 authManager.getToken function:', typeof authManager.getToken);
    
    const token = authManager.getToken();
    console.log('🔍 Token exists:', !!token);
    console.log('🔍 Token preview:', token ? token.substring(0, 50) + '...' : 'null');
    
    if (token) {
      try {
        console.log('🔍 Decoding token...');
        // Decode JWT token to get session ID (without verification)
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('🔍 Token payload:', payload);
        
        if (payload.sessionId) {
          console.log('🔍 Emitting register-session event with sessionId:', payload.sessionId);
          socket.emit('register-session', { sessionId: payload.sessionId });
          console.log(`📝 Registered socket with session: ${payload.sessionId}`);
        } else {
          console.warn('⚠️ No sessionId found in token payload');
          console.warn('⚠️ Token payload keys:', Object.keys(payload));
        }
      } catch (error) {
        console.error('Error decoding token for session registration:', error);
        console.error('Token preview:', token.substring(0, 50) + '...');
      }
    } else {
      console.warn('⚠️ No token found for session registration');
    }
  };

  return {
    socket,
    isConnected,
    transcodingProgress,
    setTranscodingProgress
  };
}; 