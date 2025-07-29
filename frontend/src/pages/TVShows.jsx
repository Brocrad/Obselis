import React, { useState, useEffect } from 'react';
import useAuth from '../hooks/useAuth';
import MediaPlayer from '../components/MediaPlayer';
import './TVShows.css';

const TVShows = () => {
  const { user } = useAuth();
  const [tvShows, setTvShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTVShows();
  }, []);

  const fetchTVShows = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/content/tv-shows', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch TV shows');
      }

      const data = await response.json();
      console.log('📺 Fetched TV shows data:', data);
      setTvShows(data.tvShows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEpisodes = async (showTitle, seasonNumber) => {
    try {
      const token = sessionStorage.getItem('token');
      const response = await fetch(`/api/content/tv-shows/${encodeURIComponent(showTitle)}/season/${seasonNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch episodes');
      }

      const data = await response.json();
      console.log('📺 Fetched episodes:', data.episodes);
      setEpisodes(data.episodes || []);
    } catch (err) {
      console.error('Error fetching episodes:', err);
      setEpisodes([]);
    }
  };

  const handleShowSelect = (show) => {
    console.log('📺 Selected show:', show);
    setSelectedShow(show);
    setSelectedSeason(null);
    setEpisodes([]);
    setPlayingEpisode(null);
    
    // Auto-select first season if available
    if (show.seasons && show.seasons.length > 0) {
      const firstSeason = show.seasons[0];
      console.log('📺 Auto-selecting season:', firstSeason.seasonNumber, 'for show:', show.title);
      setSelectedSeason(firstSeason.seasonNumber);
      fetchEpisodes(show.title, firstSeason.seasonNumber);
    }
  };

  const handleSeasonChange = (seasonNumber) => {
    console.log('📺 Season changed to:', seasonNumber, 'for show:', selectedShow?.title);
    setSelectedSeason(seasonNumber);
    setPlayingEpisode(null);
    if (selectedShow) {
      fetchEpisodes(selectedShow.title, seasonNumber);
    }
  };

  const handleEpisodePlay = (episode) => {
    console.log('🎬 Playing episode:', episode);
    setPlayingEpisode(episode);
  };

  const handleClosePlayer = () => {
    setPlayingEpisode(null);
  };

  const handleBackToShows = () => {
    setSelectedShow(null);
    setSelectedSeason(null);
    setEpisodes([]);
    setPlayingEpisode(null);
  };

  const filteredShows = tvShows.filter(show =>
    show.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const getRating = (episode) => {
    const metadata = episode.extended_metadata;
    if (metadata?.tmdbRating) {
      return `⭐ ${metadata.tmdbRating}/10`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="tv-shows-page">
        <div className="loading">Loading TV shows...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tv-shows-page">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="tv-shows-page">
      {playingEpisode && (
        <MediaPlayer
          content={playingEpisode}
          onClose={handleClosePlayer}
        />
      )}

      {!selectedShow ? (
        // TV Shows Grid View
        <>
          <div className="page-header mb-10 relative text-center">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl"></div>
            <div className="relative">
              {/* Main title with gradient and effects */}
              <div className="flex items-center justify-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-500/25">
                  <span className="text-white text-2xl">📺</span>
                </div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  TV Shows
                </h1>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/25">
                  <span className="text-white text-2xl">🍿</span>
                </div>
              </div>
              {/* Subtitle with elegant styling */}
              <p className="text-slate-300 text-lg font-medium bg-slate-800/50 backdrop-blur-sm rounded-full px-8 py-3 inline-block border border-slate-700/50">
                Browse and stream your favorite series
              </p>
              {/* Decorative elements */}
              <div className="flex justify-center mt-6 space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
              </div>
            </div>
          </div>

          {filteredShows.length === 0 ? (
            <div className="no-content">
              <p>No TV shows found.</p>
            </div>
          ) : (
            <div className="tv-shows-grid">
              {filteredShows.map((show) => (
                <div
                  key={show.title}
                  className="tv-show-card"
                  onClick={() => handleShowSelect(show)}
                >
                  <div className="show-thumbnail">
                    {show.thumbnail ? (
                      <img src={show.thumbnail} alt={show.title} />
                    ) : (
                      <div className="no-thumbnail">📺</div>
                    )}
                    <div className="show-overlay">
                      <div className="show-info">
                        <div className="season-count">
                          {show.seasons.length} Season{show.seasons.length !== 1 ? 's' : ''}
                        </div>
                        <div className="episode-count">
                          {show.totalEpisodes} Episode{show.totalEpisodes !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="show-details">
                    <h3 className="show-title">{show.title}</h3>
                    {show.description && (
                      <p className="show-description">
                        {show.description.length > 100
                          ? `${show.description.substring(0, 100)}...`
                          : show.description
                        }
                      </p>
                    )}
                    {show.extended_metadata?.tmdbRating && (
                      <div className="show-rating">
                        ⭐ {show.extended_metadata.tmdbRating}/10
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        // Episode List View
        <>
          <div className="episode-view-header">
            <button className="back-button" onClick={handleBackToShows}>
              ← Back to TV Shows
            </button>
            <div className="show-info-header">
              <h1>{selectedShow.title}</h1>
              {selectedShow.extended_metadata?.tmdbRating && (
                <div className="show-rating">
                  ⭐ {selectedShow.extended_metadata.tmdbRating}/10
                </div>
              )}
            </div>
            
            {selectedShow.seasons.length > 0 && (
              <div className="season-selector">
                <label htmlFor="season-select">Season:</label>
                <select
                  id="season-select"
                  value={selectedSeason || ''}
                  onChange={(e) => handleSeasonChange(parseInt(e.target.value))}
                  className="season-dropdown"
                >
                  {selectedShow.seasons.map((season) => (
                    <option key={season.seasonNumber} value={season.seasonNumber}>
                      Season {season.seasonNumber} ({season.episodeCount} episodes)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {episodes.length === 0 ? (
            <div className="no-episodes">
              <p>No episodes found for Season {selectedSeason}.</p>
              <p>Available seasons: {selectedShow.seasons.map(s => s.seasonNumber).join(', ')}</p>
            </div>
          ) : (
            <>
              <div className="season-header">
                <h2>Season {selectedSeason} Episodes ({episodes.length})</h2>
              </div>
              <div className="episodes-list">
                {episodes.map((episode) => (
                <div key={episode.id} className="episode-card">
                  <div className="episode-thumbnail">
                    {episode.thumbnail_path ? (
                      <img src={episode.thumbnail_path} alt={episode.title} />
                    ) : (
                      <div className="no-thumbnail">📺</div>
                    )}
                    <button
                      className="play-button"
                      onClick={() => handleEpisodePlay(episode)}
                    >
                      ▶️
                    </button>
                  </div>
                  
                  <div className="episode-info">
                    <div className="episode-header">
                      <h3 className="episode-title">
                        {episode.episode_number && (
                          <span className="episode-number">E{episode.episode_number}: </span>
                        )}
                        {episode.episode_title || episode.title}
                      </h3>
                      {getRating(episode) && (
                        <div className="episode-rating">{getRating(episode)}</div>
                      )}
                    </div>
                    
                    {episode.description && (
                      <p className="episode-description">{episode.description}</p>
                    )}
                    
                    <div className="episode-meta">
                      <span className="duration">
                        🕒 {formatDuration(episode.duration)}
                      </span>
                      <span className="file-size">
                        💾 {formatFileSize(episode.file_size)}
                      </span>
                      {episode.resolution && (
                        <span className="resolution">
                          📺 {episode.resolution}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TVShows; 