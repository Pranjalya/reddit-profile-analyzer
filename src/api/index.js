import { normalizeUsername } from './normalizers';
import {
  fetchComments,
  fetchPosts,
  fetchSubredditInteractions,
  fetchUserInteractions,
  fetchUserFlairs,
  resolveParentCommentAuthors,
  fetchCommentById,
  fetchPostById,
  fetchCommentReplies,
  fetchPostComments,
  formatTreeNode,
} from './endpoints';
import { assembleProfile, calculateHeatmapData } from './analytics';

export {
  normalizeUsername,
  fetchComments,
  fetchPosts,
  fetchSubredditInteractions,
  fetchUserInteractions,
  fetchUserFlairs,
  fetchCommentById,
  fetchPostById,
  fetchCommentReplies,
  fetchPostComments,
  formatTreeNode,
  assembleProfile,
  calculateHeatmapData,
};

/**
 * Runs a stalker compilation profile.
 * Supports selective fetching (posts/comments toggles), real-time subreddit streaming,
 * and rate-limit tolerance (renders available data if one endpoint is rate-limited).
 */
export async function compileStalkerProfile(username, optionsOrProgress = null) {
  let onProgress = null;
  const options = { fetchPosts: true, fetchComments: true };

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
    onProgress = optionsOrProgress.onProgress || null;
    if (optionsOrProgress.fetchPosts !== undefined) options.fetchPosts = !!optionsOrProgress.fetchPosts;
    if (optionsOrProgress.fetchComments !== undefined) options.fetchComments = !!optionsOrProgress.fetchComments;
  }

  const author = normalizeUsername(username);

  let commentsCount = 0;
  let postsCount = 0;
  const liveSubMap = new Map();

  const recordLiveSubreddits = (batch) => {
    if (!Array.isArray(batch)) return;
    for (const item of batch) {
      if (item && item.subreddit) {
        const lower = item.subreddit.toLowerCase();
        if (!liveSubMap.has(lower)) {
          liveSubMap.set(lower, { subreddit: item.subreddit, count: 0 });
        }
        liveSubMap.get(lower).count++;
      }
    }
  };

  const notifyProgress = (latestBatch = null) => {
    if (latestBatch) recordLiveSubreddits(latestBatch);
    if (onProgress) {
      const discoveredSubreddits = Array.from(liveSubMap.values()).sort((a, b) => b.count - a.count);
      onProgress({
        commentsCount,
        postsCount,
        discoveredSubreddits,
        totalItems: commentsCount + postsCount,
      });
    }
  };

  let comments = [];
  let posts = [];
  let commentsError = null;
  let postsError = null;

  const tasks = [];

  if (options.fetchComments) {
    tasks.push(
      fetchComments(author, Infinity, (count, newBatch) => {
        commentsCount = count;
        notifyProgress(newBatch);
      })
      .then(res => { comments = res; })
      .catch(err => {
        console.warn('Comments fetch error:', err);
        commentsError = err.message || 'Comments could not be fetched (Rate-limited)';
        if (err.partialData && err.partialData.length > 0) {
          comments = err.partialData;
        }
      })
    );
  }

  if (options.fetchPosts) {
    tasks.push(
      fetchPosts(author, Infinity, (count, newBatch) => {
        postsCount = count;
        notifyProgress(newBatch);
      })
      .then(res => { posts = res; })
      .catch(err => {
        console.warn('Posts fetch error:', err);
        postsError = err.message || 'Posts could not be fetched (Rate-limited)';
        if (err.partialData && err.partialData.length > 0) {
          posts = err.partialData;
        }
      })
    );
  }

  let rawSubreddits = [];
  let rawUsers = [];
  let rawFlairs = [];

  tasks.push(fetchSubredditInteractions(author).then(r => { rawSubreddits = r; }).catch(() => []));
  tasks.push(fetchUserInteractions(author).then(r => { rawUsers = r; }).catch(() => []));
  tasks.push(fetchUserFlairs(author).then(r => { rawFlairs = r; }).catch(() => []));

  await Promise.all(tasks);

  // If both failed or 0 items were retrieved
  if (comments.length === 0 && posts.length === 0) {
    if (commentsError && postsError) {
      throw new Error(`Rate-limited: ${commentsError} / ${postsError}`);
    } else if (commentsError && !options.fetchPosts) {
      throw new Error(`Comments could not be fetched: ${commentsError}`);
    } else if (postsError && !options.fetchComments) {
      throw new Error(`Posts could not be fetched: ${postsError}`);
    }
  }

  // Resolve parent comment authors if comments were retrieved
  if (comments.length > 0) {
    await resolveParentCommentAuthors(comments);
  }

  const profile = assembleProfile({
    author,
    comments,
    posts,
    rawSubreddits,
    rawUsers,
    rawFlairs,
    fetchFlags: {
      postsEnabled: options.fetchPosts,
      commentsEnabled: options.fetchComments,
      postsError,
      commentsError,
      postsFetched: options.fetchPosts && !postsError,
      commentsFetched: options.fetchComments && !commentsError,
    }
  });

  return profile;
}

