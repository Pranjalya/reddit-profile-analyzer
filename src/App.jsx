import { useState, useEffect } from 'react';
import { 
  compileStalkerProfile, 
  fetchCommentById, 
  fetchPostById, 
  fetchCommentReplies, 
  fetchPostComments, 
  normalizeUsername, 
  fetchAdditionalData 
} from './api';

function CommentReplyTree({ reply, depth = 0, formatDateTimeIso }) {
  const [subRepliesVisible, setSubRepliesVisible] = useState(false);
  const hasSubReplies = reply.replies && reply.replies.length > 0;

  const redditUrl = reply.permalink 
    ? (reply.permalink.startsWith('http') ? reply.permalink : `https://reddit.com${reply.permalink}`)
    : (reply.link_id ? `https://reddit.com/comments/${reply.link_id.replace('t3_', '')}/_/${reply.id}/` : `https://reddit.com/_/${reply.id}/`);
  const archiveUrl = `https://arctic-shift.photon-reddit.com/search?id=${reply.id}`;

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
        <a 
          href={archiveUrl} 
          target="_blank" 
          rel="noreferrer" 
          className="inline-link archive-link"
          onClick={(e) => e.stopPropagation()}
        >
          🔗 Archive
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
            {subRepliesVisible ? `↑ Hide replies (${reply.replies.length})` : `↓ ${reply.replies.length} repl${reply.replies.length === 1 ? 'y' : 'ies'}`}
          </button>
        )}
      </div>

      {hasSubReplies && subRepliesVisible && (
        <div className="nested-sub-replies-list">
          {reply.replies.map(sub => (
            <CommentReplyTree key={sub.id} reply={sub} depth={depth + 1} formatDateTimeIso={formatDateTimeIso} />
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [error, setError] = useState(null);
  const [stalkedUser, setStalkedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [stalkHistory, setStalkHistory] = useState([]);

  // Scan toggles (Requirement 1)
  const [includePosts, setIncludePosts] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);

  // Real-time subreddit streaming during loading & background fetch (Requirement 4)
  const [realtimeSubreddits, setRealtimeSubreddits] = useState([]);
  const [realtimeCounts, setRealtimeCounts] = useState({ comments: 0, posts: 0 });

  // Background fetch status for toggled-off or rate-limited content (Requirements 1 & 3)
  const [bgFetchStatus, setBgFetchStatus] = useState({
    loading: false,
    type: null,
    count: 0,
    error: null,
    successMessage: null,
  });

  // Expandable cards state (Requirement 2)
  const [expandedCards, setExpandedCards] = useState({});

  // Dynamic on-click thread loaders (load post, load parent comment, load replies)
  const [loadedPosts, setLoadedPosts] = useState({});
  const [loadedParents, setLoadedParents] = useState({});
  const [loadedReplies, setLoadedReplies] = useState({});

  // Feed options
  const [feedFilter, setFeedFilter] = useState('all'); // all, posts, comments
  const [feedSubredditFilter, setFeedSubredditFilter] = useState('');
  const [feedInteractionUser, setFeedInteractionUser] = useState('');
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [feedSort, setFeedSort] = useState('newest'); // newest, oldest, highest, lowest

  // Context drawer & Heatmap selection
  const [selectedComment, setSelectedComment] = useState(null);
  const [parentComment, setParentComment] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState(null);

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

    // Auto-search if ?user= or ?u= is in URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const targetUser = urlParams.get('user') || urlParams.get('u');
    if (targetUser) {
      setSearchQuery(targetUser);
      handleSearch(targetUser);
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

  const toggleExpandCard = (id, e) => {
    if (e) e.stopPropagation();
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleExpandAll = () => {
    const items = getFilteredFeed();
    const allExpanded = items.length > 0 && items.every(item => !!expandedCards[item.id]);
    const nextMap = {};
    items.forEach(item => {
      nextMap[item.id] = !allExpanded;
    });
    setExpandedCards(prev => ({ ...prev, ...nextMap }));
  };

  const handleSearch = async (rawQuery) => {
    const cleanUsername = normalizeUsername(rawQuery);
    if (!cleanUsername) return;

    if (!includePosts && !includeComments) {
      setError('Please select at least one scan target: Posts or Comments.');
      return;
    }

    setLoading(true);
    setError(null);
    setRealtimeSubreddits([]);
    setRealtimeCounts({ comments: 0, posts: 0 });
    setExpandedCards({});
    setBgFetchStatus({ loading: false, type: null, count: 0, error: null, successMessage: null });
    setLoadingProgress('Initializing stalker sweep...');
    
    try {
      setLoadingProgress('Connecting to Reddit index...');
      const profile = await compileStalkerProfile(cleanUsername, {
        fetchPosts: includePosts,
        fetchComments: includeComments,
        onProgress: ({ commentsCount, postsCount, discoveredSubreddits }) => {
          setRealtimeCounts({ comments: commentsCount, posts: postsCount });
          if (discoveredSubreddits) {
            setRealtimeSubreddits(discoveredSubreddits);
          }
          const parts = [];
          if (commentsCount > 0) parts.push(`${commentsCount} comment${commentsCount === 1 ? '' : 's'}`);
          if (postsCount > 0) parts.push(`${postsCount} post${postsCount === 1 ? '' : 's'}`);
          const progressStr = parts.length > 0 ? ` (${parts.join(', ')})` : '';
          setLoadingProgress(`Scanning activity...${progressStr}`);
        }
      });
      
      if (profile.comments.length === 0 && profile.posts.length === 0) {
        throw new Error(`No posts or comments found for "${cleanUsername}" in Reddit index.`);
      }

      setStalkedUser(profile);
      saveToHistory(profile.username);
      setActiveTab('overview');
      // Reset feed filter: default to available type if only one was fetched
      if (profile.posts.length > 0 && profile.comments.length === 0) {
        setFeedFilter('posts');
      } else if (profile.comments.length > 0 && profile.posts.length === 0) {
        setFeedFilter('comments');
      } else {
        setFeedFilter('all');
      }
      setFeedSubredditFilter('');
      setFeedInteractionUser('');
      setFeedSearchQuery('');
      setFeedSort('newest');
      setSelectedHeatmapCell(null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to scan profile. Reddit API might be down or user does not exist.');
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  const handleBackgroundFetch = async (type) => {
    if (!stalkedUser || bgFetchStatus.loading) return;

    setBgFetchStatus({
      loading: true,
      type,
      count: 0,
      error: null,
      successMessage: null
    });

    try {
      const updatedProfile = await fetchAdditionalData(
        stalkedUser.username,
        type,
        stalkedUser,
        ({ count, discoveredSubreddits }) => {
          setBgFetchStatus(prev => ({ ...prev, count }));
          if (discoveredSubreddits && discoveredSubreddits.length > 0) {
            setStalkedUser(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                subreddits: discoveredSubreddits,
                stats: {
                  ...prev.stats,
                  subredditsCount: discoveredSubreddits.length,
                }
              };
            });
          }
        }
      );

      setStalkedUser(updatedProfile);
      setBgFetchStatus({
        loading: false,
        type: null,
        count: 0,
        error: null,
        successMessage: `Successfully loaded all ${type} (${updatedProfile[type].length} total)!`
      });

      // Auto-clear success message after 4s
      setTimeout(() => {
        setBgFetchStatus(prev => ({ ...prev, successMessage: null }));
      }, 4000);
    } catch (err) {
      console.error(`Background fetch failed for ${type}:`, err);
      setBgFetchStatus({
        loading: false,
        type,
        count: 0,
        error: err.message || `Failed to fetch ${type} in background. You can retry anytime.`,
        successMessage: null
      });
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

  const formatDateTimeIso = (timestamp) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp * 1000).toISOString().replace('.000', '');
    } catch (e) {
      return '';
    }
  };

  const handleTogglePost = async (linkId, e) => {
    if (e) e.stopPropagation();
    if (!linkId) return;

    if (loadedPosts[linkId]?.visible) {
      setLoadedPosts(prev => ({
        ...prev,
        [linkId]: { ...prev[linkId], visible: false }
      }));
      return;
    }

    if (loadedPosts[linkId]?.data) {
      setLoadedPosts(prev => ({
        ...prev,
        [linkId]: { ...prev[linkId], visible: true }
      }));
      return;
    }

    setLoadedPosts(prev => ({
      ...prev,
      [linkId]: { loading: true, visible: true, data: null, error: null }
    }));

    try {
      const post = await fetchPostById(linkId);
      setLoadedPosts(prev => ({
        ...prev,
        [linkId]: {
          loading: false,
          visible: true,
          data: post,
          error: !post ? 'Post not found in Reddit archive' : null
        }
      }));
    } catch (err) {
      setLoadedPosts(prev => ({
        ...prev,
        [linkId]: {
          loading: false,
          visible: true,
          data: null,
          error: err.message || 'Failed to load post'
        }
      }));
    }
  };

  const handleCloseLoadedPost = (linkId, e) => {
    if (e) e.stopPropagation();
    setLoadedPosts(prev => ({
      ...prev,
      [linkId]: { ...prev[linkId], visible: false }
    }));
  };

  const handleToggleParent = async (parentId, e) => {
    if (e) e.stopPropagation();
    if (!parentId) return;

    if (loadedParents[parentId]?.visible) {
      setLoadedParents(prev => ({
        ...prev,
        [parentId]: { ...prev[parentId], visible: false }
      }));
      return;
    }

    if (loadedParents[parentId]?.data) {
      setLoadedParents(prev => ({
        ...prev,
        [parentId]: { ...prev[parentId], visible: true }
      }));
      return;
    }

    setLoadedParents(prev => ({
      ...prev,
      [parentId]: { loading: true, visible: true, data: null, error: null }
    }));

    try {
      const comment = await fetchCommentById(parentId);
      setLoadedParents(prev => ({
        ...prev,
        [parentId]: {
          loading: false,
          visible: true,
          data: comment,
          error: !comment ? 'Parent comment not found or deleted' : null
        }
      }));
    } catch (err) {
      setLoadedParents(prev => ({
        ...prev,
        [parentId]: {
          loading: false,
          visible: true,
          data: null,
          error: err.message || 'Failed to load parent comment'
        }
      }));
    }
  };

  const handleCloseLoadedParent = (parentId, e) => {
    if (e) e.stopPropagation();
    setLoadedParents(prev => ({
      ...prev,
      [parentId]: { ...prev[parentId], visible: false }
    }));
  };

  const handleToggleReplies = async (item, e) => {
    if (e) e.stopPropagation();
    const itemId = item.id;
    if (!itemId) return;

    if (loadedReplies[itemId]?.visible) {
      setLoadedReplies(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], visible: false }
      }));
      return;
    }

    if (loadedReplies[itemId]?.data) {
      setLoadedReplies(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], visible: true }
      }));
      return;
    }

    setLoadedReplies(prev => ({
      ...prev,
      [itemId]: { loading: true, visible: true, data: null, error: null }
    }));

    try {
      let replies = [];
      if (item.type === 'comment') {
        replies = await fetchCommentReplies(item.link_id, item.id);
      } else {
        replies = await fetchPostComments(item.id);
      }
      setLoadedReplies(prev => ({
        ...prev,
        [itemId]: {
          loading: false,
          visible: true,
          data: replies,
          error: null
        }
      }));
    } catch (err) {
      setLoadedReplies(prev => ({
        ...prev,
        [itemId]: {
          loading: false,
          visible: true,
          data: null,
          error: err.message || 'Failed to load replies'
        }
      }));
    }
  };

  const handleCloseLoadedReplies = (itemId, e) => {
    if (e) e.stopPropagation();
    setLoadedReplies(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], visible: false }
    }));
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

  const getPostImageUrl = (post) => {
    if (!post) return null;

    const rawUrl = post.url_overridden_by_dest || post.url;
    if (rawUrl && typeof rawUrl === 'string') {
      const cleanUrl = rawUrl.split('?')[0];
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(cleanUrl) || cleanUrl.includes('i.redd.it') || cleanUrl.includes('i.imgur.com')) {
        return rawUrl.replace(/&amp;/g, '&');
      }
    }

    if (post.preview && post.preview.images && post.preview.images[0] && post.preview.images[0].source) {
      const previewUrl = post.preview.images[0].source.url;
      if (previewUrl) return previewUrl.replace(/&amp;/g, '&');
    }

    if (post.thumbnail && post.thumbnail.startsWith('http')) {
      return post.thumbnail.replace(/&amp;/g, '&');
    }

    return null;
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

    // Filter by Interaction User
    if (feedInteractionUser) {
      const u = feedInteractionUser.toLowerCase();
      items = items.filter(item => {
        const bodyText = (item.body || item.selftext || '').toLowerCase();
        const titleText = (item.title || '').toLowerCase();
        const parentAuthor = (item.parent_author || '').toLowerCase();
        const linkAuthor = (item.link_author || '').toLowerCase();
        return bodyText.includes(u) || titleText.includes(u) || parentAuthor === u || linkAuthor === u;
      });
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

            {/* Scan Target Toggle Buttons (Requirement 1) */}
            <div className="search-toggles-wrapper">
              <span className="search-toggles-title">Scan Scope:</span>
              <div className="search-toggles-group">
                <button
                  type="button"
                  className={`search-toggle-btn posts-toggle ${includePosts ? 'active' : ''}`}
                  onClick={() => {
                    if (includePosts && !includeComments) {
                      setError('At least one of Posts or Comments must be selected.');
                      return;
                    }
                    setError(null);
                    setIncludePosts(!includePosts);
                  }}
                  title={includePosts && !includeComments ? 'At least one target must remain active' : 'Toggle Posts scan'}
                >
                  <span className="toggle-indicator">{includePosts ? '✓' : '○'}</span>
                  <span className="toggle-label">📝 Posts</span>
                  <span className="toggle-pill-status">{includePosts ? 'Active' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  className={`search-toggle-btn comments-toggle ${includeComments ? 'active' : ''}`}
                  onClick={() => {
                    if (includeComments && !includePosts) {
                      setError('At least one of Posts or Comments must be selected.');
                      return;
                    }
                    setError(null);
                    setIncludeComments(!includeComments);
                  }}
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

              {/* Real-time Subreddit Discovery Radar (Requirement 4) */}
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
            {/* Background Fetch & Rate Limit Banners (Requirements 1 & 3) */}
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
                  onClick={() => handleBackgroundFetch(bgFetchStatus.type || 'comments')}
                >
                  🔄 Retry Again
                </button>
              </div>
            )}

            {/* Rate-limited comments banner (Requirement 3) */}
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
                  onClick={() => handleBackgroundFetch('comments')}
                >
                  🔄 Retry Fetching Comments in Background
                </button>
              </div>
            )}

            {/* Comments toggled off banner (Requirement 1) */}
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
                  onClick={() => handleBackgroundFetch('comments')}
                >
                  ⚡ Fetch Comments in Background
                </button>
              </div>
            )}

            {/* Rate-limited posts banner (Requirement 3) */}
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
                  onClick={() => handleBackgroundFetch('posts')}
                >
                  🔄 Retry Fetching Posts in Background
                </button>
              </div>
            )}

            {/* Posts toggled off banner (Requirement 1) */}
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
                  onClick={() => handleBackgroundFetch('posts')}
                >
                  ⚡ Fetch Posts in Background
                </button>
              </div>
            )}

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
                                const isSelected = selectedHeatmapCell?.dayName === daysOfWeek[dayIndex] && selectedHeatmapCell?.hour === hour;
                                return (
                                  <div 
                                    key={hour} 
                                    className={`heatmap-cell level-${level} ${isSelected ? 'cell-selected' : ''}`}
                                    onClick={() => setSelectedHeatmapCell({ dayName: daysOfWeek[dayIndex], hour, count })}
                                  >
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

                        {selectedHeatmapCell && (
                          <div className="heatmap-selected-info">
                            <span>📍 <strong>{selectedHeatmapCell.dayName}</strong> at <strong>{selectedHeatmapCell.hour.toString().padStart(2, '0')}:00</strong> — <strong>{selectedHeatmapCell.count}</strong> activity item{selectedHeatmapCell.count === 1 ? '' : 's'}</span>
                            <button className="heatmap-clear-selected" onClick={() => setSelectedHeatmapCell(null)} title="Clear selection">×</button>
                          </div>
                        )}
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
                    <button 
                      className="feed-filter-btn expand-all-btn"
                      onClick={toggleExpandAll}
                      title="Toggle expand/collapse all feed cards"
                    >
                      ↕ Expand / Collapse All
                    </button>
                  </div>

                  {/* Real-time Participated Communities Bar in Feed (Requirement 4) */}
                  {stalkedUser.subreddits.length > 0 && (
                    <div className="feed-subreddit-quickcloud">
                      <span className="quickcloud-title">Participated Communities ({stalkedUser.subreddits.length}):</span>
                      <div className="quickcloud-scroll">
                        <button 
                          className={`quickcloud-chip ${!feedSubredditFilter ? 'active' : ''}`}
                          onClick={() => setFeedSubredditFilter('')}
                        >
                          All
                        </button>
                        {stalkedUser.subreddits.slice(0, 20).map(s => (
                          <button
                            key={s.subreddit}
                            className={`quickcloud-chip ${feedSubredditFilter.toLowerCase() === s.subreddit.toLowerCase() ? 'active' : ''}`}
                            onClick={() => setFeedSubredditFilter(feedSubredditFilter.toLowerCase() === s.subreddit.toLowerCase() ? '' : s.subreddit)}
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
                    <div className="feed-active-filter-alert" style={{ background: 'rgba(168, 85, 247, 0.15)', borderColor: 'var(--accent-purple)' }}>
                      <span>🤝 Showing interactions with: <strong>u/{feedInteractionUser}</strong></span>
                      <button className="feed-clear-filter-btn" onClick={() => setFeedInteractionUser('')}>
                        Show All Content
                      </button>
                    </div>
                  )}
                </div>

                <div className="feed-list">
                  {getFilteredFeed().length === 0 ? (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {feedFilter === 'comments' && (!stalkedUser.comments || stalkedUser.comments.length === 0) ? (
                        <div>
                          <p style={{ marginBottom: '1rem' }}>No comments currently indexed for u/{stalkedUser.username}.</p>
                          {!stalkedUser.fetchFlags?.commentsFetched && (
                            <button className="bg-fetch-btn btn-comments" onClick={() => handleBackgroundFetch('comments')}>
                              ⚡ Fetch Comments in Background
                            </button>
                          )}
                        </div>
                      ) : feedFilter === 'posts' && (!stalkedUser.posts || stalkedUser.posts.length === 0) ? (
                        <div>
                          <p style={{ marginBottom: '1rem' }}>No posts currently indexed for u/{stalkedUser.username}.</p>
                          {!stalkedUser.fetchFlags?.postsFetched && (
                            <button className="bg-fetch-btn btn-posts" onClick={() => handleBackgroundFetch('posts')}>
                              ⚡ Fetch Posts in Background
                            </button>
                          )}
                        </div>
                      ) : (
                        'No posts or comments match the filters. Try typing a different search query.'
                      )}
                    </div>
                  ) : (
                    getFilteredFeed().map((item) => {
                      const isComment = item.type === 'comment';
                      const text = isComment ? (item.body || '') : (item.selftext || '');
                      const isLong = text.length > 280 || text.split('\n').length > 5;
                      const isExpanded = !!expandedCards[item.id];
                      const displayText = (!isExpanded && isLong) ? text.substring(0, 280) + '...' : text;

                      const postId = isComment 
                        ? (item.link_id ? item.link_id.replace(/^t3_/, '') : (item.parent_id?.startsWith('t3_') ? item.parent_id.replace(/^t3_/, '') : null))
                        : item.id;
                      const parentCommentId = isComment && item.parent_id && item.parent_id.startsWith('t1_') ? item.parent_id : null;

                      const redditUrl = item.permalink
                        ? (item.permalink.startsWith('http') ? item.permalink : `https://reddit.com${item.permalink}`)
                        : (isComment && postId ? `https://reddit.com/comments/${postId}/_/${item.id}/` : `https://reddit.com/comments/${item.id}`);

                      const archiveUrl = `https://arctic-shift.photon-reddit.com/search?id=${item.id}`;
                      
                      return (
                        <div 
                          key={item.id} 
                          className={`glass-panel feed-card ${isComment ? 'comment-type' : 'post-type'}`}
                        >
                          {/* Top Thread Navigation Buttons (User Request) */}
                          {isComment && (postId || parentCommentId) && (
                            <div className="card-top-actions">
                              {postId && (
                                <button 
                                  type="button" 
                                  className={`thread-action-btn ${loadedPosts[postId]?.visible ? 'active' : ''}`}
                                  onClick={(e) => handleTogglePost(postId, e)}
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
                                  onClick={(e) => handleToggleParent(parentCommentId, e)}
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
                                  onClick={(e) => handleCloseLoadedPost(postId, e)}
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
                                    <span className="feed-card-timestamp"> at {formatDateTimeIso(loadedPosts[postId].data.created_utc)}</span>
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
                                    <a 
                                      href={`https://arctic-shift.photon-reddit.com/search?id=${loadedPosts[postId].data.id}`}
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="inline-link archive-link"
                                    >
                                      🔗 Archive
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
                                  onClick={(e) => handleCloseLoadedParent(parentCommentId, e)}
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
                                    <span className="feed-card-timestamp"> at {formatDateTimeIso(loadedParents[parentCommentId].data.created_utc)}</span>
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
                                    <a 
                                      href={`https://arctic-shift.photon-reddit.com/search?id=${loadedParents[parentCommentId].data.id}`}
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="inline-link archive-link"
                                    >
                                      🔗 Archive
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Feed Card Header (Formatted exactly like the screenshot) */}
                          <div className="feed-card-header-styled">
                            <span 
                              className="feed-card-sub-name"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFeedSubredditFilter(item.subreddit);
                              }}
                              title={`Filter to r/${item.subreddit}`}
                            >
                              r/{item.subreddit}
                            </span>
                            <span className="feed-card-by-author"> by u/{item.author || stalkedUser.username}</span>
                            <span className="feed-card-timestamp" title={formatUnixTime(item.created_utc)}>
                              {' '}at {formatDateTimeIso(item.created_utc)}
                            </span>
                            <span className="feed-card-separator"> | </span>
                            <span className="feed-card-score-pill">
                              {item.score ?? 0} ↑
                            </span>
                            <span className={`feed-card-type-tag ${isComment ? 'tag-comment' : 'tag-post'}`} style={{ marginLeft: 'auto' }}>
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
                              onClick={(e) => toggleExpandCard(item.id, e)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? '▴ Show less' : '▾ Show full content'}
                            </button>
                          )}

                          {/* External Links row (Reddit, Archive, plus context drawer trigger) */}
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
                            <a 
                              href={archiveUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="inline-link archive-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              🔗 Archive
                            </a>
                            {isComment && (
                              <button 
                                type="button"
                                className="inline-link context-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCommentContext(item);
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
                              onClick={(e) => handleToggleReplies(item, e)}
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
                                  onClick={(e) => handleCloseLoadedReplies(item.id, e)}
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
                                  {loadedReplies[item.id].data.map(reply => (
                                    <CommentReplyTree 
                                      key={reply.id} 
                                      reply={reply} 
                                      depth={0} 
                                      formatDateTimeIso={formatDateTimeIso} 
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
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
                <p className="tab-subtitle">Lists Reddit users they have engaged with most. Click a card to view interaction comments, or click "Snoop in new tab" to analyze that target!</p>
                
                <div className="interactions-list" style={{ marginTop: '1.5rem' }}>
                  {stalkedUser.interactions.map((user) => {
                    if (user.author === '[deleted]') return null;
                    return (
                      <div 
                        key={user.author} 
                        className="glass-panel interaction-card"
                        onClick={() => {
                          setFeedInteractionUser(user.author);
                          setActiveTab('feed');
                        }}
                      >
                        <div>
                          <span className="interaction-username">u/{user.author}</span>
                          <p className="rabbit-hole-prompt" style={{ marginBottom: '0.4rem' }}>
                            View interaction comments →
                          </p>
                          <button 
                            className="snoop-new-tab-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = new URL(window.location.href);
                              url.searchParams.set('user', user.author);
                              window.open(url.toString(), '_blank');
                            }}
                            title={`Open u/${user.author} profile in a new tab`}
                          >
                            Snoop this user in new tab ↗
                          </button>
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

      {/* Conversation Context Side Drawer / Bottom Sheet Modal */}
      {selectedComment && (
        <div className="modal-overlay" onClick={() => setSelectedComment(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"></div>
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
