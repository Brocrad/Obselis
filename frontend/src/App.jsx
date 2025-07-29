import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import ErrorHandlerProvider from './components/ErrorHandlerProvider';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import Movies from './pages/Movies';
import TVShows from './pages/TVShows';
// Player component removed - using MediaPlayer component instead
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import ContentManager from './pages/ContentManager';
import WatchHistory from './pages/WatchHistory';
import NotFound from './pages/NotFound';
import ServerError from './pages/ServerError';
import ClientError from './pages/ClientError';
import ErrorTestPanel from './components/ErrorTestPanel';

// Styles
import './App.css';
import './styles/mobile.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  useEffect(() => {
    window.streamingManager = {
      startSession: async (mediaId, title, quality = 'Auto') => {
        try {
          const token = sessionStorage.getItem('token');
          const response = await fetch('/api/streaming/session/start', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mediaId, title, quality })
          });
          if (response.ok) {
            const data = await response.json();
            console.log('🎬 Streaming session started with real-time bandwidth tracking:', data.sessionId);
            return data.sessionId;
          } else {
            throw new Error('Failed to start streaming session');
          }
        } catch (error) {
          console.error('Error starting streaming session:', error);
          return null;
        }
      },
      endSession: async (sessionId) => {
        try {
          const token = sessionStorage.getItem('token');
          const response = await fetch('/api/streaming/session/end', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
          });
          if (response.ok) {
            console.log('🎬 Streaming session ended:', sessionId);
          } else {
            console.error('Failed to end streaming session');
          }
        } catch (error) {
          console.error('Error ending streaming session:', error);
        }
      }
    };
    return () => {
      delete window.streamingManager;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ErrorHandlerProvider>
          <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<ChangePassword />} />
            
            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Home />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/movies" element={
              <ProtectedRoute>
                <Layout>
                  <Movies />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/tv-shows" element={
              <ProtectedRoute>
                <Layout>
                  <TVShows />
                </Layout>
              </ProtectedRoute>
            } />
            
            {/* Player route removed - using MediaPlayer component in content pages instead */}
            
            <Route path="/profile" element={
              <ProtectedRoute>
                <Layout>
                  <Profile />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/admin" element={
              <AdminRoute>
                <Layout>
                  <Admin />
                </Layout>
              </AdminRoute>
            } />
            
            <Route path="/content" element={
              <ProtectedRoute>
                <Layout>
                  <ContentManager />
                </Layout>
              </ProtectedRoute>
            } />
            
            <Route path="/watch-history" element={
              <ProtectedRoute>
                <Layout>
                  <WatchHistory />
                </Layout>
              </ProtectedRoute>
            } />
            
            {/* 4xx Client Error routes */}
            <Route path="/400" element={<ClientError />} />
            <Route path="/401" element={<ClientError />} />
            <Route path="/403" element={<ClientError />} />
            <Route path="/404" element={<ClientError />} />
            <Route path="/405" element={<ClientError />} />
            <Route path="/408" element={<ClientError />} />
            <Route path="/413" element={<ClientError />} />
            <Route path="/422" element={<ClientError />} />
            <Route path="/429" element={<ClientError />} />
            
            {/* 5xx Server Error routes */}
            <Route path="/500" element={<ServerError />} />
            <Route path="/501" element={<ServerError />} />
            <Route path="/502" element={<ServerError />} />
            <Route path="/503" element={<ServerError />} />
            <Route path="/504" element={<ServerError />} />
            <Route path="/505" element={<ServerError />} />
            <Route path="/server-error" element={<ServerError />} />
            
            {/* Error Testing Panel - Always accessible */}
            <Route path="/error-test" element={<ErrorTestPanel />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
          
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
        </div>
        </ErrorHandlerProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App; 