/**
 * Fetches additional data in the background (e.g. comments when only posts were loaded,
 * or retrying comments after rate limiting) and merges seamlessly into existing profile.
 */
export async function fetchAdditionalData(targetUser, type, existingProfile, onProgress = null) {
  const author = normalizeUsername(targetUser || existingProfile.username);
  let liveCount = 0;
  const newSubMap = new Map();

  // Populate newSubMap from existing profile subreddits
  (existingProfile.subreddits || []).forEach(s => {
    newSubMap.set(s.subreddit.toLowerCase(), { subreddit: s.subreddit, count: s.count });
  });

  const notify = (batch) => {
    if (Array.isArray(batch)) {
      for (const item of batch) {
        if (item && item.subreddit) {
          const lower = item.subreddit.toLowerCase();
          if (!newSubMap.has(lower)) {
            newSubMap.set(lower, { subreddit: item.subreddit, count: 0 });
          }
          newSubMap.get(lower).count++;
        }
      }
    }
    if (onProgress) {
      onProgress({
        count: liveCount,
        discoveredSubreddits: Array.from(newSubMap.values()).sort((a, b) => b.count - a.count)
      });
    }
  };

  if (type === 'comments') {
    const newComments = await fetchComments(author, Infinity, (count, batch) => {
      liveCount = count;
      notify(batch);
    });

    await resolveParentCommentAuthors(newComments);

    // Merge comments, deduplicating
    const commentMap = new Map();
    (existingProfile.comments || []).forEach(c => commentMap.set(c.id, c));
    newComments.forEach(c => commentMap.set(c.id, c));
    const mergedComments = Array.from(commentMap.values());

    return assembleProfile({
      author,
      comments: mergedComments,
      posts: existingProfile.posts || [],
      rawSubreddits: existingProfile.rawSubreddits || [],
      rawUsers: existingProfile.rawUsers || [],
      rawFlairs: existingProfile.rawFlairs || [],
      fetchFlags: {
        ...existingProfile.fetchFlags,
        commentsEnabled: true,
        commentsFetched: true,
        commentsError: null,
      }
    });
  } else if (type === 'posts') {
    const newPosts = await fetchPosts(author, Infinity, (count, batch) => {
      liveCount = count;
      notify(batch);
    });

    const postMap = new Map();
    (existingProfile.posts || []).forEach(p => postMap.set(p.id, p));
    newPosts.forEach(p => postMap.set(p.id, p));
    const mergedPosts = Array.from(postMap.values());

    return assembleProfile({
      author,
      comments: existingProfile.comments || [],
      posts: mergedPosts,
      rawSubreddits: existingProfile.rawSubreddits || [],
      rawUsers: existingProfile.rawUsers || [],
      rawFlairs: existingProfile.rawFlairs || [],
      fetchFlags: {
        ...existingProfile.fetchFlags,
        postsEnabled: true,
        postsFetched: true,
        postsError: null,
      }
    });
  }

  return existingProfile;
}
