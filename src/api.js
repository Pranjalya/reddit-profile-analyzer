const BASE_URL = 'https://arctic-shift.photon-reddit.com/api';

/**
 * Normalizes username by removing u/ or /u/ prefix if present.
 */
function normalizeUsername(username) {
  if (!username) return '';
  let name = username.trim();
  if (name.startsWith('/u/')) name = name.substring(3);
  else if (name.startsWith('u/')) name = name.substring(2);
  return name;
}

export async function fetchComments(username, limit = 100) {
  const author = normalizeUsername(username);
  const response = await fetch(`${BASE_URL}/comments/search?author=${encodeURIComponent(author)}&limit=${limit}&sort=desc`);
  if (!response.ok) throw new Error('Failed to fetch comments');
  const result = await response.json();
  return result.data || [];
}

export async function fetchPosts(username, limit = 100) {
  const author = normalizeUsername(username);
  const response = await fetch(`${BASE_URL}/posts/search?author=${encodeURIComponent(author)}&limit=${limit}&sort=desc`);
  if (!response.ok) throw new Error('Failed to fetch posts');
  const result = await response.json();
  return result.data || [];
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
 * Runs a complete stalker compilation profile.
 * Fetches all necessary data concurrently.
 */
export async function compileStalkerProfile(username) {
  const author = normalizeUsername(username);
  
  const [comments, posts, subreddits, users, flairs] = await Promise.all([
    fetchComments(author, 100),
    fetchPosts(author, 100),
    fetchSubredditInteractions(author).catch(() => []),
    fetchUserInteractions(author).catch(() => []),
    fetchUserFlairs(author).catch(() => []) // Flairs might fail or be empty, fail gracefully
  ]);

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

  // Calculate some simple stats
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
    interactions: users,
    flairs,
  };
}
