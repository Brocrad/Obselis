import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authManager } from '../utils/authManager';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await authManager.login(formData.email, formData.password);
      
      if (result.success) {
        // Note: authManager.login() already calls setAuth() internally
        
        // Small delay to ensure auth state is updated
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 100);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Logo/Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-large mb-4 shadow-large">
            <span className="text-xl sm:text-2xl">🎬</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Archive of Obselis
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">Sign in to access your media library</p>
        </div>

        {/* Login Form */}
        <div className="card-modern p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            {error && (
              <div className="bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-500/30 text-red-300 p-3 sm:p-4 rounded-modern text-sm flex items-start space-x-2">
                <span className="flex-shrink-0 mt-0.5">⚠️</span>
                <span className="break-words">{error}</span>
              </div>
            )}
            
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="input-with-icon text-base"
                  placeholder="Enter your email"
                />
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="input-with-icon text-base"
                  placeholder="Enter your password"
                />
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-modern bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 sm:py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="loading-spinner"></div>
                  <span>Signing in...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center space-x-2">
                  <span>🚀</span>
                  <span>Sign In</span>
                </span>
              )}
            </button>
          </form>
          
          <div className="mt-6 sm:mt-8 space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">Need help?</span>
              </div>
            </div>
            
            <div className="flex flex-col space-y-3 text-center">
              <Link 
                to="/forgot-password" 
                className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-1"
              >
                <span>🔑</span>
                <span>Forgot your password?</span>
              </Link>
              <p className="text-slate-400 text-sm">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200">
                  Sign up here
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Demo Credentials */}
        <div className="card-modern p-4 bg-slate-800/50">
          <div className="text-center">
            <p className="text-slate-400 text-xs mb-3">Demo Credentials</p>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-center sm:space-x-4">
              <div className="flex items-center justify-center space-x-1 text-xs">
                <span className="text-slate-500">Email:</span>
                <code className="text-blue-400 bg-slate-700/50 px-2 py-1 rounded text-xs break-all">admin@yourdomain.com</code>
              </div>
              <div className="flex items-center justify-center space-x-1 text-xs">
                <span className="text-slate-500">Password:</span>
                <code className="text-blue-400 bg-slate-700/50 px-2 py-1 rounded text-xs">admin123</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 