import React, { useState, useRef, useEffect, useMemo } from 'react';

const MediaPlayer = ({ content, onClose, resolution = 'auto', resumeTime = null }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(null);
  const [isUnsupportedFormat, setIsUnsupportedFormat] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [streamSessionId, setStreamSessionId] = useState(null);
  const [terminatedByAdmin, setTerminatedByAdmin] = useState(false);
  const [bandwidthUsed, setBandwidthUsed] = useState(0);
  const [canSeek, setCanSeek] = useState(false);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);
  const [savedProgress, setSavedProgress] = useState(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState(resolution);
  const [debugInfo, setDebugInfo] = useState('');
  const mediaRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const playPromiseRef = useRef(null); // Track play promises to avoid AbortError
  const bandwidthTrackerRef = useRef({ totalBytes: 0, lastUpdate: 0 });
  const sessionStartingRef = useRef(false); // Prevent multiple session starts
  const sessionStartedRef = useRef(false); // Track if session has been started for this content
  const videoLoadedRef = useRef(false); // Track if video has loaded metadata
  const loadTimeoutRef = useRef(null); // Track the video load timeout
  
  // Throttling refs to prevent rate limiting
  const lastProgressSaveRef = useRef(0);
  const lastSessionCheckRef = useRef(0);
  const streamUrlTestRef = useRef(null);

  // Detect mobile, orientation, and unsupported formats
  useEffect(() => {
    const checkMobileAndOrientation = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) || window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
      
      // Check orientation for mobile devices
      if (isMobileDevice) {
        const isLandscapeOrientation = window.innerWidth > window.innerHeight;
        setIsLandscape(isLandscapeOrientation);
        
        // Auto-enter fullscreen on landscape for mobile video
        if (isLandscapeOrientation && mediaRef.current && !isFullscreen) {
          console.log('[MediaPlayer] Mobile device rotated to landscape, auto-entering fullscreen');
          toggleFullscreen();
        }
      }
      
      // Check for unsupported formats on mobile
      if (isMobileDevice && content.file_path) {
        const fileExtension = content.file_path.split('.').pop()?.toLowerCase();
        const unsupportedFormats = ['mkv', 'avi', 'wmv', 'flv', 'mov'];
        if (unsupportedFormats.includes(fileExtension)) {
          setIsUnsupportedFormat(true);
          setError(`This format (.${fileExtension}) is not supported on mobile devices. Please use a transcoded version or try on desktop.`);
        }
      }
    };
    
    checkMobileAndOrientation();
    window.addEventListener('resize', checkMobileAndOrientation);
    window.addEventListener('orientationchange', checkMobileAndOrientation);
    
    return () => {
      window.removeEventListener('resize', checkMobileAndOrientation);
      window.removeEventListener('orientationchange', checkMobileAndOrientation);
    };
  }, [content.file_path, isFullscreen]);

  // Fullscreen event listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      
      console.log('[MediaPlayer] Fullscreen state changed:', isCurrentlyFullscreen);
      setIsFullscreen(isCurrentlyFullscreen);
    };

    const handleFullscreenError = (e) => {
      console.error('[MediaPlayer] Fullscreen error:', e);
    };

    // Add fullscreen event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('fullscreenerror', handleFullscreenError);
    document.addEventListener('webkitfullscreenerror', handleFullscreenError);
    document.addEventListener('mozfullscreenerror', handleFullscreenError);
    document.addEventListener('MSFullscreenError', handleFullscreenError);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('fullscreenerror', handleFullscreenError);
      document.removeEventListener('webkitfullscreenerror', handleFullscreenError);
      document.removeEventListener('mozfullscreenerror', handleFullscreenError);
      document.removeEventListener('MSFullscreenError', handleFullscreenError);
    };
  }, []);

  // Reset video loaded state when content changes
  useEffect(() => {
    videoLoadedRef.current = false;
    sessionStartedRef.current = false; // Reset session tracking for new content
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(true);
  }, [content.id]);

  // Handle resumeTime prop - auto-resume if provided
  useEffect(() => {
    console.log('[MediaPlayer] resumeTime useEffect triggered:', resumeTime);
    if (resumeTime && resumeTime > 0) {
      console.log(`[MediaPlayer] Auto-resuming from resumeTime prop: ${resumeTime}s`);
      setCurrentTime(resumeTime);
      setSavedProgress({ currentTime: resumeTime, duration: 0, progressPercentage: 0 });
      setShowResumePrompt(false);
      
      // Set the time when video is ready
      if (mediaRef.current && videoLoadedRef.current) {
        console.log('[MediaPlayer] Video ready, setting currentTime immediately');
        mediaRef.current.currentTime = resumeTime;
        
        // Auto-start playback if we have a resumeTime (user made selection in MediaCard)
        console.log('[MediaPlayer] Auto-starting playback from MediaCard selection');
        mediaRef.current.play().catch(error => {
          console.error('[MediaPlayer] Auto-play failed:', error);
        });
      } else {
        console.log('[MediaPlayer] Video not ready, will set currentTime when loaded');
      }
    }
  }, [resumeTime]);

  // Event handlers for video element
  const handleLoadedMetadata = () => {
    console.log('[MediaPlayer] handleLoadedMetadata called');
    if (mediaRef.current) {
      videoLoadedRef.current = true;
      setDuration(mediaRef.current.duration);
      setIsLoading(false);
      
      // Clear the load timeout since video has loaded successfully
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
        console.log('[MediaPlayer] Cleared video load timeout - video loaded successfully');
      }
      
      console.log('[MediaPlayer] loadedmetadata:', mediaRef.current.duration);
      console.log('[MediaPlayer] resumeTime prop:', resumeTime);
      console.log('[MediaPlayer] currentTime state:', currentTime);
      console.log('[MediaPlayer] video currentTime:', mediaRef.current.currentTime);
      
      // If we have a currentTime set from resumeTime prop, apply it
      if (currentTime > 0 && mediaRef.current.currentTime !== currentTime) {
        console.log(`[MediaPlayer] Setting current time to ${currentTime}s from state`);
        mediaRef.current.currentTime = currentTime;
      }
      
      // Auto-start playback if we have a resumeTime (user made selection in MediaCard)
      if (resumeTime && resumeTime > 0) {
        console.log('[MediaPlayer] Auto-starting playback from MediaCard selection');
        mediaRef.current.play().catch(error => {
          console.error('[MediaPlayer] Auto-play failed:', error);
        });
      }
      
      // Save initial progress if we have a current time
      if (mediaRef.current.currentTime > 0) {
        saveWatchProgress(mediaRef.current.currentTime, mediaRef.current.duration, false);
      }
    }
  };

  const handleTimeUpdate = () => {
    const media = mediaRef.current;
    if (media) {
      setCurrentTime(media.currentTime);
    }
  };

  const handleWaiting = () => {
    setIsLoading(true);
    console.log('[MediaPlayer] waiting (buffering)');
  };

  const handlePlaying = () => {
    setIsLoading(false);
    console.log('[MediaPlayer] playing');
  };

  const handlePause = () => {
    setIsPlaying(false);
    // Save progress when user pauses
    if (mediaRef.current && duration > 0) {
      const currentTime = mediaRef.current.currentTime;
      const isCompleted = currentTime >= duration * 0.95;
      saveWatchProgress(currentTime, duration, isCompleted);
    }
  };

  const handleError = (e) => {
    console.error('[MediaPlayer] Video error:', e);
    const video = e.target;
    let errorMessage = 'An error occurred while playing the video.';
    
    if (video.error) {
      switch (video.error.code) {
        case 1:
          errorMessage = 'The video was aborted.';
          break;
        case 2:
          errorMessage = 'Network error occurred while loading the video.';
          break;
        case 3:
          errorMessage = 'The video could not be decoded. This format may not be supported.';
          break;
        case 4:
          errorMessage = 'The video format is not supported by your browser.';
          break;
        default:
          errorMessage = `Playback error (${video.error.code}): ${video.error.message}`;
      }
    }
    
    // Check if it's a format issue
    if (content.file_path && content.file_path.toLowerCase().endsWith('.mkv')) {
      errorMessage = 'MKV format is not supported in this browser. Please use a transcoded version (MP4) or try a different browser.';
    }
    
    console.error('[MediaPlayer] Setting error:', errorMessage);
    setError(errorMessage);
    setIsLoading(false);
  };

  // Video element cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending play promises to prevent AbortError
      if (playPromiseRef.current) {
        playPromiseRef.current.catch(() => {
          // Ignore the promise rejection - element is being cleaned up
        });
        playPromiseRef.current = null;
      }
      
      // Pause media before cleanup to prevent issues
      if (mediaRef.current && !mediaRef.current.paused) {
        mediaRef.current.pause();
      }
      
      // Remove landscape class and overlays when component unmounts
      document.body.classList.remove('force-landscape');
      const landscapeOverlay = document.getElementById('landscape-overlay');
      const landscapeContainer = document.getElementById('landscape-container');
      const landscapeInstructions = document.getElementById('landscape-instructions');
      if (landscapeOverlay) {
        landscapeOverlay.remove();
      }
      if (landscapeContainer) {
        landscapeContainer.remove();
      }
      if (landscapeInstructions) {
        landscapeInstructions.remove();
      }
    };
  }, []);

  // Auto-hide controls for video
  useEffect(() => {
    if (content.media_type === 'video') {
      const resetControlsTimeout = () => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
        setShowControls(true);
        controlsTimeoutRef.current = setTimeout(() => {
          if (isPlaying && !isMobile) {
            setShowControls(false);
          }
        }, isMobile ? 5000 : 3000); // Longer timeout on mobile
      };

      const handleMouseMove = () => resetControlsTimeout();
      const handleMouseLeave = () => {
        if (isPlaying && !isMobile) {
          setShowControls(false);
        }
      };

      const handleTouchStart = () => {
        // On mobile, show controls on touch and auto-hide after delay
        setShowControls(true);
        resetControlsTimeout();
      };

      const container = containerRef.current;
      if (container) {
        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', handleMouseLeave);
        container.addEventListener('touchstart', handleTouchStart);
        resetControlsTimeout();

        return () => {
          container.removeEventListener('mousemove', handleMouseMove);
          container.removeEventListener('mouseleave', handleMouseLeave);
          container.removeEventListener('touchstart', handleTouchStart);
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
          }
        };
      }
    }
  }, [isPlaying, isMobile, content.media_type]);

  // Start streaming session
  useEffect(() => {
    let isMounted = true;
    
    async function startSession() {
      if (sessionStartingRef.current || sessionStartedRef.current) return;
      sessionStartingRef.current = true;
      
      if (window.streamingManager && content?.id) {
        try {
          const sessionId = await window.streamingManager.startSession(
            content.id,
            content.title,
            'Auto' // Quality
          );
          console.log('[MediaPlayer] Streaming session started with real-time bandwidth tracking, ID:', sessionId);
          if (isMounted) {
            setStreamSessionId(sessionId);
            // Reset bandwidth tracking display
            setBandwidthUsed(0);
            
            // Add timeout to detect if video doesn't load
            loadTimeoutRef.current = setTimeout(() => {
              if (isMounted && !duration) {
                console.error('[MediaPlayer] Video failed to load within 10 seconds');
                setError('Video failed to load. Please try again.');
              }
            }, 10000);
          }
        } catch (error) {
          console.error('[MediaPlayer] Failed to start streaming session:', error);
          setError('Failed to start streaming session. Please try again.');
        } finally {
          sessionStartingRef.current = false;
        }
      } else {
        console.error('[MediaPlayer] Cannot start session - streamingManager or content.id not available');
        setError('Streaming manager not available. Please refresh the page.');
        sessionStartingRef.current = false;
      }
    }
    
    startSession();
    
    return () => { 
      isMounted = false; 
      sessionStartingRef.current = false;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, [content.id, content.title]);

  // End session on unmount or tab close
  useEffect(() => {
    const handleSessionEnd = async () => {
      if (streamSessionId && window.streamingManager) {
        await window.streamingManager.endSession(streamSessionId);
      }
    };
    window.addEventListener('beforeunload', handleSessionEnd);
    return () => {
      handleSessionEnd();
      window.removeEventListener('beforeunload', handleSessionEnd);
    };
    // eslint-disable-next-line
  }, [streamSessionId]);

  // Poll for session termination by admin
  useEffect(() => {
    if (!streamSessionId) return;
    let interval;
    const checkSession = async () => {
      // Throttle session checks to prevent rate limiting (max once every 20 seconds)
      const now = Date.now();
      if (now - lastSessionCheckRef.current < 20000) {
        console.log('[MediaPlayer] Skipping session check - throttled');
        return;
      }
      lastSessionCheckRef.current = now;
      
      try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/streaming/session/check/${streamSessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (!data.isActive) {
            setTerminatedByAdmin(true);
            if (mediaRef.current && !mediaRef.current.paused) {
              mediaRef.current.pause();
            }
          }
        }
      } catch (e) {
        console.error('Session check error:', e);
      }
    };
    interval = setInterval(checkSession, 20000); // Increased from 10 seconds to 20 seconds
    return () => clearInterval(interval);
  }, [streamSessionId]);

  // Bandwidth tracking functions - REMOVED ESTIMATION-BASED TRACKING
  // Now relying on server-side real-time tracking via the streaming endpoint
  const updateBandwidthUsage = async (bytesTransferred) => {
    // This function is now deprecated - server tracks bandwidth automatically
    // Keeping for backward compatibility but not using estimation
    console.log(`📊 Bandwidth tracking now handled server-side for session ${streamSessionId}`);
  };

  const trackVideoProgress = () => {
    // REMOVED: No longer estimating bandwidth on frontend
    // Server now tracks actual bytes transferred during streaming
    console.log(`📊 Real-time bandwidth tracking active on server for session ${streamSessionId}`);
  };

  // Start/stop bandwidth tracking based on playback state
  useEffect(() => {
    // BANDWIDTH TRACKING: Now handled entirely server-side
    // Server tracks actual bytes transferred during streaming requests
    if (streamSessionId) {
      console.log(`📊 Real-time bandwidth tracking enabled for session ${streamSessionId}`);
    }
  }, [streamSessionId]);

  // Fetch actual bandwidth usage from server
  const fetchBandwidthUsage = async () => {
    if (!streamSessionId) return;
    
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/streaming/session/bandwidth/${streamSessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setBandwidthUsed(data.bandwidth || 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch bandwidth usage:', error);
    }
  };

  // Periodically fetch bandwidth usage from server
  useEffect(() => {
    if (!streamSessionId) return;
    
    // Fetch immediately
    fetchBandwidthUsage();
    
    // Then fetch every 30 seconds
    const interval = setInterval(fetchBandwidthUsage, 30000);
    
    return () => clearInterval(interval);
  }, [streamSessionId]);

  const togglePlay = async () => {
    const media = mediaRef.current;
    if (!media) return;

    try {
      if (media.paused) {
        // Start bandwidth tracking when play begins
        bandwidthTrackerRef.current.lastUpdate = media.currentTime;
        
        playPromiseRef.current = media.play();
        await playPromiseRef.current;
        playPromiseRef.current = null;
      } else {
        media.pause();
      }
    } catch (error) {
      console.error('Play/pause error:', error);
      playPromiseRef.current = null;
    }
  };

  const handleSeek = (e) => {
    const media = mediaRef.current;
    if (!media || isLoading || !duration || isNaN(duration) || duration === Infinity) {
      console.log('[MediaPlayer] Seek blocked: isLoading:', isLoading, 'duration:', duration);
      return;
    }

    let clientX;
    if (e.type === 'touchstart' && e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if (typeof e.clientX === 'number') {
      clientX = e.clientX;
    } else {
      console.log('Unknown event type for seek:', e);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const newTime = pos * duration;

    console.log(`🎯 Seeking to: ${newTime.toFixed(2)}s (${formatTime(newTime)}) [clientX: ${clientX}, rect.left: ${rect.left}, width: ${rect.width}, pos: ${pos}, duration: ${duration}]`);

    media.currentTime = newTime;
    
    // Save progress after seeking
    setTimeout(() => {
      if (media && duration > 0) {
        const currentTime = media.currentTime;
        const isCompleted = currentTime >= duration * 0.95;
        saveWatchProgress(currentTime, duration, isCompleted);
      }
    }, 100);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume;
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = mediaRef.current;
    if (!container) return;

    if (!isFullscreen) {
      // Mobile-specific fullscreen handling
      if (isMobile && video) {
        console.log('[MediaPlayer] Attempting mobile fullscreen');
        
        // Try video element fullscreen first (works better on mobile)
        if (video.requestFullscreen) {
          video.requestFullscreen().catch(err => {
            console.log('[MediaPlayer] Video fullscreen failed, trying container:', err);
            tryContainerFullscreen();
          });
        } else if (video.webkitRequestFullscreen) {
          video.webkitRequestFullscreen().catch(err => {
            console.log('[MediaPlayer] Video webkit fullscreen failed, trying container:', err);
            tryContainerFullscreen();
          });
        } else if (video.webkitEnterFullscreen) {
          // iOS Safari specific
          video.webkitEnterFullscreen();
        } else {
          tryContainerFullscreen();
        }
      } else {
        // Desktop fullscreen
        tryContainerFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      } else if (document.webkitCancelFullScreen) {
        document.webkitCancelFullScreen();
      }
      
      // Remove landscape class and overlays when exiting fullscreen
      document.body.classList.remove('force-landscape');
      const landscapeOverlay = document.getElementById('landscape-overlay');
      const landscapeContainer = document.getElementById('landscape-container');
      const landscapeInstructions = document.getElementById('landscape-instructions');
      if (landscapeOverlay) {
        landscapeOverlay.remove();
      }
      if (landscapeContainer) {
        landscapeContainer.remove();
      }
      if (landscapeInstructions) {
        landscapeInstructions.remove();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const tryContainerFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    } else if (container.webkitEnterFullscreen) {
      container.webkitEnterFullscreen();
    }
  };

  const enterLandscapeFullscreen = () => {
    const video = mediaRef.current;
    if (!video || !isMobile) {
      setDebugInfo('Mobile video not ready');
      setTimeout(() => setDebugInfo(''), 2000);
      return;
    }

    setDebugInfo('Manual landscape mode - rotate your device!');
    console.log('[MediaPlayer] Manual landscape mode activated');
    
    // Simple manual approach - just show instructions
    try {
      // Add a simple overlay with instructions
      const instructionOverlay = document.createElement('div');
      instructionOverlay.id = 'landscape-instructions';
      instructionOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 18px;
        text-align: center;
        padding: 20px;
      `;

      instructionOverlay.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">📱</div>
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Rotate Your Device</div>
        <div style="font-size: 16px; margin-bottom: 20px;">Turn your phone sideways for landscape viewing</div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 30px;">Make sure rotation lock is OFF</div>
        <button id="close-instructions" style="
          padding: 12px 24px;
          background: #007bff;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          cursor: pointer;
        ">Got It!</button>
      `;

      document.body.appendChild(instructionOverlay);

      // Close button handler
      document.getElementById('close-instructions').onclick = () => {
        instructionOverlay.remove();
        setDebugInfo('Manual landscape mode ready');
        setTimeout(() => setDebugInfo(''), 2000);
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        if (instructionOverlay.parentNode) {
          instructionOverlay.remove();
          setDebugInfo('Manual landscape mode ready');
          setTimeout(() => setDebugInfo(''), 2000);
        }
      }, 5000);

    } catch (error) {
      setDebugInfo('Manual mode failed');
      setTimeout(() => setDebugInfo(''), 2000);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStreamUrl = () => {
    if (!streamSessionId) return null;
    
    const token = sessionStorage.getItem('token');
    const baseUrl = `${window.location.origin}/api/content/${content.id}/stream`;
    const resolutionParam = selectedResolution && selectedResolution !== 'auto' ? `&resolution=${encodeURIComponent(selectedResolution)}` : '';
    const url = `${baseUrl}?token=${encodeURIComponent(token)}&sessionId=${streamSessionId}${resolutionParam}`;
    
    console.log('🔗 Stream URL:', url);
    return url;
  };

  // Log when streamSessionId changes (reduced logging)
  useEffect(() => {
    if (streamSessionId) {
      console.log('[MediaPlayer] streamSessionId changed:', streamSessionId);
    }
  }, [streamSessionId]);

  // Monitor when video element is created and force load if needed (reduced logging)
  useEffect(() => {
    if (mediaRef.current && streamSessionId) {
      // Force load the video if it's not already loading
      if (mediaRef.current.readyState === 0) {
        console.log('[MediaPlayer] Forcing video load');
        mediaRef.current.load();
      }
      
      // Check if src is actually set
      setTimeout(() => {
        if (mediaRef.current && mediaRef.current.readyState === 0) {
          const streamUrl = getStreamUrl();
          console.log('[MediaPlayer] Re-setting video src to:', streamUrl);
          mediaRef.current.src = streamUrl;
          mediaRef.current.load();
        }
      }, 500);
    }
  }, [mediaRef.current, streamSessionId]);

  // Monitor video element src changes (reduced logging)
  useEffect(() => {
    if (mediaRef.current && streamSessionId) {
      console.log('[MediaPlayer] Video element src monitoring - sessionId:', streamSessionId);
    }
  }, [streamSessionId]);

  // Monitor when video element ref changes (reduced logging)
  useEffect(() => {
    if (mediaRef.current) {
      console.log('[MediaPlayer] Video element ref is now set');
    }
  }, [mediaRef.current]);

  const renderMediaElement = useMemo(() => {
    // Only render video/audio if we have a sessionId
    if (!streamSessionId) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          <p className="text-white text-sm mt-4">Starting secure streaming session...</p>
        </div>
      );
    }

    const streamUrl = getStreamUrl();

    if (content.media_type === 'video') {
      return (
        <div className={`relative w-full h-full ${isMobile && isLandscape ? 'landscape-mode' : ''}`}>
          <video
            ref={mediaRef}
            src={streamUrl}
            className={`w-full h-full object-contain ${isMobile ? 'mobile-video' : ''}`}
            data-debug-src={streamUrl}
            poster={content.thumbnail_path}
            preload="metadata"
            playsInline
            crossOrigin="anonymous"
            controls={false}
            muted={false}
            webkit-playsinline="true"
            x5-playsinline="true"
            x5-video-player-type="h5"
            x5-video-player-fullscreen="true"
            onClick={togglePlay}
            onLoadStart={() => {
              console.log('[MediaPlayer] Video loadStart event');
              setIsLoading(true);
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
            onTimeUpdate={handleTimeUpdate}
            onPause={handlePause}
            onError={handleError}

            onCanPlay={() => {
              console.log('[MediaPlayer] Video canPlay event');
              setIsLoading(false);
            }}
            onCanPlayThrough={() => {
              console.log('[MediaPlayer] Video canPlayThrough event');
              setIsLoading(false);
            }}
            onAbort={() => {
              console.log('[MediaPlayer] Video abort event');
            }}
            onStalled={() => {
              console.log('[MediaPlayer] Video stalled event');
            }}
            onSuspend={() => {
              console.log('[MediaPlayer] Video suspend event');
            }}
            onLoadedData={() => {
              console.log('[MediaPlayer] Video loadedData event');
            }}
            onProgress={() => {
              console.log('[MediaPlayer] Video progress event');
            }}
            onPlay={() => setIsPlaying(true)}
            onEnded={() => setIsPlaying(false)}
          >
            Your browser does not support the video tag.
          </video>
          
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                <p className="text-white text-sm">Buffering video...</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (content.media_type === 'audio') {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-6 sm:mb-8">
            <span className="text-4xl sm:text-6xl">🎵</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center px-4">{content.title}</h2>
          <p className="text-slate-400 mb-6 sm:mb-8">Audio Player</p>
          
          {/* Loading indicator for audio */}
          {isLoading && (
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <p className="text-white text-sm">Loading audio...</p>
            </div>
          )}
          
          <audio
            ref={mediaRef}
            className="hidden"
            preload="metadata"
            crossOrigin="anonymous"
            onLoadStart={() => setIsLoading(true)}
            onCanPlay={() => setIsLoading(false)}
            onTimeUpdate={handleTimeUpdate}
            onError={(e) => {
              console.error('Audio error:', e);
              setIsLoading(false);
            }}
          >
            <source src={streamUrl} type="audio/mp4" />
            <source src={streamUrl} type={content.mime_type} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    if (content.media_type === 'image') {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={streamUrl}
            alt={content.title}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      );
    }

    // Document or other types
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-800 p-4">
        <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-green-500 to-blue-500 rounded-large flex items-center justify-center mb-6 sm:mb-8">
          <span className="text-4xl sm:text-6xl">📄</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 text-center">{content.title}</h2>
        <p className="text-slate-400 mb-6 sm:mb-8">Document Preview</p>
        <a
          href={streamUrl}
          download={content.original_filename}
          className="btn-modern bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white text-sm sm:text-base"
        >
          Download File
        </a>
      </div>
    );
  }, [streamSessionId, content, mediaRef, isLoading, isPlaying, volume, selectedResolution]);

  const hasMediaControls = content.media_type === 'video' || content.media_type === 'audio';

  // Watch Progress Functions
  const saveWatchProgress = async (currentTime, duration, completed = false) => {
    // Throttle progress saving to prevent rate limiting (max once every 15 seconds)
    const now = Date.now();
    if (now - lastProgressSaveRef.current < 15000) {
      console.log('[MediaPlayer] Skipping progress save - throttled');
      return;
    }
    lastProgressSaveRef.current = now;
    
    try {
      console.log(`[MediaPlayer] Saving progress: ${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s (completed: ${completed})`);
      
      const response = await fetch(`/api/content/${content.id}/watch-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentTime,
          duration,
          completed
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📺 Progress saved successfully:`, data);
      } else {
        console.error('Failed to save progress:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to save watch progress:', error);
    }
  };

  const loadWatchProgress = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/content/${content.id}/watch-progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[MediaPlayer] Load progress response:', data);
        
        if (data.hasProgress && data.progress) {
          const progress = data.progress;
          console.log(`[MediaPlayer] Found saved progress: ${progress.currentTime.toFixed(1)}s (${progress.progressPercentage.toFixed(1)}%)`);
          
          // Store the progress but don't show prompt - let MediaCard handle that
          setSavedProgress(progress);
          
          // If we have a resumeTime prop, use that instead
          if (!resumeTime) {
            setCurrentTime(progress.currentTime);
          }
        }
      }
    } catch (error) {
      console.error('Load watch progress error:', error);
    }
  };

  // Load saved progress on mount
  useEffect(() => {
    if (content?.id) {
      loadWatchProgress();
    }
  }, [content?.id]);

  // Auto-save progress every 60 seconds (increased from 30 seconds)
  useEffect(() => {
    if (!isPlaying || !duration) return;
    
    const interval = setInterval(() => {
      if (mediaRef.current && duration > 0) {
        const currentTime = mediaRef.current.currentTime;
        const isCompleted = currentTime >= duration * 0.95;
        saveWatchProgress(currentTime, duration, isCompleted);
      }
    }, 60000); // Increased from 30 seconds to 60 seconds
    
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (mediaRef.current && duration > 0) {
        const currentTime = mediaRef.current.currentTime;
        const isCompleted = currentTime >= duration * 0.95;
        saveWatchProgress(currentTime, duration, isCompleted);
      }
    };
  }, [duration]);

  // Save progress when user navigates away
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (mediaRef.current && duration > 0) {
        const currentTime = mediaRef.current.currentTime;
        const isCompleted = currentTime >= duration * 0.95;
        saveWatchProgress(currentTime, duration, isCompleted);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [duration]);

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
      <div 
        ref={containerRef}
        className={`relative w-full h-full bg-black video-player-container ${
          isFullscreen ? 'rounded-none' : 'rounded-lg overflow-hidden'
        }`}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => {
          if (isPlaying && !isMobile) {
            setShowControls(false);
          }
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className={`absolute top-2 right-2 sm:top-4 sm:right-4 z-20 w-8 h-8 sm:w-10 sm:h-10 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white transition-all duration-200 ${
            showControls || !hasMediaControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="text-lg sm:text-xl">✕</span>
        </button>

        {/* Mobile Landscape Hint */}
        {isMobile && !isLandscape && (
          <div className="absolute top-2 left-2 z-20 bg-black/70 rounded-lg px-3 py-2 text-white text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-lg">📱</span>
              <span>Rotate for better view</span>
            </div>
          </div>
        )}

        {/* Landscape Indicator */}
        {isMobile && isLandscape && (
          <div className="absolute top-2 left-2 z-20 bg-green-600/80 rounded-lg px-3 py-2 text-white text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-lg">🔄</span>
              <span>Landscape Mode</span>
            </div>
          </div>
        )}

        {/* Debug Info Display */}
        {debugInfo && (
          <div className="absolute top-16 left-4 right-4 z-30 bg-black/80 text-white p-3 rounded-lg text-sm font-mono">
            <div className="flex items-center justify-between">
              <span>{debugInfo}</span>
              <button 
                onClick={() => setDebugInfo('')}
                className="text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}



        {/* Error Display */}
        {error && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-4 z-10">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-white mb-2">Playback Error</h3>
              <p className="text-slate-300 mb-4">{error}</p>
              {isUnsupportedFormat && (
                <div className="text-sm text-slate-400 mb-4">
                  <p>Mobile browsers have limited format support.</p>
                  <p>Try selecting a transcoded version or use desktop.</p>
                </div>
              )}
              <button
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Media Content */}
        <div className="w-full h-full">
          {renderMediaElement}
        </div>

        {/* Media Controls */}
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 video-controls ${
          showControls || isMobile ? 'opacity-100' : 'opacity-0'
        }`}>
          {/* Progress Bar */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-6">
            <div 
              className={`w-full h-2 sm:h-2 bg-white/20 rounded-full cursor-pointer hover:h-3 sm:hover:h-3 transition-all duration-200 video-progress-bar ${(!duration || isNaN(duration) || duration === Infinity) ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={handleSeek}
              onTouchStart={handleSeek}
            >
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-200"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Control Buttons */}
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Play/Pause Button */}
              <button
                onClick={togglePlay}
                disabled={isLoading}
                className={`w-12 h-12 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white transition-all duration-200 ${
                  isLoading 
                    ? 'bg-white/10 cursor-not-allowed' 
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                {isLoading ? (
                  <div className="w-5 h-5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <span className="text-xl sm:text-lg">
                    {isPlaying ? '⏸️' : '▶️'}
                  </span>
                )}
              </button>

              {/* Time Display */}
              <div className="text-white text-sm sm:text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Volume Control - Hidden on mobile */}
              {!isMobile && (
                <div className="flex items-center space-x-2">
                  <span className="text-white text-sm">🔊</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-16 sm:w-20 h-1 bg-white/20 rounded-full appearance-none slider"
                  />
                </div>
              )}

              {/* Bandwidth Usage Indicator */}
              {streamSessionId && bandwidthUsed > 0 && (
                <div className="flex items-center space-x-1">
                  <span className="text-white text-xs">📊</span>
                  <span className="text-white text-xs font-mono">
                    {bandwidthUsed.toFixed(2)}GB
                  </span>
                </div>
              )}

              {/* Fullscreen Button - Enhanced for mobile */}
              {content.media_type === 'video' && (
                <button
                  onClick={toggleFullscreen}
                  className={`${isMobile ? 'w-14 h-14' : 'w-12 h-12 sm:w-10 sm:h-10'} bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all duration-200 ${isMobile ? 'border-2 border-white/30' : ''} fullscreen-button`}
                  title={isMobile ? "Tap for fullscreen" : "Toggle fullscreen"}
                >
                  <span className={`${isMobile ? 'text-2xl' : 'text-lg sm:text-base'}`}>
                    {isFullscreen ? '⛶' : '⛶'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Info Overlay - Enhanced for mobile */}
        {content.media_type === 'video' && !isMobile && (
          <div className={`absolute top-2 left-2 sm:top-4 sm:left-4 bg-black/60 backdrop-blur-sm rounded-lg p-3 sm:p-4 max-w-xs sm:max-w-md transition-opacity duration-300 ${
            showControls || !hasMediaControls ? 'opacity-100' : 'opacity-0'
          }`}>
            <h2 className="text-sm sm:text-xl font-bold text-white mb-1 sm:mb-2 line-clamp-2">{content.title}</h2>
            {content.description && (
              <p className="text-slate-300 text-xs sm:text-sm mb-1 sm:mb-2 line-clamp-2">{content.description}</p>
            )}
            <div className="text-slate-400 text-xs space-y-0.5 sm:space-y-1">
              <p>Type: {content.media_type}</p>
              <p>Size: {Math.round(content.file_size / (1024 * 1024) * 100) / 100} MB</p>
              {content.resolution && <p>Resolution: {content.resolution}</p>}
              {content.duration && <p>Duration: {formatTime(content.duration)}</p>}
              <p>Views: {content.views}</p>
              <p>Uploaded by: {content.uploader_name}</p>
            </div>
          </div>
        )}

        {/* Mobile-friendly title overlay */}
        {content.media_type === 'video' && isMobile && (
          <div className={`absolute top-2 left-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg p-2 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}>
            <h2 className="text-sm font-bold text-white line-clamp-1">{content.title}</h2>
          </div>
        )}
        
        {terminatedByAdmin && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
            <div className="text-center text-white space-y-4">
              <div className="text-4xl">🛑</div>
              <div className="text-xl font-bold">Stream terminated by admin</div>
              <div className="text-sm">This session was ended by an administrator.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaPlayer; 