/**
 * Pure statistical analysis and data aggregation for Reddit profile records.
 */

export function assembleProfile({
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
 * Calculates a 7-day x 24-hour activity frequency matrix from items.
 */
export function calculateHeatmapData(items = []) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxCount = 0;

  items.forEach(item => {
    if (!item || !item.created_utc) return;
    const date = new Date(item.created_utc * 1000);
    const day = date.getDay(); // 0 (Sun) to 6 (Sat)
    const hour = date.getHours(); // 0 to 23
    grid[day][hour]++;
    if (grid[day][hour] > maxCount) {
      maxCount = grid[day][hour];
    }
  });

  return { grid, maxCount };
}
