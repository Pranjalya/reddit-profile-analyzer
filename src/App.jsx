import { useState, useEffect } from 'react';
import { compileStalkerProfile, fetchCommentById, normalizeUsername } from './api';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [error, setError] = useState(null);
  const [stalkedUser, setStalkedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [stalkHistory, setStalkHistory] = useState([]);

  // Feed options
  const [feedFilter, setFeedFilter] = useState('all'); // all, posts, comments
  const [feedSubredditFilter, setFeedSubredditFilter] = useState('');
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [feedSort, setFeedSort] = useState('newest'); // newest, oldest, highest, lowest

  // Context drawer
  const [selectedComment, setSelectedComment] = useState(null);
  const [parentComment, setParentComment] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);

  // Load search history from local storage on mount
  useEffect(() => {
    const history = localStorage.getItem('reddit_stalker_history');
    if (history) {
      try {
        setStalkHistory(JSON.parse(history));
      } catch (e) {
        setStalkHistory([]);
      }
    } else {
      const defaultHistory = [];
      setStalkHistory(defaultHistory);
      localStorage.setItem('reddit_stalker_history', JSON.stringify(defaultHistory));
    }
  }, []);

  const saveToHistory = (username) => {
    const cleanName = normalizeUsername(username);
    if (!cleanName) return;
    
    // Add to history (case-insensitive deduplication, put new target at the start)
    const updated = [
      cleanName,
      ...stalkHistory.filter(name => name.toLowerCase() !== cleanName.toLowerCase())
    ].slice(0, 12); // Limit history to 12 items

    setStalkHistory(updated);
    localStorage.setItem('reddit_stalker_history', JSON.stringify(updated));
  };

  const removeFromHistory = (e, usernameToRemove) => {
    e.stopPropagation();
    const updated = stalkHistory.filter(name => name !== usernameToRemove);
    setStalkHistory(updated);
    localStorage.setItem('reddit_stalker_history', JSON.stringify(updated));
  };

  const handleSearch = async (rawQuery) => {
    const cleanUsername = normalizeUsername(rawQuery);
    if (!cleanUsername) return;
    setLoading(true);
    setError(null);
    setLoadingProgress('Initializing stalker sweep...');
    
    try {
      setLoadingProgress('Scanning posts and comments...');
      const profile = await compileStalkerProfile(cleanUsername, ({ commentsCount, postsCount }) => {
        const parts = [];
        if (commentsCount > 0) parts.push(`${commentsCount} comment${commentsCount === 1 ? '' : 's'}`);
        if (postsCount > 0) parts.push(`${postsCount} post${postsCount === 1 ? '' : 's'}`);
        const progressStr = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        setLoadingProgress(`Scanning posts and comments...${progressStr}`);
      });
      
      if (profile.comments.length === 0 && profile.posts.length === 0) {
        throw new Error(`No posts or comments found for "${cleanUsername}" in Reddit index.`);
      }

      setStalkedUser(profile);
      saveToHistory(profile.username);
      setActiveTab('overview');
      // Reset feed states for new user
      setFeedFilter('all');
      setFeedSubredditFilter('');
      setFeedSearchQuery('');
      setFeedSort('newest');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to scan profile. Reddit API might be down or user does not exist.');
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  const openCommentContext = async (comment) => {
    setSelectedComment(comment);
    setParentComment(null);
    
    if (comment.parent_id && comment.parent_id.startsWith('t1_')) {
      setContextLoading(true);
      try {
        const parent = await fetchCommentById(comment.parent_id);
        setParentComment(parent);
      } catch (e) {
        console.error('Failed to load parent comment:', e);
        setParentComment({ body: '[Parent comment deleted or not indexed by Reddit API]', author: '[unknown]' });
      } finally {
        setContextLoading(false);
      }
    }
  };

  // Process data for charts
  const getSubredditActivity = () => {
    if (!stalkedUser || !stalkedUser.subreddits) return [];
    return stalkedUser.subreddits;
  };

  const getSubredditFlair = (subName) => {
    if (!stalkedUser || !stalkedUser.flairs) return '';
    // Flairs might be a list of { subreddit: "...", author_flair_text: "..." }
    const match = stalkedUser.flairs.find(f => f.subreddit.toLowerCase() === subName.toLowerCase());
    return match ? match.author_flair_text : '';
  };

  // Generate sleep heatmap grid (24 hours x 7 days)
  const getHeatmapData = () => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    if (!stalkedUser) return { grid, maxCount: 0 };

    const items = [...stalkedUser.comments, ...stalkedUser.posts];
    let maxCount = 0;

    items.forEach(item => {
      if (!item.created_utc) return;
      const date = new Date(item.created_utc * 1000);
      const day = date.getDay(); // 0 (Sun) to 6 (Sat)
      const hour = date.getHours(); // 0 to 23
      grid[day][hour]++;
      if (grid[day][hour] > maxCount) {
        maxCount = grid[day][hour];
      }
    });

    return { grid, maxCount };
  };

  // Get filtered and sorted feed items
  const getFilteredFeed = () => {
    if (!stalkedUser) return [];

    let items = [];
    if (feedFilter === 'all') {
      items = [
        ...stalkedUser.comments.map(c => ({ ...c, type: 'comment' })),
        ...stalkedUser.posts.map(p => ({ ...p, type: 'post' }))
      ];
    } else if (feedFilter === 'posts') {
      items = stalkedUser.posts.map(p => ({ ...p, type: 'post' }));
    } else {
      items = stalkedUser.comments.map(c => ({ ...c, type: 'comment' }));
    }

    // Filter by Subreddit
    if (feedSubredditFilter) {
      items = items.filter(item => item.subreddit.toLowerCase() === feedSubredditFilter.toLowerCase());
    }

    // Filter by Keyword
    if (feedSearchQuery.trim()) {
      const q = feedSearchQuery.toLowerCase();
      items = items.filter(item => {
        const bodyText = (item.body || item.selftext || '').toLowerCase();
        const titleText = (item.title || '').toLowerCase();
        return bodyText.includes(q) || titleText.includes(q);
      });
    }

    // Sort items
    items.sort((a, b) => {
      if (feedSort === 'newest') {
        return (b.created_utc || 0) - (a.created_utc || 0);
      } else if (feedSort === 'oldest') {
        return (a.created_utc || 0) - (b.created_utc || 0);
      } else if (feedSort === 'highest') {
        return (b.score || 0) - (a.score || 0);
      } else { // lowest
        return (a.score || 0) - (b.score || 0);
      }
    });

    return items;
  };

  const formatUnixTime = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 60) return 'just now';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo" onClick={() => setStalkedUser(null)}>
          Reddit Stalker <span>Dashboard</span>
        </div>
        {stalkedUser && (
          <button className="search-btn" style={{ position: 'static' }} onClick={() => setStalkedUser(null)}>
            Stalk Someone Else
          </button>
        )}
      </header>

      {/* Main Content Area */}
      {!stalkedUser ? (
        /* Welcome Search Screen */
        <div className="search-screen">
          <h1 className="search-title">Uncover Reddit Footprints</h1>
          <p className="search-subtitle">
            Enter a Reddit username or profile URL to inspect their postings, active subreddits, flairs, sleep schedules, and read their conversations.
          </p>

          <form 
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchQuery);
            }}
          >
            <div className="search-input-wrapper">
              <span className="search-icon-left">🔍</span>
              <input
                type="text"
                placeholder="Username or Profile URL (e.g. u/spez or reddit.com/user/spez)"
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading}
                autoFocus
              />
              <button type="submit" className="search-btn" disabled={loading}>
                {loading ? 'Scanning...' : 'Snoop Profile'}
              </button>
            </div>
          </form>

          {loading && (
            <div className="loader-wrapper">
              <div className="loader"></div>
              <p className="loader-text">{loadingProgress}</p>
              <p className="loader-subtext">Compiling recent posting records (takes a few seconds)...</p>
            </div>
          )}

          {error && (
            <div className="glass-panel" style={{ width: '100%', padding: '1rem', borderColor: 'var(--score-negative)', background: 'rgba(239, 68, 68, 0.05)', color: 'white', borderRadius: '12px', textAlign: 'center', marginBottom: '2rem' }}>
              ⚠️ {error}
            </div>
          )}

          {stalkHistory.length > 0 && !loading && (
            <div className="recent-stalks">
              <h3 className="recent-title">Previous Targets</h3>
              <div className="history-chips">
                {stalkHistory.map((user) => (
                  <span 
                    key={user} 
                    className="history-chip" 
                    onClick={() => {
                      setSearchQuery(user);
                      handleSearch(user);
                    }}
                  >
                    u/{user}
                    <button 
                      className="history-chip-delete"
                      onClick={(e) => removeFromHistory(e, user)}
                      title="Remove from history"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Stalker Dashboard */
        <div className="dashboard-grid">
          {/* Sidebar */}
          <div className="sidebar">
            <div className="glass-panel profile-card">
              <div className="profile-avatar-wrapper">
                <img 
                  src={stalkedUser.profileImg || `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${Math.floor(Math.random() * 8)}.png`}
                  alt={`${stalkedUser.username} Avatar`} 
                  className="profile-avatar"
                />
              </div>
              <h2 className="profile-name">u/{stalkedUser.username}</h2>
              {stalkedUser.fullname && <p className="profile-id">ID: {stalkedUser.fullname}</p>}
              
              <div className="profile-stats-row">
                <div className="stat-item">
                  <span className="stat-val">{stalkedUser.stats.totalComments}</span>
                  <span className="stat-lbl">Comments</span>
                </div>
                <div className="stat-item">
                  <span className="stat-val">{stalkedUser.stats.totalPosts}</span>
                  <span className="stat-lbl">Posts</span>
                </div>
              </div>
            </div>

            <nav className="dashboard-nav">
              <button 
                className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                📊 Overview & Schedule
              </button>
              <button 
                className={`nav-tab ${activeTab === 'feed' ? 'active' : ''}`}
                onClick={() => setActiveTab('feed')}
              >
                🕵️ Stalker Snooper Feed ({getFilteredFeed().length})
              </button>
              <button 
                className={`nav-tab ${activeTab === 'subreddits' ? 'active' : ''}`}
                onClick={() => setActiveTab('subreddits')}
              >
                📍 Subreddits & Flairs ({stalkedUser.subreddits.length})
              </button>
              <button 
                className={`nav-tab ${activeTab === 'interactions' ? 'active' : ''}`}
                onClick={() => setActiveTab('interactions')}
              >
                🤝 Social Network ({stalkedUser.interactions.length})
              </button>
            </nav>
          </div>

          {/* Main Content Area */}
          <main className="main-content">
            {/* 1. OVERVIEW & SCHEDULE */}
            {activeTab === 'overview' && (
              <div className="tab-pane">
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 className="tab-title">Target Footprint Summary</h3>
                  <p className="tab-subtitle">Quick metrics of active dates and volume based on recent index data.</p>
                  
                  <div className="stats-cards-grid" style={{ marginTop: '1.5rem' }}>
                    <div className="glass-panel big-stat-card">
                      <span className="big-stat-num">
                        {stalkedUser.stats.totalComments + stalkedUser.stats.totalPosts}
                      </span>
                      <p className="big-stat-lbl">Total Indexed items</p>
                      <p className="big-stat-desc">Comments and posts analyzed</p>
                    </div>

                    <div className="glass-panel big-stat-card">
                      <span className="big-stat-num" style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-pink))' }}>
                        {stalkedUser.stats.recentScore}
                      </span>
                      <p className="big-stat-lbl">Aggregate Score</p>
                      <p className="big-stat-desc">Sum of scores across feed</p>
                    </div>

                    <div className="glass-panel big-stat-card">
                      <span className="big-stat-num">
                        {stalkedUser.stats.subredditsCount}
                      </span>
                      <p className="big-stat-lbl">Subreddits Visited</p>
                      <p className="big-stat-desc">Communities interacted in</p>
                    </div>
                  </div>

                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem' }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '1rem' }}>Timeline Range</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Earliest Indexed Activity</span>
                        <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>{formatUnixTime(stalkedUser.stats.earliestActive)}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Latest Indexed Activity</span>
                        <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>{formatUnixTime(stalkedUser.stats.latestActive)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sleep Heatmap Grid in Overview page for convenience */}
                <div className="glass-panel heatmap-container">
                  <h3 className="tab-title">Activity Hour Tracker (Target Timezone Profiler)</h3>
                  <p className="tab-subtitle">Plots when the target posts/comments. Darker blocks imply high active periods. Useful to deduce sleep cycles.</p>
                  
                  {(() => {
                    const { grid, maxCount } = getHeatmapData();
                    return (
                      <div className="heatmap-grid-scroll">
                        <div className="heatmap-hour-headers">
                          <div className="heatmap-hour-lbl" style={{ width: '80px' }}>Day \ Hour</div>
                          {Array.from({ length: 24 }).map((_, hour) => (
                            <div key={hour} className="heatmap-hour-lbl">{hour.toString().padStart(2, '0')}</div>
                          ))}
                        </div>

                        <div className="heatmap-grid">
                          {grid.map((rowHours, dayIndex) => (
                            <div key={dayIndex} className="heatmap-row">
                              <div className="heatmap-day-lbl">{daysOfWeek[dayIndex].substring(0, 3)}</div>
                              {rowHours.map((count, hour) => {
                                let level = 0;
                                if (count > 0 && maxCount > 0) {
                                  const ratio = count / maxCount;
                                  if (ratio <= 0.25) level = 1;
                                  else if (ratio <= 0.5) level = 2;
                                  else if (ratio <= 0.75) level = 3;
                                  else level = 4;
                                }
                                return (
                                  <div key={hour} className={`heatmap-cell level-${level}`}>
                                    <span className="tooltip">
                                      {count} items at {hour}:00 on {daysOfWeek[dayIndex]}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>

                        <div className="heatmap-legend">
                          <span>Less Active</span>
                          <div className="legend-square level-0"></div>
                          <div className="legend-square level-1"></div>
                          <div className="legend-square level-2"></div>
                          <div className="legend-square level-3"></div>
                          <div className="legend-square level-4"></div>
                          <span>More Active</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 2. SNOOPER FEED */}
            {activeTab === 'feed' && (
              <div className="tab-pane">
                <div className="glass-panel feed-controls">
                  <div className="feed-filters">
                    <button 
                      className={`feed-filter-btn ${feedFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setFeedFilter('all')}
                    >
                      All Content
                    </button>
                    <button 
                      className={`feed-filter-btn ${feedFilter === 'comments' ? 'active' : ''}`}
                      onClick={() => setFeedFilter('comments')}
                    >
                      Comments Only
                    </button>
                    <button 
                      className={`feed-filter-btn ${feedFilter === 'posts' ? 'active' : ''}`}
                      onClick={() => setFeedFilter('posts')}
                    >
                      Posts Only
                    </button>
                  </div>

                  <div className="feed-search-row">
                    <input 
                      type="text" 
                      placeholder="Search keywords in feed..." 
                      className="feed-search-input"
                      value={feedSearchQuery}
                      onChange={(e) => setFeedSearchQuery(e.target.value)}
                    />
                    <select 
                      className="feed-sort-select"
                      value={feedSort}
                      onChange={(e) => setFeedSort(e.target.value)}
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="highest">Highest Score (Best)</option>
                      <option value="lowest">Lowest Score (Worst)</option>
                    </select>
                  </div>

                  {feedSubredditFilter && (
                    <div className="feed-active-filter-alert">
                      <span>Filtering by Subreddit: <strong>r/{feedSubredditFilter}</strong></span>
                      <button className="feed-clear-filter-btn" onClick={() => setFeedSubredditFilter('')}>
                        Show All Subreddits
                      </button>
                    </div>
                  )}
                </div>

                <div className="feed-list">
                  {getFilteredFeed().length === 0 ? (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No posts or comments match the filters. Try typing a different search query.
                    </div>
                  ) : (
                    getFilteredFeed().map((item) => {
                      const isComment = item.type === 'comment';
                      const text = isComment ? item.body : (item.selftext || '[Link Post]');
                      const isTruncated = text.length > 280;
                      const displayText = isTruncated ? text.substring(0, 280) + '...' : text;
                      
                      return (
                        <div 
                          key={item.id} 
                          className={`glass-panel feed-card ${isComment ? 'comment-type' : 'post-type'}`}
                          onClick={() => isComment ? openCommentContext(item) : window.open(item.url || `https://reddit.com${item.permalink}`, '_blank')}
                        >
                          <div className="feed-card-header">
                            <div className="feed-card-meta">
                              <span className="feed-card-type-tag">{item.type}</span>
                              <span 
                                className="feed-card-subreddit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFeedSubredditFilter(item.subreddit);
                                }}
                                title="Click to filter to this subreddit"
                              >
                                r/{item.subreddit}
                              </span>
                              <span>•</span>
                              <span>{formatRelativeTime(item.created_utc)}</span>
                            </div>
                            <span className={`feed-card-score ${item.score >= 0 ? 'score-pos' : 'score-neg'}`}>
                              {item.score >= 0 ? `+${item.score}` : item.score}
                            </span>
                          </div>

                          {!isComment && <h4 className="feed-card-title">{item.title}</h4>}
                          
                          <div className={`feed-card-body ${isTruncated ? 'truncated' : ''}`}>
                            {displayText}
                          </div>

                          <div className="feed-card-footer">
                            <span>ID: {item.id}</span>
                            {isComment ? (
                              <span className="feed-card-prompt">Inspect Conversation Context →</span>
                            ) : (
                              <span className="feed-card-prompt" style={{ color: 'var(--accent-cyan)' }}>Open Post Link ↗</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 3. SUBREDDITS & FLAIRS */}
            {activeTab === 'subreddits' && (() => {
              const subActivity = getSubredditActivity();
              const maxVal = subActivity[0]?.count || 1;
              return (
                <div className="glass-panel subs-container">
                  <div className="subs-header">
                    <div>
                      <h3 className="tab-title">Active Communities ({stalkedUser.subreddits.length})</h3>
                      <p className="tab-subtitle">Which subreddits they post/comment in most. Select a row to filter comments.</p>
                    </div>
                  </div>

                  <div className="subreddit-list">
                    {subActivity.map((sub) => {
                      const percent = (sub.count / maxVal) * 100;
                      const flair = getSubredditFlair(sub.subreddit);
                      
                      return (
                        <div 
                          key={sub.subreddit} 
                          className="subreddit-bar-row"
                          onClick={() => {
                            setFeedSubredditFilter(sub.subreddit);
                            setActiveTab('feed');
                          }}
                        >
                          <span className="subreddit-name-col">r/{sub.subreddit}</span>
                          <div className="subreddit-bar-container">
                            <div className="subreddit-bar" style={{ width: `${percent}%` }}></div>
                          </div>
                          <span className="subreddit-count-col">{sub.count} item{sub.count === 1 ? '' : 's'}</span>
                          <span 
                            className="subreddit-flair-col" 
                            style={{ opacity: flair ? 1 : 0.4 }}
                            title={flair ? `User flair: ${flair}` : 'No flair found'}
                          >
                            🏷️ {flair || 'No flair'}
                          </span>
                        </div>
                      );
                    })}
                    {stalkedUser.subreddits.length === 0 && (
                      <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No active subreddit logs found.</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 4. SOCIAL NETWORK / INTERACTIONS */}
            {activeTab === 'interactions' && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 className="tab-title">Stalking Connections</h3>
                <p className="tab-subtitle">Lists Reddit users they have engaged with most. Click a card to shift stalker focus to that user!</p>
                
                <div className="interactions-list" style={{ marginTop: '1.5rem' }}>
                  {stalkedUser.interactions.map((user) => {
                    if (user.author === '[deleted]') return null;
                    return (
                      <div 
                        key={user.author} 
                        className="glass-panel interaction-card"
                        onClick={() => handleSearch(user.author)}
                      >
                        <div>
                          <span className="interaction-username">u/{user.author}</span>
                          <p className="rabbit-hole-prompt">Snoop this user →</p>
                        </div>
                        <div className="interaction-details">
                          <span className="interaction-count">{user.count}</span>
                          <span className="interaction-lbl">interactions</span>
                        </div>
                      </div>
                    );
                  })}
                  {stalkedUser.interactions.filter(u => u.author !== '[deleted]').length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                      No interaction partners indexed for this user.
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Conversation Context Side Drawer Modal */}
      {selectedComment && (
        <div className="modal-overlay" onClick={() => setSelectedComment(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Conversation Context</h3>
              <button className="modal-close-btn" onClick={() => setSelectedComment(null)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="thread-hierarchy">
                {/* Parent Comment */}
                {selectedComment.parent_id && selectedComment.parent_id.startsWith('t1_') && (
                  <div className="bubble parent-bubble">
                    <div className="bubble-meta">
                      <span className="bubble-author">
                        u/{parentComment ? parentComment.author : 'Loading parent...'}
                      </span>
                      <span>Parent Comment</span>
                    </div>
                    <div className="bubble-body">
                      {contextLoading ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className="loader" style={{ width: '16px', height: '16px', borderWidth: '2px', marginBottom: 0 }}></span>
                          <span>Fetching Reddit records...</span>
                        </div>
                      ) : (
                        parentComment ? parentComment.body : 'Could not load parent comment.'
                      )}
                    </div>
                  </div>
                )}

                {/* Parent Post direct notification */}
                {selectedComment.parent_id && selectedComment.parent_id.startsWith('t3_') && (
                  <div className="bubble parent-bubble" style={{ borderStyle: 'dashed' }}>
                    <div className="bubble-meta">
                      <span className="bubble-author">Post Thread</span>
                      <span>Top-Level Reply</span>
                    </div>
                    <div className="bubble-body" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                      Replied directly to the post:
                      <strong style={{ display: 'block', marginTop: '0.25rem', color: 'var(--text-primary)', fontStyle: 'normal' }}>
                        {selectedComment.link_title || 'Post ID: ' + selectedComment.link_id}
                      </strong>
                    </div>
                  </div>
                )}

                {/* Stalked User Comment */}
                <div className="bubble stalked-bubble">
                  <div className="bubble-meta">
                    <span className="bubble-author" style={{ color: 'var(--accent-purple)' }}>
                      u/{selectedComment.author} (Target)
                    </span>
                    <span className={`feed-card-score ${selectedComment.score >= 0 ? 'score-pos' : 'score-neg'}`}>
                      Score: {selectedComment.score}
                    </span>
                  </div>
                  <div className="bubble-body">
                    {selectedComment.body}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatUnixTime(selectedComment.created_utc)}</span>
                    <span>Subreddit: r/{selectedComment.subreddit}</span>
                  </div>
                </div>
              </div>

              <a 
                href={selectedComment.link_permalink ? `https://reddit.com${selectedComment.link_permalink}${selectedComment.id}/` : `https://reddit.com/comments/${selectedComment.link_id.replace('t3_', '')}/_/${selectedComment.id}/`}
                target="_blank" 
                rel="noreferrer" 
                className="external-link-btn"
              >
                🚀 View Full Thread on Reddit ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
