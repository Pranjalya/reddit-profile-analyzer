const BASE_URL = 'https://arctic-shift.photon-reddit.com/api';

/**
 * Normalizes username by extracting clean username from URLs (e.g. reddit.com/user/username),
 * prefixes (u/username, /u/username, @username), query params, and whitespace.
 */
export function normalizeUsername(input) {
  if (!input) return '';
  let name = input.trim();

  // Strip query strings or fragment identifiers
  name = name.split('?')[0].split('#')[0];

  try {
    if (name.includes('reddit.com') || name.startsWith('http://') || name.startsWith('https://')) {
      let path = name;
      if (name.startsWith('http://') || name.startsWith('https://')) {
        const urlObj = new URL(name);
        path = urlObj.pathname;
      } else {
        const idx = name.indexOf('/');
        if (idx !== -1) path = name.substring(idx);
      }

      const match = path.match(/\/(?:user|u)\/([^/]+)/i);
      if (match && match[1]) {
        name = match[1];
      }
    }
  } catch (e) {
    // Ignore URL parse errors and fall back to string cleaning
  }

  name = name.trim();
  if (name.startsWith('/user/')) name = name.substring(6);
  else if (name.startsWith('user/')) name = name.substring(5);
  else if (name.startsWith('/u/')) name = name.substring(3);
  else if (name.startsWith('u/')) name = name.substring(2);
  else if (name.startsWith('@')) name = name.substring(1);

  name = name.replace(/\/+$/, '');

  return name;
}

/**
 * Fetches all available records for an endpoint using a sliding window based on timestamp and count.
 * Handles rate limits politely and preserves partial items on 429/network failure.
 */
async function fetchWithSlidingWindow(endpoint, author, maxItems = Infinity, onBatchProgress = null) {
  const allItems = [];
  const seenIds = new Set();
  let before = null;

  while (allItems.length < maxItems) {
    const batchSize = Math.min(100, maxItems - allItems.length);
    let url = `${BASE_URL}/${endpoint}/search?author=${encodeURIComponent(author)}&limit=${batchSize}&sort=desc`;
    if (before !== null) {
      url += `&before=${before}`;
    }

    let response;
    try {
      response = await fetch(url);
    } catch (networkErr) {
      if (allItems.length > 0) {
        const err = new Error(`Network error while fetching ${endpoint}: ${networkErr.message}`);
        err.partialData = allItems;
        throw err;
      }
      throw networkErr;
    }

    // Handle 429 rate limit politely
    if (response.status === 429) {
      // Small pause and retry once
      await new Promise(r => setTimeout(r, 1200));
      try {
        response = await fetch(url);
      } catch (retryErr) {
        const err = new Error(`Rate limit exceeded for ${endpoint} (HTTP 429)`);
        err.status = 429;
        err.partialData = allItems;
        throw err;
      }

      if (response.status === 429) {
        const err = new Error(`Rate limit exceeded for ${endpoint} (HTTP 429)`);
        err.status = 429;
        err.partialData = allItems;
        throw err;
      }
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.message) errorDetail = errJson.message;
      } catch (_) {
        // Fall back to status string
      }
      const err = new Error(`Failed to fetch ${endpoint} (${errorDetail})`);
      err.status = response.status;
      err.partialData = allItems;
      throw err;
    }

    const result = await response.json();
    const batch = result.data || [];

    if (batch.length === 0) break;

    const newItems = [];
    for (const item of batch) {
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
        newItems.push(item);
      }
    }

    if (onBatchProgress) {
      onBatchProgress(allItems.length, newItems);
    }

    // Stop if batch size is smaller than requested limit or no new unique items were added
    if (batch.length < batchSize || newItems.length === 0) {
      break;
    }

    // Set sliding window 'before' parameter to the created_utc timestamp of the last item in batch
    const oldestTimestamp = batch[batch.length - 1].created_utc;
    if (!oldestTimestamp) break;

    if (before === oldestTimestamp) {
      before = oldestTimestamp - 1;
    } else {
      before = oldestTimestamp;
    }

    // Polite delay between batches to avoid flooding the API
    await new Promise(r => setTimeout(r, 70));
  }

  return allItems;
}

export async function fetchComments(username, maxItems = Infinity, onProgress = null) {
  const author = normalizeUsername(username);
  return fetchWithSlidingWindow('comments', author, maxItems, onProgress);
}

export async function fetchPosts(username, maxItems = Infinity, onProgress = null) {
  const author = normalizeUsername(username);
  return fetchWithSlidingWindow('posts', author, maxItems, onProgress);
}

export async function fetchSubredditInteractions(username) {
  const author = normalizeUsername(username);
  const response = await fetch(`${BASE_URL}/users/interactions/subreddits?author=${encodeURIComponent(author)}&limit=100`);
  if (!response.ok) throw new Error('Failed to fetch subreddit interactions');
  const result = await response.json();
  return result.data || [];
}

