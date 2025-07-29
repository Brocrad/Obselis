import React, { useState, useEffect } from 'react';

const ObselisLoadingAnimation = ({ onComplete }) => {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (stage < 5) {
        setStage(stage + 1);
      } else if (onComplete) {
        onComplete();
      }
    }, stage === 0 ? 600 : stage === 1 ? 800 : stage === 2 ? 600 : stage === 3 ? 800 : stage === 4 ? 1000 : 800);

    return () => clearTimeout(timer);
  }, [stage, onComplete]);

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + Math.random() * 15 + 5;
      });
    }, 100);

    return () => clearInterval(progressTimer);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-50 overflow-hidden">
      {/* Enhanced Background Particles */}
      <div className="absolute inset-0">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-blue-400/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
        
        {/* Floating mystical symbols (reduced and subtle) */}
        {['📚', '🎬', '💾'].map((symbol, i) => (
          <div
            key={`symbol-${i}`}
            className="absolute text-xl opacity-15 animate-pulse pointer-events-none mystical-symbol"
            style={{
              left: `${20 + i * 30}%`,
              top: `${25 + (i % 2) * 50}%`,
              animationDelay: `${i * 1.2}s`,
              animationDuration: `${5 + Math.random() * 2}s`,
              animation: 'float 6s ease-in-out infinite'
            }}
          >
            {symbol}
          </div>
        ))}
      </div>

      {/* Purple Dotted Circle (subtle) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div 
          className={`w-48 h-48 rounded-full border border-dotted border-purple-500/20 animate-spin transition-all duration-2000 ${stage >= 4 ? 'opacity-15' : 'opacity-0'}`}
          style={{ animationDuration: '30s' }}
        />
      </div>

      {/* Main Animation Container */}
      <div className="relative flex flex-col items-center">
        {/* Enhanced Tower Structure Animation */}
        <div className="relative mb-8">
          {/* Base Foundation */}
          <div className={`w-20 h-2 bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg transition-all duration-1000 ${stage >= 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />
          
          {/* Tower Levels - Building upward (4 levels, cleaner design) */}
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`absolute left-1/2 transform -translate-x-1/2 bg-gradient-to-t from-slate-600 to-slate-500 rounded-t-sm transition-all duration-800 ${
                stage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
              style={{
                width: `${80 - i * 6}px`,
                height: '10px',
                bottom: `${8 + i * 10}px`,
                animationDelay: `${i * 150}ms`
              }}
            />
          ))}

          {/* Enhanced Central Core */}
          {stage >= 3 && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse">
              </div>
            </div>
          )}
        </div>

        {/* Obselis Title with enhanced effects */}
        <div className={`text-center mb-6 transition-all duration-1200 ${stage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent mb-2 drop-shadow-lg">
            OBSELIS
          </h1>
          <div className={`transition-all duration-1000 ${stage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <p className="text-slate-400 text-base font-medium tracking-wider">
              🔮 Vault of Arcane Media 🔮
            </p>
          </div>
        </div>

        {/* Loading Progress */}
        <div className={`w-64 transition-all duration-1000 ${stage >= 3 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">📡 Accessing the Archive</span>
            <span className="text-blue-400 text-sm font-mono">{Math.min(100, Math.floor(progress))}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 shadow-lg"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Loading Messages */}
        <div className={`mt-6 text-center transition-all duration-800 ${stage >= 4 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-slate-500 text-sm">
            {stage === 4 && "✨ Initializing media archive..."}
          </div>
        </div>

        {/* Welcome Message */}
        <div className={`mt-4 text-center transition-all duration-800 ${stage >= 5 ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-blue-400 text-base font-medium animate-pulse">
            Welcome to the Archive
          </div>
        </div>


      </div>

      {/* Subtle Glow Effect */}
      <div className="absolute inset-0 bg-gradient-radial from-blue-500/5 via-transparent to-transparent pointer-events-none" />
    </div>
  );
};

export default ObselisLoadingAnimation; 