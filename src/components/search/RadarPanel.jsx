export default function RadarPanel({
  realtimeSubreddits = [],
  realtimeCounts = { comments: 0, posts: 0 },
  includePosts = true,
  includeComments = true,
}) {
  return (
    <div className="realtime-radar-panel glass-panel">
      <div className="radar-header">
        <div className="radar-ping-dot">
          <span className="ping-beacon"></span>
          <span className="ping-core"></span>
        </div>
        <div className="radar-info">
          <h4 className="radar-title">Real-Time Subreddit Radar</h4>
          <span className="radar-count">
            {realtimeSubreddits.length} communit{realtimeSubreddits.length === 1 ? 'y' : 'ies'} detected in real time
          </span>
        </div>
        <div className="radar-counts-pills">
          {includePosts && <span className="radar-pill pill-posts">📝 {realtimeCounts.posts} posts</span>}
          {includeComments && <span className="radar-pill pill-comments">💬 {realtimeCounts.comments} comments</span>}
        </div>
      </div>

      {realtimeSubreddits.length > 0 ? (
        <div className="realtime-radar-chips">
          {realtimeSubreddits.map((sub, idx) => (
            <span 
              key={sub.subreddit} 
              className="realtime-radar-chip"
              style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
            >
              <span className="radar-chip-prefix">r/</span>
              <strong className="radar-chip-name">{sub.subreddit}</strong>
              <span className="radar-chip-count">{sub.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="radar-empty-scan">
          <span className="radar-scanner-line"></span>
          <span>Intercepting incoming subreddit mentions from Reddit API...</span>
        </div>
      )}
    </div>
  );
}
