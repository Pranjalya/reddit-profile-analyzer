import { useState } from 'react';
import { formatDateTimeIso } from '../../utils/formatters';

export default function CommentReplyTree({ reply, depth = 0 }) {
  const [subRepliesVisible, setSubRepliesVisible] = useState(false);
  const hasSubReplies = reply?.replies && reply.replies.length > 0;

  if (!reply) return null;

  const redditUrl = reply.permalink
    ? (reply.permalink.startsWith('http') ? reply.permalink : `https://reddit.com${reply.permalink}`)
    : (reply.link_id ? `https://reddit.com/comments/${reply.link_id.replace('t3_', '')}/_/${reply.id}/` : `https://reddit.com/_/${reply.id}/`);

  return (
    <div className={`nested-reply-item depth-${Math.min(depth, 5)}`}>
      <div className="nested-reply-header">
        <span className="nested-reply-author">u/{reply.author || '[deleted]'}</span>
        {reply.author_flair_text && (
          <span className="nested-reply-flair">🏷️ {reply.author_flair_text}</span>
        )}
        <span>•</span>
        <span className="nested-reply-time" title={formatDateTimeIso(reply.created_utc)}>
          {reply.created_utc ? new Date(reply.created_utc * 1000).toISOString().replace('.000', '') : ''}
        </span>
        <span className="nested-reply-score">{reply.score ?? 0} ↑</span>
      </div>

      <div className="nested-reply-body">
        {reply.body || '[deleted]'}
      </div>

      <div className="nested-reply-footer">
        <a
          href={redditUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-link reddit-link"
          onClick={(e) => e.stopPropagation()}
        >
          🔗 Reddit
        </a>
        {hasSubReplies && (
          <button
            type="button"
            className="nested-sub-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setSubRepliesVisible(!subRepliesVisible);
            }}
          >
            {subRepliesVisible
              ? `↑ Hide replies (${reply.replies.length})`
              : `↓ ${reply.replies.length} repl${reply.replies.length === 1 ? 'y' : 'ies'}`}
          </button>
        )}
      </div>

      {hasSubReplies && subRepliesVisible && (
        <div className="nested-sub-replies-list">
          {reply.replies.map((sub) => (
            <CommentReplyTree key={sub.id} reply={sub} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
