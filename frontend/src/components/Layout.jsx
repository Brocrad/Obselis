import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authManager } from '../utils/authManager';

const Layout = ({ children }) => {
  const [authState, setAuthState] = useState(authManager.getAuthState());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = authManager.addListener((newAuthState) => {
      setAuthState(newAuthState);
      
      // Redirect to login if not authenticated
      if (!newAuthState.isAuthenticated && window.location.pathname !== '/login') {
        navigate('/login');
      }
    });

    // Listen for auth state changes from other tabs
    const handleAuthStateChange = (event) => {
      const { type } = event.detail;
      if (type === 'logout') {
        navigate('/login');
      }
    };

    window.addEventListener('authStateChanged', handleAuthStateChange);

    return () => {
      unsubscribe();
      window.removeEventListener('authStateChanged', handleAuthStateChange);
    };
  }, [navigate]);

  const handleLogout = () => {
    authManager.logout();
    navigate('/login');
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const isActivePath = (path) => {
    return location.pathname === path;
  };

  const NavLink = ({ to, children, className = "", onClick }) => (
    <Link
      to={to}
      onClick={onClick}
      className={`
        relative px-4 py-2 rounded-modern font-medium transition-all duration-200
        ${isActivePath(to) 
          ? 'text-white bg-gradient-to-r from-blue-500 to-purple-500 shadow-medium' 
          : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
        }
        ${className}
      `}
    >
      {children}
      {isActivePath(to) && (
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-modern -z-10"></div>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="glass-effect border-b border-slate-700/50 sticky top-0 z-40">
        <div className="container mx-auto px-4">
          {/* Desktop Header */}
          <div className="hidden md:flex justify-between items-center py-4">
            <div className="flex items-center space-x-8">
              <Link to="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent hover:from-blue-300 hover:to-purple-300 transition-all duration-200">
                Archive of Obselis
              </Link>
              <nav className="flex space-x-2">
                <NavLink to="/movies">
                  <span className="flex items-center space-x-2">
                    <span>🎬</span>
                    <span>Movies</span>
                  </span>
                </NavLink>
                <NavLink to="/tv-shows">
                  <span className="flex items-center space-x-2">
                    <span>📺</span>
                    <span>TV Shows</span>
                  </span>
                </NavLink>
                <NavLink to="/watch-history">
                  <span className="flex items-center space-x-2">
                    <span>📺</span>
                    <span>History</span>
                  </span>
                </NavLink>
                {(authState.user?.role === 'admin' || authState.user?.role === 'manager' || authState.user?.is_admin) && (
                  <NavLink to="/content">
                    <span className="flex items-center space-x-2">
                      <span>📁</span>
                      <span>Content</span>
                    </span>
                  </NavLink>
                )}
                {(authState.user?.is_admin || authState.user?.role === 'admin') && (
                  <NavLink to="/admin">
                    <span className="flex items-center space-x-2">
                      <span>⚙️</span>
                      <span>Admin</span>
                    </span>
                  </NavLink>
                )}
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              {authState.isAuthenticated && authState.user && (
                <>
                  <Link to="/profile" className="flex items-center space-x-3 px-4 py-2 rounded-modern hover:bg-slate-700/50 transition-all duration-200 group">
                    <div className="relative">
                      {authState.user.profile_picture ? (
                        <img
                          src={`/uploads/profile-pictures/${authState.user.profile_picture}`}
                          alt="Profile"
                          className="w-10 h-10 rounded-full object-cover border-2 border-slate-600 group-hover:border-blue-400 transition-all duration-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center border-2 border-slate-600 group-hover:border-blue-400 transition-all duration-200">
                          <span className="text-white font-semibold">
                            {(authState.user.display_name || authState.user.username)?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                      {/* Online indicator */}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800"></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-white font-medium">
                        {authState.user.display_name || authState.user.username}
                      </span>
                      <div className="flex items-center space-x-1">
                        {authState.user.role === 'admin' && <span className="role-badge admin">👑 Admin</span>}
                        {authState.user.role === 'manager' && <span className="role-badge manager">🎬 Manager</span>}
                        {authState.user.role === 'user' && <span className="role-badge user">👤 User</span>}
                        {authState.user.is_admin && !authState.user.role && <span className="role-badge admin">👑 Admin</span>}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="btn-modern bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
                  >
                    <span className="flex items-center space-x-2">
                      <span>🚪</span>
                      <span>Logout</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mobile Header */}
          <div className="md:hidden flex justify-between items-center py-4">
            <Link to="/" className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Archive of Obselis
            </Link>
            
            <div className="flex items-center space-x-3">
              {authState.isAuthenticated && authState.user && (
                <>
                  <Link to="/profile" className="flex items-center">
                    {authState.user.profile_picture ? (
                      <img
                        src={`/uploads/profile-pictures/${authState.user.profile_picture}`}
                        alt="Profile"
                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-600"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center border-2 border-slate-600">
                        <span className="text-white font-semibold">
                          {(authState.user.display_name || authState.user.username)?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                  </Link>
                  <button
                    onClick={toggleMobileMenu}
                    className="p-2 rounded-modern hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200"
                    aria-label="Toggle menu"
                  >
                    <svg className={`w-6 h-6 transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden pb-4 border-t border-slate-700/50">
              <nav className="flex flex-col space-y-2 mt-4">
                <NavLink 
                  to="/movies" 
                  className="flex items-center space-x-3 px-4 py-3"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>🎬</span>
                  <span>Movies</span>
                </NavLink>
                <NavLink 
                  to="/tv-shows" 
                  className="flex items-center space-x-3 px-4 py-3"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>📺</span>
                  <span>TV Shows</span>
                </NavLink>
                <NavLink 
                  to="/watch-history" 
                  className="flex items-center space-x-3 px-4 py-3"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>📺</span>
                  <span>History</span>
                </NavLink>
                {(authState.user?.role === 'admin' || authState.user?.role === 'manager' || authState.user?.is_admin) && (
                  <NavLink 
                    to="/content" 
                    className="flex items-center space-x-3 px-4 py-3"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span>📁</span>
                    <span>Content</span>
                  </NavLink>
                )}
                {(authState.user?.is_admin || authState.user?.role === 'admin') && (
                  <NavLink 
                    to="/admin" 
                    className="flex items-center space-x-3 px-4 py-3"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span>⚙️</span>
                    <span>Admin</span>
                  </NavLink>
                )}
                <NavLink 
                  to="/profile" 
                  className="flex items-center space-x-3 px-4 py-3"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>👤</span>
                  <span>Profile</span>
                </NavLink>
                <button
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center space-x-3 px-4 py-3 text-left rounded-modern hover:bg-slate-700/50 text-red-400 hover:text-red-300 transition-all duration-200"
                >
                  <span>🚪</span>
                  <span>Logout</span>
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 max-w-full">
        {children}
      </main>
    </div>
  );
};

export default Layout; 