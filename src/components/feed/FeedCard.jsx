import { formatLocalDateTime, formatFullDateTime, formatUnixTime } from '../../utils/formatters';
import { getPostImageUrl } from '../../utils/media';
import CommentReplyTree from './CommentReplyTree';

export default function FeedCard({
  item,
  stalkedUsername,
  isExpanded = false,
  onToggleExpand,
  loadedPosts = {},
  loadedParents = {},
  loadedReplies = {},
  onTogglePost,
  onCloseLoadedPost,
  onToggleParent,
  onCloseLoadedParent,
  onToggleReplies,
  onCloseLoadedReplies,
  onFilterSubreddit,
  onOpenContext,
}) {
  const isComment = item.type === 'comment';
  const text = isComment ? (item.body || '') : (item.selftext || '');
  const isLong = text.length > 280 || text.split('\n').length > 5;
  const displayText = (!isExpanded && isLong) ? text.substring(0, 280) + '...' : text;

  const postId = isComment
    ? (item.link_id ? item.link_id.replace(/^t3_/, '') : (item.parent_id?.startsWith('t3_') ? item.parent_id.replace(/^t3_/, '') : null))
    : item.id;
  const parentCommentId = isComment && item.parent_id && item.parent_id.startsWith('t1_') ? item.parent_id : null;

  const redditUrl = item.permalink
    ? (item.permalink.startsWith('http') ? item.permalink : `https://reddit.com${item.permalink}`)
    : (isComment && postId ? `https://reddit.com/comments/${postId}/_/${item.id}/` : `https://reddit.com/comments/${item.id}`);

  return (
    <div className={`glass-panel feed-card ${isComment ? 'comment-type' : 'post-type'}`}>
      {/* Top Thread Navigation Buttons */}
      {isComment && (postId || parentCommentId) && (
        <div className="card-top-actions">
          {postId && (
            <button
              type="button"
              className={`thread-action-btn ${loadedPosts[postId]?.visible ? 'active' : ''}`}
              onClick={(e) => onTogglePost(postId, e)}
            >
              {loadedPosts[postId]?.loading
                ? '⏳ Loading post...'
                : loadedPosts[postId]?.visible
                  ? '↑ Hide post'
                  : '↑ Load post'}
            </button>
          )}
          {parentCommentId && (
            <button
              type="button"
              className={`thread-action-btn ${loadedParents[parentCommentId]?.visible ? 'active' : ''}`}
              onClick={(e) => onToggleParent(parentCommentId, e)}
            >
              {loadedParents[parentCommentId]?.loading
                ? '⏳ Loading parent...'
                : loadedParents[parentCommentId]?.visible
                  ? '↑ Hide parent comment'
                  : '↑ Load parent comment'}
            </button>
          )}
        </div>
      )}

      {/* Inline Loaded Post Box */}
      {postId && loadedPosts[postId]?.visible && (
        <div className="inline-loaded-box post-box" onClick={(e) => e.stopPropagation()}>
          <div className="inline-box-header">
            <span className="inline-box-badge badge-post">Original Post</span>
            <span className="inline-box-title">
              {loadedPosts[postId].loading ? 'Loading submission...' : (loadedPosts[postId].data?.title || 'Submission')}
            </span>
            <button
              type="button"
              className="inline-box-close-btn"
              onClick={(e) => onCloseLoadedPost(postId, e)}
              title="Close post"
            >
              ×
            </button>
          </div>
          {loadedPosts[postId].loading && (
            <div className="inline-box-loading">
              <span className="mini-spinner"></span> Loading post {postId} from Arctic Shift...
            </div>
          )}
          {loadedPosts[postId].error && (
            <div className="inline-box-error">{loadedPosts[postId].error}</div>
          )}
          {loadedPosts[postId].data && (
            <div className="inline-box-content">
              <div className="inline-box-meta">
                <span className="feed-card-sub-name">r/{loadedPosts[postId].data.subreddit}</span>
                <span className="feed-card-by-author"> by u/{loadedPosts[postId].data.author || '[deleted]'}</span>
                <span className="feed-card-timestamp" title={formatFullDateTime(loadedPosts[postId].data.created_utc)}> at {formatLocalDateTime(loadedPosts[postId].data.created_utc)}</span>
                <span className="feed-card-separator"> | </span>
                <span className="feed-card-score-pill">{loadedPosts[postId].data.score ?? 0} ↑</span>
              </div>
              {loadedPosts[postId].data.selftext && (
                <div className="inline-box-body">
                  {loadedPosts[postId].data.selftext}
                </div>
              )}
              <div className="inline-box-links">
                <a
                  href={loadedPosts[postId].data.permalink ? (loadedPosts[postId].data.permalink.startsWith('http') ? loadedPosts[postId].data.permalink : `https://reddit.com${loadedPosts[postId].data.permalink}`) : `https://reddit.com/comments/${loadedPosts[postId].data.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-link reddit-link"
                >
                  🔗 Reddit
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline Loaded Parent Comment Box */}
      {parentCommentId && loadedParents[parentCommentId]?.visible && (
        <div className="inline-loaded-box parent-box" onClick={(e) => e.stopPropagation()}>
          <div className="inline-box-header">
            <span className="inline-box-badge badge-parent">Parent Comment</span>
            <span className="inline-box-title">
              {loadedParents[parentCommentId].loading ? 'Loading parent...' : `u/${loadedParents[parentCommentId].data?.author || 'unknown'}`}
            </span>
            <button
              type="button"
              className="inline-box-close-btn"
              onClick={(e) => onCloseLoadedParent(parentCommentId, e)}
              title="Close parent comment"
            >
              ×
            </button>
          </div>
          {loadedParents[parentCommentId].loading && (
            <div className="inline-box-loading">
              <span className="mini-spinner"></span> Loading parent comment from Arctic Shift...
            </div>
          )}
          {loadedParents[parentCommentId].error && (
            <div className="inline-box-error">{loadedParents[parentCommentId].error}</div>
          )}
          {loadedParents[parentCommentId].data && (
            <div className="inline-box-content">
              <div className="inline-box-meta">
                <span className="feed-card-sub-name">r/{loadedParents[parentCommentId].data.subreddit || item.subreddit}</span>
                <span className="feed-card-by-author"> by u/{loadedParents[parentCommentId].data.author || '[deleted]'}</span>
                <span className="feed-card-timestamp" title={formatFullDateTime(loadedParents[parentCommentId].data.created_utc)}> at {formatLocalDateTime(loadedParents[parentCommentId].data.created_utc)}</span>
                <span className="feed-card-separator"> | </span>
                <span className="feed-card-score-pill">{loadedParents[parentCommentId].data.score ?? 0} ↑</span>
              </div>
              <div className="inline-box-body">
                {loadedParents[parentCommentId].data.body || '[deleted]'}
              </div>
              <div className="inline-box-links">
                <a
                  href={loadedParents[parentCommentId].data.permalink ? (loadedParents[parentCommentId].data.permalink.startsWith('http') ? loadedParents[parentCommentId].data.permalink : `https://reddit.com${loadedParents[parentCommentId].data.permalink}`) : `https://reddit.com/_/${loadedParents[parentCommentId].data.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-link reddit-link"
                >
                  🔗 Reddit
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feed Card Header */}
      <div className="feed-card-header-styled">
        <span
          className="feed-card-sub-name"
          onClick={(e) => {
            e.stopPropagation();
            onFilterSubreddit(item.subreddit);
          }}
          title={`Filter to r/${item.subreddit}`}
        >
          r/{item.subreddit}
        </span>
        <span className="feed-card-by-author"> by u/{item.author || stalkedUsername}</span>
        <span className="feed-card-timestamp" title={formatFullDateTime(item.created_utc)}>
          {' '}at {formatLocalDateTime(item.created_utc)}
        </span>
        <span className="feed-card-separator"> | </span>
        <span className="feed-card-score-pill">
          {item.score ?? 0} ↑
        </span>
        <span className={`feed-card-type-tag ${isComment ? 'tag-comment' : 'tag-post'}`}>
          {item.type}
        </span>
      </div>

      {!isComment && (
        <>
          <h4 className="feed-card-title">{item.title}</h4>
          {(() => {
            const imageUrl = getPostImageUrl(item);
            if (!imageUrl) return null;
            return (
              <div className="feed-card-image-wrapper">
                <img
                  src={imageUrl}
                  alt={item.title || 'Post image'}
                  className="feed-card-image"
                  loading="lazy"
                  onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                />
              </div>
            );
          })()}
        </>
      )}

      {/* Expandable card content */}
      {text && (
        <div className={`feed-card-body ${isLong && !isExpanded ? 'truncated' : ''} ${isExpanded ? 'expanded' : ''}`}>
          {displayText}
        </div>
      )}

      {isLong && (
        <button
          type="button"
          className="feed-card-expand-btn"
          onClick={(e) => onToggleExpand(item.id, e)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? '▴ Show less' : '▾ Show full content'}
        </button>
      )}

      {/* External Links row */}
      <div className="feed-card-links-row">
        <a
          href={redditUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-link reddit-link"
          onClick={(e) => e.stopPropagation()}
        >
          🔗 Reddit
        </a>
        {isComment && (
          <button
            type="button"
            className="inline-link context-link-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenContext(item);
            }}
            title="Open in side context drawer"
          >
            💬 Side Drawer
          </button>
        )}
      </div>

      {/* Bottom Action: Load replies / comments */}
      <div className="card-bottom-actions">
        <button
          type="button"
          className={`thread-action-btn ${loadedReplies[item.id]?.visible ? 'active' : ''}`}
          onClick={(e) => onToggleReplies(item, e)}
        >
          {loadedReplies[item.id]?.loading
            ? `⏳ Loading ${isComment ? 'replies' : 'comments'}...`
            : loadedReplies[item.id]?.visible
              ? `↑ Hide ${isComment ? 'replies' : 'comments'}`
              : `↓ Load ${isComment ? 'replies' : 'comments'}`}
        </button>
      </div>

      {/* Dynamic Replies Tree */}
      {loadedReplies[item.id]?.visible && (
        <div className="inline-replies-container" onClick={(e) => e.stopPropagation()}>
          <div className="inline-replies-header">
            <span className="replies-header-title">
              {isComment ? '💬 Comment Replies' : '💬 Post Comments'}
            </span>
            <button
              type="button"
              className="inline-box-close-btn"
              onClick={(e) => onCloseLoadedReplies(item.id, e)}
              title="Close replies"
            >
              ×
            </button>
          </div>
          {loadedReplies[item.id].loading && (
            <div className="inline-box-loading">
              <span className="mini-spinner"></span> Loading dynamic tree from Arctic Shift...
            </div>
          )}
          {loadedReplies[item.id].error && (
            <div className="inline-box-error">{loadedReplies[item.id].error}</div>
          )}
          {loadedReplies[item.id].data && loadedReplies[item.id].data.length === 0 && !loadedReplies[item.id].loading && (
            <div className="inline-no-replies">No replies found in archive.</div>
          )}
          {loadedReplies[item.id].data && loadedReplies[item.id].data.length > 0 && (
            <div className="nested-replies-list">
              {loadedReplies[item.id].data.map((reply) => (
                <CommentReplyTree
                  key={reply.id}
                  reply={reply}
                  depth={0}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
