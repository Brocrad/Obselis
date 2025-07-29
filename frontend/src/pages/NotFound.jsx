import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const NotFound = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full opacity-30"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${3 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="text-center text-white relative z-10 max-w-2xl mx-auto px-6">
        {/* Mystical symbol */}
        <div className="text-8xl mb-6 animate-bounce" style={{ animationDuration: '3s' }}>
          🔮
        </div>

        {/* Error code */}
        <h1 className="text-7xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          404
        </h1>

        {/* Title */}
        <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-red-400 bg-clip-text text-transparent">
          Page Not Found
        </h2>

        {/* Subtitle */}
        <p className="text-xl text-slate-300 mb-6">
          The mystical archives have no record of this page
        </p>

        {/* Description */}
        <p className="text-slate-400 mb-8 leading-relaxed">
          The page you're looking for seems to have vanished into the digital void. 
          Perhaps it was never written, or maybe it has been moved to another realm.
        </p>

        {/* Search box */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="max-w-md mx-auto relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search the archives..."
              className="w-full px-6 py-4 bg-slate-800/50 border-2 border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/20 transition-all duration-300 backdrop-blur-sm"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-200"
            >
              🔍
            </button>
          </div>
        </form>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            to="/"
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-600 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <span>🏠</span>
            <span>Return Home</span>
          </Link>
          
          <button
            onClick={goBack}
            className="px-8 py-4 bg-slate-700/50 border border-slate-600 text-slate-300 font-semibold rounded-xl hover:bg-slate-600/50 hover:text-white transform hover:scale-105 transition-all duration-200 backdrop-blur-sm flex items-center gap-2"
          >
            <span>⬅️</span>
            <span>Go Back</span>
          </button>
        </div>

        {/* Additional navigation options */}
        <div className="mt-8 pt-8 border-t border-slate-700">
          <p className="text-slate-400 mb-4">Or explore these sections:</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/movies"
              className="px-4 py-2 bg-slate-800/50 text-slate-300 rounded-lg hover:bg-slate-700/50 hover:text-white transition-all duration-200 flex items-center gap-2"
            >
              <span>🎬</span>
              <span>Movies</span>
            </Link>
            <Link
              to="/tv-shows"
              className="px-4 py-2 bg-slate-800/50 text-slate-300 rounded-lg hover:bg-slate-700/50 hover:text-white transition-all duration-200 flex items-center gap-2"
            >
              <span>📺</span>
              <span>TV Shows</span>
            </Link>
            <Link
              to="/watch-history"
              className="px-4 py-2 bg-slate-800/50 text-slate-300 rounded-lg hover:bg-slate-700/50 hover:text-white transition-all duration-200 flex items-center gap-2"
            >
              <span>📚</span>
              <span>History</span>
            </Link>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default NotFound; 