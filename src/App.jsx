import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  compileStalkerProfile,
  fetchCommentById,
  fetchPostById,
  fetchCommentReplies,
  fetchPostComments,
  normalizeUsername,
  fetchAdditionalData,
} from './api';

import Header from './components/layout/Header';
import SearchScreen from './components/search/SearchScreen';
import Sidebar from './components/dashboard/Sidebar';
import StatusBanners from './components/dashboard/StatusBanners';
import OverviewTab from './components/tabs/OverviewTab';
import FeedTab from './components/tabs/FeedTab';
import SubredditsTab from './components/tabs/SubredditsTab';
import InteractionsTab from './components/tabs/InteractionsTab';
import ContextDrawer from './components/modals/ContextDrawer';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [error, setError] = useState(null);
  const [stalkedUser, setStalkedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [stalkHistory, setStalkHistory] = useState([]);

  // Scan scope toggles
  const [includePosts, setIncludePosts] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);

  // Real-time subreddit streaming during scan
  const [realtimeSubreddits, setRealtimeSubreddits] = useState([]);
  const [realtimeCounts, setRealtimeCounts] = useState({ comments: 0, posts: 0 });

  // Background fetch status for toggled-off or rate-limited content
  const [bgFetchStatus, setBgFetchStatus] = useState({
    loading: false,
    type: null,
    count: 0,
    error: null,
    successMessage: null,
  });

  // Expandable cards state
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

  const saveToHistory = useCallback((username) => {
    const cleanName = normalizeUsername(username);
    if (!cleanName) return;

    setStalkHistory((prev) => {
      const updated = [
        cleanName,
        ...prev.filter((name) => name.toLowerCase() !== cleanName.toLowerCase()),
      ].slice(0, 12);
      localStorage.setItem('reddit_stalker_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFromHistory = useCallback((e, usernameToRemove) => {
    e.stopPropagation();
    setStalkHistory((prev) => {
      const updated = prev.filter((name) => name !== usernameToRemove);
      localStorage.setItem('reddit_stalker_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleSearch = useCallback(async (rawQuery) => {
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
        },
      });

      if (profile.comments.length === 0 && profile.posts.length === 0) {
        throw new Error(`No posts or comments found for "${cleanUsername}" in Reddit index.`);
      }

      setStalkedUser(profile);
      saveToHistory(profile.username);
      setActiveTab('overview');

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
  }, [includePosts, includeComments, saveToHistory]);

  // Load search history & check URL parameters on mount
  useEffect(() => {
    const history = localStorage.getItem('reddit_stalker_history');
    if (history) {
      try {
        setStalkHistory(JSON.parse(history));
      } catch (e) {
        setStalkHistory([]);
      }
    } else {
      setStalkHistory([]);
      localStorage.setItem('reddit_stalker_history', JSON.stringify([]));
    }

    const urlParams = new URLSearchParams(window.location.search);
    const targetUser = urlParams.get('user') || urlParams.get('u');
    if (targetUser) {
      setSearchQuery(targetUser);
      handleSearch(targetUser);
    }
  }, [handleSearch]);

  const handleBackgroundFetch = async (type) => {
    if (!stalkedUser || bgFetchStatus.loading) return;

    setBgFetchStatus({
      loading: true,
      type,
      count: 0,
      error: null,
      successMessage: null,
    });

    try {
      const updatedProfile = await fetchAdditionalData(
        stalkedUser.username,
        type,
        stalkedUser,
        ({ count, discoveredSubreddits }) => {
          setBgFetchStatus((prev) => ({ ...prev, count }));
          if (discoveredSubreddits && discoveredSubreddits.length > 0) {
            setStalkedUser((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                subreddits: discoveredSubreddits,
                stats: {
                  ...prev.stats,
                  subredditsCount: discoveredSubreddits.length,
                },
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
        successMessage: `Successfully loaded all ${type} (${updatedProfile[type].length} total)!`,
      });

      setTimeout(() => {
        setBgFetchStatus((prev) => ({ ...prev, successMessage: null }));
      }, 4000);
    } catch (err) {
      console.error(`Background fetch failed for ${type}:`, err);
      setBgFetchStatus({
        loading: false,
        type,
        count: 0,
        error: err.message || `Failed to fetch ${type} in background. You can retry anytime.`,
        successMessage: null,
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

  const handleToggleCard = (id, e) => {
    if (e) e.stopPropagation();
    setExpandedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleToggleExpandAll = () => {
    const allExpanded = filteredFeed.length > 0 && filteredFeed.every((item) => !!expandedCards[item.id]);
    const nextMap = {};
    filteredFeed.forEach((item) => {
      nextMap[item.id] = !allExpanded;
    });
    setExpandedCards(nextMap);
  };

  const handleTogglePost = async (linkId, e) => {
    if (e) e.stopPropagation();
    if (!linkId) return;

    if (loadedPosts[linkId]?.visible) {
      setLoadedPosts((prev) => ({ ...prev, [linkId]: { ...prev[linkId], visible: false } }));
      return;
    }

    if (loadedPosts[linkId]?.data) {
      setLoadedPosts((prev) => ({ ...prev, [linkId]: { ...prev[linkId], visible: true } }));
      return;
    }

    setLoadedPosts((prev) => ({
      ...prev,
      [linkId]: { loading: true, visible: true, data: null, error: null },
    }));

    try {
      const post = await fetchPostById(linkId);
      setLoadedPosts((prev) => ({
        ...prev,
        [linkId]: {
          loading: false,
          visible: true,
          data: post,
          error: !post ? 'Post not found in Reddit archive' : null,
        },
      }));
    } catch (err) {
      setLoadedPosts((prev) => ({
        ...prev,
        [linkId]: { loading: false, visible: true, data: null, error: err.message || 'Failed to load post' },
      }));
    }
  };

  const handleCloseLoadedPost = (linkId, e) => {
    if (e) e.stopPropagation();
    setLoadedPosts((prev) => ({ ...prev, [linkId]: { ...prev[linkId], visible: false } }));
  };

  const handleToggleParent = async (parentId, e) => {
    if (e) e.stopPropagation();
    if (!parentId) return;

    if (loadedParents[parentId]?.visible) {
      setLoadedParents((prev) => ({ ...prev, [parentId]: { ...prev[parentId], visible: false } }));
      return;
    }

    if (loadedParents[parentId]?.data) {
      setLoadedParents((prev) => ({ ...prev, [parentId]: { ...prev[parentId], visible: true } }));
      return;
    }

    setLoadedParents((prev) => ({
      ...prev,
      [parentId]: { loading: true, visible: true, data: null, error: null },
    }));

    try {
      const comment = await fetchCommentById(parentId);
      setLoadedParents((prev) => ({
        ...prev,
        [parentId]: {
          loading: false,
          visible: true,
          data: comment,
          error: !comment ? 'Parent comment not found or deleted' : null,
        },
      }));
    } catch (err) {
      setLoadedParents((prev) => ({
        ...prev,
        [parentId]: {
          loading: false,
          visible: true,
          data: null,
          error: err.message || 'Failed to load parent comment',
        },
      }));
    }
  };

  const handleCloseLoadedParent = (parentId, e) => {
    if (e) e.stopPropagation();
    setLoadedParents((prev) => ({ ...prev, [parentId]: { ...prev[parentId], visible: false } }));
  };

  const handleToggleReplies = async (item, e) => {
    if (e) e.stopPropagation();
    const itemId = item.id;
    if (!itemId) return;

    if (loadedReplies[itemId]?.visible) {
      setLoadedReplies((prev) => ({ ...prev, [itemId]: { ...prev[itemId], visible: false } }));
      return;
    }

    if (loadedReplies[itemId]?.data) {
      setLoadedReplies((prev) => ({ ...prev, [itemId]: { ...prev[itemId], visible: true } }));
      return;
    }

    setLoadedReplies((prev) => ({
      ...prev,
      [itemId]: { loading: true, visible: true, data: null, error: null },
    }));

    try {
      let replies = [];
      if (item.type === 'comment') {
        replies = await fetchCommentReplies(item.link_id, item.id);
      } else {
        replies = await fetchPostComments(item.id);
      }
      setLoadedReplies((prev) => ({
        ...prev,
        [itemId]: { loading: false, visible: true, data: replies, error: null },
      }));
    } catch (err) {
      setLoadedReplies((prev) => ({
        ...prev,
        [itemId]: { loading: false, visible: true, data: null, error: err.message || 'Failed to load replies' },
      }));
    }
  };

  const handleCloseLoadedReplies = (itemId, e) => {
    if (e) e.stopPropagation();
    setLoadedReplies((prev) => ({ ...prev, [itemId]: { ...prev[itemId], visible: false } }));
  };

  // Filtered and sorted feed calculation
  const filteredFeed = useMemo(() => {
    if (!stalkedUser) return [];

    let items = [];
    if (feedFilter === 'all') {
      items = [
        ...(stalkedUser.comments || []).map((c) => ({ ...c, type: 'comment' })),
        ...(stalkedUser.posts || []).map((p) => ({ ...p, type: 'post' })),
      ];
    } else if (feedFilter === 'posts') {
      items = (stalkedUser.posts || []).map((p) => ({ ...p, type: 'post' }));
    } else {
      items = (stalkedUser.comments || []).map((c) => ({ ...c, type: 'comment' }));
    }

    // Filter by Subreddit
    if (feedSubredditFilter) {
      items = items.filter((item) => item.subreddit?.toLowerCase() === feedSubredditFilter.toLowerCase());
    }

    // Filter by Interaction User
    if (feedInteractionUser) {
      const u = feedInteractionUser.toLowerCase();
      items = items.filter((item) => {
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
      items = items.filter((item) => {
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
      } else {
        return (a.score || 0) - (b.score || 0);
      }
    });

    return items;
  }, [stalkedUser, feedFilter, feedSubredditFilter, feedInteractionUser, feedSearchQuery, feedSort]);

  return (
    <div className="app-container">
      <Header stalkedUser={stalkedUser} onReset={() => setStalkedUser(null)} />

      {!stalkedUser ? (
        <SearchScreen
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearch={handleSearch}
          loading={loading}
          loadingProgress={loadingProgress}
          error={error}
          includePosts={includePosts}
          setIncludePosts={setIncludePosts}
          includeComments={includeComments}
          setIncludeComments={setIncludeComments}
          realtimeSubreddits={realtimeSubreddits}
          realtimeCounts={realtimeCounts}
          stalkHistory={stalkHistory}
          onSelectHistory={(user) => {
            setSearchQuery(user);
            handleSearch(user);
          }}
          onRemoveHistory={removeFromHistory}
          setError={setError}
        />
      ) : (
        <div className="dashboard-grid">
          <Sidebar
            stalkedUser={stalkedUser}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            feedCount={filteredFeed.length}
          />

          <main className="main-content">
            <StatusBanners
              bgFetchStatus={bgFetchStatus}
              setBgFetchStatus={setBgFetchStatus}
              stalkedUser={stalkedUser}
              onBackgroundFetch={handleBackgroundFetch}
            />

            {activeTab === 'overview' && (
              <OverviewTab
                stalkedUser={stalkedUser}
                selectedHeatmapCell={selectedHeatmapCell}
                setSelectedHeatmapCell={setSelectedHeatmapCell}
              />
            )}

            {activeTab === 'feed' && (
              <FeedTab
                stalkedUser={stalkedUser}
                filteredItems={filteredFeed}
                feedFilter={feedFilter}
                setFeedFilter={setFeedFilter}
                feedSubredditFilter={feedSubredditFilter}
                setFeedSubredditFilter={setFeedSubredditFilter}
                feedInteractionUser={feedInteractionUser}
                setFeedInteractionUser={setFeedInteractionUser}
                feedSearchQuery={feedSearchQuery}
                setFeedSearchQuery={setFeedSearchQuery}
                feedSort={feedSort}
                setFeedSort={setFeedSort}
                expandedCards={expandedCards}
                onToggleExpandCard={handleToggleCard}
                onToggleExpandAll={handleToggleExpandAll}
                loadedPosts={loadedPosts}
                loadedParents={loadedParents}
                loadedReplies={loadedReplies}
                onTogglePost={handleTogglePost}
                onCloseLoadedPost={handleCloseLoadedPost}
                onToggleParent={handleToggleParent}
                onCloseLoadedParent={handleCloseLoadedParent}
                onToggleReplies={handleToggleReplies}
                onCloseLoadedReplies={handleCloseLoadedReplies}
                onOpenContext={openCommentContext}
                onBackgroundFetch={handleBackgroundFetch}
              />
            )}

            {activeTab === 'subreddits' && (
              <SubredditsTab
                stalkedUser={stalkedUser}
                onSelectSubreddit={(sub) => {
                  setFeedSubredditFilter(sub);
                  setActiveTab('feed');
                }}
              />
            )}

            {activeTab === 'interactions' && (
              <InteractionsTab
                stalkedUser={stalkedUser}
                onSelectUser={(author) => {
                  setFeedInteractionUser(author);
                  setActiveTab('feed');
                }}
              />
            )}
          </main>
        </div>
      )}

      <ContextDrawer
        selectedComment={selectedComment}
        parentComment={parentComment}
        contextLoading={contextLoading}
        onClose={() => setSelectedComment(null)}
      />
    </div>
  );
}

export default App;
