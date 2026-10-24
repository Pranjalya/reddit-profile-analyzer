export default function SubredditsTab({
  stalkedUser,
  onSelectSubreddit,
}) {
  const subActivity = stalkedUser.subreddits || [];
  const maxVal = subActivity[0]?.count || 1;

  const getSubredditFlair = (subName) => {
    if (!stalkedUser || !stalkedUser.flairs) return '';
    const match = stalkedUser.flairs.find(
      (f) => f.subreddit && f.subreddit.toLowerCase() === subName.toLowerCase()
    );
    return match ? match.author_flair_text : '';
  };

  return (
    <div className="glass-panel subs-container">
      <div className="subs-header">
        <div>
          <h3 className="tab-title">Active Communities ({subActivity.length})</h3>
          <p className="tab-subtitle">
            Which subreddits they post/comment in most. Select a row to filter comments.
          </p>
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
              onClick={() => onSelectSubreddit(sub.subreddit)}
            >
              <span className="subreddit-name-col">r/{sub.subreddit}</span>
              <div className="subreddit-bar-container">
                <div className="subreddit-bar" style={{ width: `${percent}%` }}></div>
              </div>
              <span className="subreddit-count-col">
                {sub.count} item{sub.count === 1 ? '' : 's'}
              </span>
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
        {subActivity.length === 0 && (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            No active subreddit logs found.
          </p>
        )}
      </div>
    </div>
  );
}
