import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const ForbiddenErrorPage = () => {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Create floating mystical particles
    const newParticles = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.2,
      delay: Math.random() * 5
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center text-white overflow-x-hidden relative">
      {/* Mystical Background Particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-1 h-1 bg-red-400 rounded-full animate-pulse"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            opacity: particle.opacity,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.speed}s`
          }}
        />
      ))}

      {/* Mystical Runes Background */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-10 left-10 text-4xl text-red-400 animate-pulse" style={{ animationDelay: '0.5s' }}>⚔️</div>
        <div className="absolute top-20 right-20 text-3xl text-red-400 animate-pulse" style={{ animationDelay: '1s' }}>🛡️</div>
        <div className="absolute bottom-20 left-20 text-3xl text-red-400 animate-pulse" style={{ animationDelay: '1.5s' }}>⚜️</div>
        <div className="absolute bottom-10 right-10 text-4xl text-red-400 animate-pulse" style={{ animationDelay: '2s' }}>🏛️</div>
        <div className="absolute top-1/2 left-5 text-2xl text-red-400 animate-pulse" style={{ animationDelay: '2.5s' }}>📜</div>
        <div className="absolute top-1/2 right-5 text-2xl text-red-400 animate-pulse" style={{ animationDelay: '3s' }}>🔮</div>
      </div>

      {/* Mystical Energy Field */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5 animate-pulse pointer-events-none"></div>

      <div className="text-center max-w-2xl px-8 py-12 relative z-10">
        {/* Mystical Border with Runes */}
        <div className="absolute inset-0 border border-slate-600/30 rounded-3xl opacity-50 pointer-events-none">
          {/* Corner Runes */}
          <div className="absolute top-2 left-2 text-red-400/30 text-sm">⚔️</div>
          <div className="absolute top-2 right-2 text-red-400/30 text-sm">🛡️</div>
          <div className="absolute bottom-2 left-2 text-red-400/30 text-sm">⚜️</div>
          <div className="absolute bottom-2 right-2 text-red-400/30 text-sm">🏛️</div>
        </div>
        
        {/* Mystical Symbol with Enhanced Animation */}
        <div className="text-8xl mb-4 relative" style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 20px rgba(220, 38, 38, 0.2))',
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          🚫
          {/* Mystical Aura */}
          <div className="absolute inset-0 text-8xl opacity-20 animate-ping" style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            🚫
          </div>
        </div>
        
        {/* Error Code with Mystical Glow */}
        <div className="text-6xl font-bold mb-4 relative" style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: '0 0 20px rgba(220, 38, 38, 0.2)'
        }}>
          403
          {/* Mystical Runes around the number */}
          <div className="absolute -top-2 -left-2 text-red-400/50 text-sm">⚔️</div>
          <div className="absolute -top-2 -right-2 text-red-400/50 text-sm">🛡️</div>
          <div className="absolute -bottom-2 -left-2 text-red-400/50 text-sm">⚜️</div>
          <div className="absolute -bottom-2 -right-2 text-red-400/50 text-sm">🏛️</div>
        </div>
        
        {/* Title with Mystical Styling */}
        <h1 className="text-4xl font-bold mb-4 text-slate-100 relative">
          <span className="text-red-400/50 mr-2">⚔️</span>
          Forbidden Knowledge
          <span className="text-red-400/50 ml-2">🛡️</span>
        </h1>
        
        {/* Subtitle with Enhanced Theme */}
        <p className="text-xl text-slate-300 mb-8">
          The Archive's ancient guardians have denied your access
        </p>
        
        {/* Description with Mystical Language */}
        <p className="text-slate-400 mb-12 leading-relaxed">
          The mystical sentinels of the Archive have determined that you lack the necessary permissions to access this sacred knowledge. 
          This forbidden realm is protected by ancient wards that only allow passage to those with proper authority.
          <br /><br />
          <span className="text-red-400/70 italic">"Only the chosen may pass through these hallowed halls..."</span>
        </p>

        {/* Error Details with Enhanced Mystical Styling */}
        <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-6 mb-8 text-left backdrop-blur-sm relative">
          {/* Mystical Corner Decorations */}
          <div className="absolute top-2 left-2 text-red-400/30 text-xs">⚔️</div>
          <div className="absolute top-2 right-2 text-red-400/30 text-xs">🛡️</div>
          <div className="absolute bottom-2 left-2 text-red-400/30 text-xs">⚜️</div>
          <div className="absolute bottom-2 right-2 text-red-400/30 text-xs">🏛️</div>
          
          <h3 className="text-slate-200 mb-4 text-lg font-semibold flex items-center gap-2">
            <span className="text-red-400">🔍</span>
            Why Access is Forbidden:
          </h3>
          <ul className="text-slate-300 space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-red-400 mt-0.5">⚔️</span>
              <span>Insufficient user permissions or role requirements</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-400 mt-0.5">🛡️</span>
              <span>Resource access restricted to specific user groups</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-400 mt-0.5">⚜️</span>
              <span>Account suspended or banned from this area</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-red-400 mt-0.5">🏛️</span>
              <span>Resource requires admin or moderator privileges</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons with Enhanced Mystical Styling */}
        <div className="flex gap-4 justify-center flex-wrap">
          <a href="/" className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-xl flex items-center gap-2 relative overflow-hidden group">
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
            <span className="relative z-10">🏛️ Return to Archive</span>
          </a>
          <button 
            onClick={() => window.history.back()} 
            className="px-6 py-3 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-xl hover:bg-slate-600/50 hover:text-slate-200 transition-all duration-300 flex items-center gap-2 relative overflow-hidden group"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></span>
            <span className="relative z-10">⬅️ Go Back</span>
          </button>
        </div>

        {/* Mystical Footer */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-red-400/50">⚔️</span>
            <span>Archive of Obselis • Forbidden Realm</span>
            <span className="text-red-400/50">🛡️</span>
          </div>
          <p className="text-xs text-slate-600">Protected by ancient mystical wards</p>
        </div>
      </div>
    </div>
  );
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.is_admin) {
    return <ForbiddenErrorPage />;
  }

  return children;
};

export default AdminRoute; 