export async function fetchUserInteractions(username) {
  const author = normalizeUsername(username);
  const response = await fetch(`${BASE_URL}/users/interactions/users?author=${encodeURIComponent(author)}&limit=30`);
  if (!response.ok) throw new Error('Failed to fetch user interactions');
  const result = await response.json();
  return result.data || [];
}

export async function fetchUserFlairs(username) {
  const author = normalizeUsername(username);
  const response = await fetch(`${BASE_URL}/users/aggregate_flairs?author=${encodeURIComponent(author)}`);
  if (!response.ok) throw new Error('Failed to fetch user flairs');
  const result = await response.json();
  return result.data || [];
}

/**
 * Fetches details for a single comment ID to show thread context.
 */
export async function fetchCommentById(commentId) {
  if (!commentId) return null;
  const cleanId = String(commentId).replace(/^t1_/, '').trim();
  const response = await fetch(`${BASE_URL}/comments/ids?ids=${cleanId}&md2html=true&meta-app=search-tool`);
  if (!response.ok) throw new Error('Failed to fetch comment');
  const result = await response.json();
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Fetches details for a single post by ID.
 */
export async function fetchPostById(postId) {
  if (!postId) return null;
  const cleanId = String(postId).replace(/^t3_/, '').trim();
  const response = await fetch(`${BASE_URL}/posts/ids?ids=${cleanId}&md2html=true&meta-app=search-tool`);
  if (!response.ok) throw new Error('Failed to fetch post');
  const result = await response.json();
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Recursively formats comment tree nodes from Reddit/Arctic Shift format.
 */
function formatTreeNode(node) {
  if (!node || node.kind !== 't1' || !node.data) return null;
  const d = node.data;
  let replies = [];
  if (d.replies && d.replies.data && Array.isArray(d.replies.data.children)) {
    replies = d.replies.data.children.map(formatTreeNode).filter(Boolean);
  }
  return {
    id: d.id,
    author: d.author,
    body: d.body,
    score: d.score,
    created_utc: d.created_utc,
    permalink: d.permalink,
    link_id: d.link_id,
    parent_id: d.parent_id,
    subreddit: d.subreddit,
    author_flair_text: d.author_flair_text,
    replies,
  };
}

/**
 * Fetches replies under a specific comment dynamically using /api/comments/tree.
 */
export async function fetchCommentReplies(linkId, commentId, limit = 20) {
  if (!linkId || !commentId) return [];
  const cleanLinkId = linkId.startsWith('t3_') ? linkId : `t3_${linkId}`;
  const cleanParentId = commentId.startsWith('t1_') ? commentId : `t1_${commentId}`;
  const url = `${BASE_URL}/comments/tree?link_id=${encodeURIComponent(cleanLinkId)}&parent_id=${encodeURIComponent(cleanParentId)}&start_breadth=3&start_depth=3&limit=${limit}&md2html=true&meta-app=search-tool`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch comment replies');
  const result = await response.json();
  const rootNode = result.data?.[0];
  if (rootNode && rootNode.data?.replies?.data?.children) {
    return rootNode.data.replies.data.children.map(formatTreeNode).filter(Boolean);
  }
  return [];
}

/**
 * Fetches top-level comments for a post dynamically using /api/comments/tree.
 */
export async function fetchPostComments(postId, limit = 25) {
  if (!postId) return [];
  const cleanLinkId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
  const url = `${BASE_URL}/comments/tree?link_id=${encodeURIComponent(cleanLinkId)}&start_breadth=3&start_depth=3&limit=${limit}&md2html=true&meta-app=search-tool`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch post comments');
  const result = await response.json();
  return (result.data || []).map(formatTreeNode).filter(Boolean);
}

/**
 * Resolves parent authors for comments that do not have parent_author yet.
 */
async function resolveParentCommentAuthors(comments) {
  const parentIds = [...new Set(comments
    .filter(c => c && c.parent_id && c.parent_id.startsWith('t1_') && !c.parent_author)
    .map(c => c.parent_id.replace('t1_', ''))
  )];

  if (parentIds.length === 0) return;

  const parentAuthorMap = {};
  for (let i = 0; i < parentIds.length; i += 100) {
    const chunk = parentIds.slice(i, i + 100).join(',');
    try {
      const res = await fetch(`${BASE_URL}/comments/ids?ids=${chunk}`);
      if (res.ok) {
        const json = await res.json();
        (json.data || []).forEach(p => {
          if (p && p.id && p.author) {
            parentAuthorMap[p.id] = p.author;
            parentAuthorMap['t1_' + p.id] = p.author;
          }
        });
      }
    } catch (e) {
      // Gracefully ignore network errors on parent chunk resolution
    }
  }

  comments.forEach(c => {
    if (c && c.parent_id && !c.parent_author && parentAuthorMap[c.parent_id]) {
      c.parent_author = parentAuthorMap[c.parent_id];
    }
  });
}

/**
 * Assembles a complete stalker profile object from posts, comments, and auxiliary data.
 */
function assembleProfile({
  author,
  comments = [],
  posts = [],
  rawSubreddits = [],
  rawUsers = [],
  rawFlairs = [],
  fetchFlags = {}
}) {
  // Aggregate subreddits directly from comments and posts to guarantee 100% data coverage
  const subMap = new Map();
  [...comments, ...posts].forEach(item => {
    if (item && item.subreddit) {
      const sub = item.subreddit;
      const subLower = sub.toLowerCase();
      if (!subMap.has(subLower)) {
        subMap.set(subLower, { subreddit: sub, count: 0 });
      }
      subMap.get(subLower).count += 1;
    }
  });

  // Merge API rawSubreddits if available
  if (Array.isArray(rawSubreddits)) {
    rawSubreddits.forEach(s => {
      if (s && s.subreddit) {
        const subLower = s.subreddit.toLowerCase();
        if (!subMap.has(subLower)) {
          subMap.set(subLower, { subreddit: s.subreddit, count: s.count || 0 });
        }
      }
    });
  }

  const subreddits = Array.from(subMap.values()).sort((a, b) => b.count - a.count);

  // Extract flairs directly from comments and merge with rawFlairs
  const flairMap = new Map();
  if (Array.isArray(rawFlairs)) {
    rawFlairs.forEach(f => {
      if (f && f.subreddit && f.author_flair_text) {
        flairMap.set(f.subreddit.toLowerCase(), {
          subreddit: f.subreddit,
          author_flair_text: f.author_flair_text
        });
      }
    });
  }
  comments.forEach(c => {
    if (c && c.subreddit && c.author_flair_text) {
      const subLower = c.subreddit.toLowerCase();
      if (!flairMap.has(subLower)) {
        flairMap.set(subLower, {
          subreddit: c.subreddit,
          author_flair_text: c.author_flair_text
        });
      }
    }
  });
  const flairs = Array.from(flairMap.values());

  // Aggregate interactions directly from resolved parent authors & rawUsers
  const userMap = new Map();
  if (Array.isArray(rawUsers)) {
    rawUsers.forEach(u => {
      if (u && u.author && u.author !== '[deleted]') {
        userMap.set(u.author.toLowerCase(), { author: u.author, count: parseInt(u.count, 10) || 0 });
      }
    });
  }
  comments.forEach(c => {
    if (c.parent_author && c.parent_author !== '[deleted]' && c.parent_author.toLowerCase() !== author.toLowerCase()) {
      const key = c.parent_author.toLowerCase();
      if (!userMap.has(key)) {
        userMap.set(key, { author: c.parent_author, count: 0 });
      }
      userMap.get(key).count += 1;
    }
  });
  const interactions = Array.from(userMap.values()).sort((a, b) => b.count - a.count);

  // Extract avatar, exact case of username, and t2 fullname from comments or posts if available
  let profileImg = null;
  let authorFullname = null;
  let exactUsername = author;

  const firstCommentWithImg = comments.find(c => c && c.profile_img);
  if (firstCommentWithImg) {
    profileImg = firstCommentWithImg.profile_img;
    authorFullname = firstCommentWithImg.author_fullname;
    exactUsername = firstCommentWithImg.author;
  } else {
    const firstPost = posts[0];
    if (firstPost) {
      authorFullname = firstPost.author_fullname;
      exactUsername = firstPost.author;
    }
  }

  // Calculate stats across full sliding window dataset
  const totalScore = comments.reduce((acc, c) => acc + (c.score || 0), 0) + posts.reduce((acc, p) => acc + (p.score || 0), 0);

  const timestamps = [
    ...comments.map(c => c.created_utc),
    ...posts.map(p => p.created_utc)
  ].filter(t => t);

  const earliestActive = timestamps.length ? Math.min(...timestamps) : null;
  const latestActive = timestamps.length ? Math.max(...timestamps) : null;

  return {
    username: exactUsername,
    fullname: authorFullname,
    profileImg,
    rawSubreddits,
    rawUsers,
    rawFlairs,
    stats: {
      totalComments: comments.length,
      totalPosts: posts.length,
      recentScore: totalScore,
      earliestActive,
      latestActive,
      subredditsCount: subreddits.length,
    },
    comments,
    posts,
    subreddits,
    interactions,
    flairs,
    fetchFlags: {
      postsEnabled: true,
      commentsEnabled: true,
      postsError: null,
      commentsError: null,
      postsFetched: posts.length > 0,
      commentsFetched: comments.length > 0,
      ...fetchFlags,
    }
  };
}

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
