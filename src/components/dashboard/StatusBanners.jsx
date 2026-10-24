export default function StatusBanners({
  bgFetchStatus,
  setBgFetchStatus,
  stalkedUser,
  onBackgroundFetch,
}) {
  return (
    <>
      {/* Background Fetch Live Streaming */}
      {bgFetchStatus.loading && (
        <div className="glass-panel banner-notice banner-loading">
          <div className="banner-content">
            <div className="loader-mini"></div>
            <div>
              <strong>Fetching {bgFetchStatus.type} in background...</strong>
              <p>Discovered {bgFetchStatus.count} items. Feel free to browse — records will merge automatically.</p>
            </div>
          </div>
          <div className="banner-progress-badge">
            ⚡ Live Streaming
          </div>
        </div>
      )}

      {/* Background Fetch Success */}
      {bgFetchStatus.successMessage && (
        <div className="glass-panel banner-notice banner-success">
          <div className="banner-content">
            <span className="banner-icon">✅</span>
            <div>
              <strong>Data Integrated</strong>
              <p>{bgFetchStatus.successMessage}</p>
            </div>
          </div>
          <button
            className="banner-close-btn"
            onClick={() => setBgFetchStatus(prev => ({ ...prev, successMessage: null }))}
          >
            ×
          </button>
        </div>
      )}

      {/* Background Fetch Error */}
      {bgFetchStatus.error && (
        <div className="glass-panel banner-notice banner-warning">
          <div className="banner-content">
            <span className="banner-icon">⚠️</span>
            <div>
              <strong>Background fetch issue</strong>
              <p>{bgFetchStatus.error}</p>
            </div>
          </div>
          <button
            className="bg-fetch-btn btn-retry"
            onClick={() => onBackgroundFetch(bgFetchStatus.type || 'comments')}
          >
            🔄 Retry Again
          </button>
        </div>
      )}

      {/* Rate-limited comments banner */}
      {!bgFetchStatus.loading && stalkedUser.fetchFlags?.commentsError && (
        <div className="glass-panel banner-notice banner-warning">
          <div className="banner-content">
            <span className="banner-icon">⚠️</span>
            <div>
              <strong>Comments could not be fetched (Rate-limited / High volume)</strong>
              <p>The Reddit API rate-limited comments for u/{stalkedUser.username}. Posts and known interactions are shown below. You can retry fetching comments in the background.</p>
            </div>
          </div>
          <button
            className="bg-fetch-btn btn-retry"
            onClick={() => onBackgroundFetch('comments')}
          >
            🔄 Retry Fetching Comments in Background
          </button>
        </div>
      )}

      {/* Comments toggled off banner */}
      {!bgFetchStatus.loading && !stalkedUser.fetchFlags?.commentsEnabled && !stalkedUser.fetchFlags?.commentsFetched && !stalkedUser.fetchFlags?.commentsError && (
        <div className="glass-panel banner-notice banner-info">
          <div className="banner-content">
            <span className="banner-icon">💬</span>
            <div>
              <strong>Comments were excluded from initial scan</strong>
              <p>You searched with Comments toggled off. Would you like to fetch and analyze comments in the background?</p>
            </div>
          </div>
          <button
            className="bg-fetch-btn btn-comments"
            onClick={() => onBackgroundFetch('comments')}
          >
            ⚡ Fetch Comments in Background
          </button>
        </div>
      )}

      {/* Rate-limited posts banner */}
      {!bgFetchStatus.loading && stalkedUser.fetchFlags?.postsError && (
        <div className="glass-panel banner-notice banner-warning">
          <div className="banner-content">
            <span className="banner-icon">⚠️</span>
            <div>
              <strong>Posts could not be fetched (Rate-limited)</strong>
              <p>The Reddit API rate-limited post retrieval. Comments are shown below. You can retry fetching posts in the background.</p>
            </div>
          </div>
          <button
            className="bg-fetch-btn btn-retry"
            onClick={() => onBackgroundFetch('posts')}
          >
            🔄 Retry Fetching Posts in Background
          </button>
        </div>
      )}

      {/* Posts toggled off banner */}
      {!bgFetchStatus.loading && !stalkedUser.fetchFlags?.postsEnabled && !stalkedUser.fetchFlags?.postsFetched && !stalkedUser.fetchFlags?.postsError && (
        <div className="glass-panel banner-notice banner-info">
          <div className="banner-content">
            <span className="banner-icon">📝</span>
            <div>
              <strong>Posts were excluded from initial scan</strong>
              <p>You searched with Posts toggled off. Would you like to fetch submissions and images in the background?</p>
            </div>
          </div>
          <button
            className="bg-fetch-btn btn-posts"
            onClick={() => onBackgroundFetch('posts')}
          >
            ⚡ Fetch Posts in Background
          </button>
        </div>
      )}
    </>
  );
}
