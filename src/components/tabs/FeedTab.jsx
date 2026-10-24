import FeedCard from '../feed/FeedCard';

export default function FeedTab({
  stalkedUser,
  filteredItems = [],
  feedFilter,
  setFeedFilter,
  feedSubredditFilter,
  setFeedSubredditFilter,
  feedInteractionUser,
  setFeedInteractionUser,
  feedSearchQuery,
  setFeedSearchQuery,
  feedSort,
  setFeedSort,
  expandedCards,
  onToggleExpandCard,
  onToggleExpandAll,
  loadedPosts,
  loadedParents,
  loadedReplies,
  onTogglePost,
  onCloseLoadedPost,
  onToggleParent,
  onCloseLoadedParent,
  onToggleReplies,
  onCloseLoadedReplies,
  onOpenContext,
  onBackgroundFetch,
}) {
  const subreddits = stalkedUser.subreddits || [];

  return (
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
          <button
            className="feed-filter-btn expand-all-btn"
            onClick={onToggleExpandAll}
            title="Toggle expand/collapse all feed cards"
          >
            ↕ Expand / Collapse All
          </button>
        </div>

        {/* Real-time Participated Communities Bar */}
        {subreddits.length > 0 && (
          <div className="feed-subreddit-quickcloud">
            <span className="quickcloud-title">Participated Communities ({subreddits.length}):</span>
            <div className="quickcloud-scroll">
              <button
                className={`quickcloud-chip ${!feedSubredditFilter ? 'active' : ''}`}
                onClick={() => setFeedSubredditFilter('')}
              >
                All
              </button>
              {subreddits.slice(0, 20).map((s) => (
                <button
                  key={s.subreddit}
                  className={`quickcloud-chip ${feedSubredditFilter.toLowerCase() === s.subreddit.toLowerCase() ? 'active' : ''}`}
                  onClick={() =>
                    setFeedSubredditFilter(
                      feedSubredditFilter.toLowerCase() === s.subreddit.toLowerCase() ? '' : s.subreddit
                    )
                  }
                  title={`Filter feed to r/${s.subreddit}`}
                >
                  r/{s.subreddit} <span className="quickcloud-badge">{s.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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

        {feedInteractionUser && (
          <div
            className="feed-active-filter-alert"
            style={{ background: 'rgba(168, 85, 247, 0.15)', borderColor: 'var(--accent-purple)' }}
          >
            <span>🤝 Showing interactions with: <strong>u/{feedInteractionUser}</strong></span>
            <button className="feed-clear-filter-btn" onClick={() => setFeedInteractionUser('')}>
              Show All Content
            </button>
          </div>
        )}
      </div>

      <div className="feed-list">
        {filteredItems.length === 0 ? (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {feedFilter === 'comments' && (!stalkedUser.comments || stalkedUser.comments.length === 0) ? (
              <div>
                <p style={{ marginBottom: '1rem' }}>No comments currently indexed for u/{stalkedUser.username}.</p>
                {!stalkedUser.fetchFlags?.commentsFetched && (
                  <button className="bg-fetch-btn btn-comments" onClick={() => onBackgroundFetch('comments')}>
                    ⚡ Fetch Comments in Background
                  </button>
                )}
              </div>
            ) : feedFilter === 'posts' && (!stalkedUser.posts || stalkedUser.posts.length === 0) ? (
              <div>
                <p style={{ marginBottom: '1rem' }}>No posts currently indexed for u/{stalkedUser.username}.</p>
                {!stalkedUser.fetchFlags?.postsFetched && (
                  <button className="bg-fetch-btn btn-posts" onClick={() => onBackgroundFetch('posts')}>
                    ⚡ Fetch Posts in Background
                  </button>
                )}
              </div>
            ) : (
              'No posts or comments match the filters. Try typing a different search query.'
            )}
          </div>
        ) : (
          filteredItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              stalkedUsername={stalkedUser.username}
              isExpanded={!!expandedCards[item.id]}
              onToggleExpand={onToggleExpandCard}
              loadedPosts={loadedPosts}
              loadedParents={loadedParents}
              loadedReplies={loadedReplies}
              onTogglePost={onTogglePost}
              onCloseLoadedPost={onCloseLoadedPost}
              onToggleParent={onToggleParent}
              onCloseLoadedParent={onCloseLoadedParent}
              onToggleReplies={onToggleReplies}
              onCloseLoadedReplies={onCloseLoadedReplies}
              onFilterSubreddit={(sub) => setFeedSubredditFilter(sub)}
              onOpenContext={onOpenContext}
            />
          ))
        )}
      </div>
    </div>
  );
}
