import { formatUnixTime } from '../../utils/formatters';

export default function ContextDrawer({
  selectedComment,
  parentComment,
  contextLoading,
  onClose,
}) {
  if (!selectedComment) return null;

  const fullThreadUrl = selectedComment.link_permalink
    ? `https://reddit.com${selectedComment.link_permalink}${selectedComment.id}/`
    : (selectedComment.link_id
      ? `https://reddit.com/comments/${selectedComment.link_id.replace('t3_', '')}/_/${selectedComment.id}/`
      : `https://reddit.com/comments/${selectedComment.id}`);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-drag-handle"></div>
        <div className="modal-header">
          <h3 className="modal-title">Conversation Context</h3>
          <button className="modal-close-btn" onClick={onClose}>
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
                      <span
                        className="loader"
                        style={{ width: '16px', height: '16px', borderWidth: '2px', marginBottom: 0 }}
                      ></span>
                      <span>Fetching Reddit records...</span>
                    </div>
                  ) : parentComment ? (
                    parentComment.body
                  ) : (
                    'Could not load parent comment.'
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
                  <strong
                    style={{
                      display: 'block',
                      marginTop: '0.25rem',
                      color: 'var(--text-primary)',
                      fontStyle: 'normal',
                    }}
                  >
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
                <span
                  className={`feed-card-score ${
                    (selectedComment.score ?? 0) >= 0 ? 'score-pos' : 'score-neg'
                  }`}
                >
                  Score: {selectedComment.score}
                </span>
              </div>
              <div className="bubble-body">{selectedComment.body}</div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{formatUnixTime(selectedComment.created_utc)}</span>
                <span>Subreddit: r/{selectedComment.subreddit}</span>
              </div>
            </div>
          </div>

          <a
            href={fullThreadUrl}
            target="_blank"
            rel="noreferrer"
            className="external-link-btn"
          >
            🚀 View Full Thread on Reddit ↗
          </a>
        </div>
      </div>
    </div>
  );
}
