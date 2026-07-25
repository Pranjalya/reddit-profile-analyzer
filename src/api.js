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

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
    const result = await response.json();
    const batch = result.data || [];

    if (batch.length === 0) break;

    let newItemsInBatch = 0;
    for (const item of batch) {
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
        newItemsInBatch++;
      }
    }

    if (onBatchProgress) {
      onBatchProgress(allItems.length);
    }

    // Stop if batch size is smaller than requested limit or no new unique items were added
    if (batch.length < batchSize || newItemsInBatch === 0) {
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
  // commentId can start with t1_, but the API works either way. We can clean it or leave it.
  const response = await fetch(`${BASE_URL}/comments/ids?ids=${commentId}`);
  if (!response.ok) throw new Error('Failed to fetch parent comment');
  const result = await response.json();
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Runs a complete stalker compilation profile using sliding window fetching.
 * Fetches all necessary data concurrently with live progress updates.
 */
export async function compileStalkerProfile(username, onProgress = null) {
  const author = normalizeUsername(username);

  let commentsCount = 0;
  let postsCount = 0;

  const notifyProgress = () => {
    if (onProgress) {
      onProgress({ commentsCount, postsCount });
    }
  };

  const [comments, posts, rawSubreddits, rawUsers, rawFlairs] = await Promise.all([
    fetchComments(author, Infinity, (count) => {
      commentsCount = count;
      notifyProgress();
    }),
    fetchPosts(author, Infinity, (count) => {
      postsCount = count;
      notifyProgress();
    }),
    fetchSubredditInteractions(author).catch(() => []),
    fetchUserInteractions(author).catch(() => []),
    fetchUserFlairs(author).catch(() => []) // Flairs might fail or time out, fail gracefully
  ]);

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

  // Aggregate interactions directly from comments if rawUsers API failed
  const userMap = new Map();
  if (Array.isArray(rawUsers)) {
    rawUsers.forEach(u => {
      if (u && u.author && u.author !== '[deleted]') {
        userMap.set(u.author.toLowerCase(), { author: u.author, count: u.count || 0 });
      }
    });
  }

  // Extract avatar, exact case of username, and t2 fullname from comments or posts if available
  let profileImg = null;
  let authorFullname = null;
  let exactUsername = author;

  const firstCommentWithImg = comments.find(c => c.profile_img);
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

  // Calculate earliest and latest active times from our dataset
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
    interactions: Array.from(userMap.values()),
    flairs,
  };
}
