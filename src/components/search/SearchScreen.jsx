import RadarPanel from './RadarPanel';

export default function SearchScreen({
  searchQuery,
  setSearchQuery,
  onSearch,
  loading,
  loadingProgress,
  error,
  includePosts,
  setIncludePosts,
  includeComments,
  setIncludeComments,
  realtimeSubreddits,
  realtimeCounts,
  stalkHistory,
  onSelectHistory,
  onRemoveHistory,
  setError,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const handleTogglePosts = () => {
    if (includePosts && !includeComments) {
      setError('At least one of Posts or Comments must be selected.');
      return;
    }
    setError(null);
    setIncludePosts(!includePosts);
  };

  const handleToggleComments = () => {
    if (includeComments && !includePosts) {
      setError('At least one of Posts or Comments must be selected.');
      return;
    }
    setError(null);
    setIncludeComments(!includeComments);
  };

  return (
    <div className="search-screen">
      <h1 className="search-title">Uncover Reddit Footprints</h1>
      <p className="search-subtitle">
        Enter a Reddit username or profile URL to inspect their postings, active subreddits, flairs, sleep schedules, and read their conversations.
      </p>

      <form className="search-form" onSubmit={handleSubmit}>
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

        {/* Scan Target Toggle Buttons */}
        <div className="search-toggles-wrapper">
          <span className="search-toggles-title">Scan Scope:</span>
          <div className="search-toggles-group">
            <button
              type="button"
              className={`search-toggle-btn posts-toggle ${includePosts ? 'active' : ''}`}
              onClick={handleTogglePosts}
              title={includePosts && !includeComments ? 'At least one target must remain active' : 'Toggle Posts scan'}
            >
              <span className="toggle-indicator">{includePosts ? '✓' : '○'}</span>
              <span className="toggle-label">📝 Posts</span>
              <span className="toggle-pill-status">{includePosts ? 'Active' : 'Off'}</span>
            </button>

            <button
              type="button"
              className={`search-toggle-btn comments-toggle ${includeComments ? 'active' : ''}`}
              onClick={handleToggleComments}
              title={includeComments && !includePosts ? 'At least one target must remain active' : 'Toggle Comments scan'}
            >
              <span className="toggle-indicator">{includeComments ? '✓' : '○'}</span>
              <span className="toggle-label">💬 Comments</span>
              <span className="toggle-pill-status">{includeComments ? 'Active' : 'Off'}</span>
            </button>
          </div>
        </div>
      </form>

      {loading && (
        <div className="loader-wrapper">
          <div className="loader"></div>
          <p className="loader-text">{loadingProgress}</p>
          <p className="loader-subtext">Streaming records through sliding window indexer...</p>

          <RadarPanel
            realtimeSubreddits={realtimeSubreddits}
            realtimeCounts={realtimeCounts}
            includePosts={includePosts}
            includeComments={includeComments}
          />
        </div>
      )}

      {error && (
        <div
          className="glass-panel"
          style={{
            width: '100%',
            padding: '1rem',
            borderColor: 'var(--score-negative)',
            background: 'rgba(239, 68, 68, 0.05)',
            color: 'white',
            borderRadius: '12px',
            textAlign: 'center',
            marginBottom: '2rem',
          }}
        >
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
                onClick={() => onSelectHistory(user)}
              >
                u/{user}
                <button
                  className="history-chip-delete"
                  onClick={(e) => onRemoveHistory(e, user)}
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
  );
}
