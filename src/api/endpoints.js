import { BASE_URL, fetchWithSlidingWindow } from './client';
import { normalizeUsername } from './normalizers';

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
export function formatTreeNode(node) {
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
export async function resolveParentCommentAuthors(comments) {
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
