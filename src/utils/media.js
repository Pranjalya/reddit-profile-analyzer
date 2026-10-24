/**
 * Media and URL extraction utilities for Reddit posts and comments.
 */

export function getPostImageUrl(post) {
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
}

export function getRedditUrl(item, postId) {
  if (!item) return 'https://reddit.com';
  if (item.permalink) {
    return item.permalink.startsWith('http') ? item.permalink : `https://reddit.com${item.permalink}`;
  }
  if (item.type === 'comment' && postId) {
    return `https://reddit.com/comments/${postId}/_/${item.id}/`;
  }
  if (item.id) {
    return `https://reddit.com/comments/${item.id}`;
  }
  return 'https://reddit.com';
}
