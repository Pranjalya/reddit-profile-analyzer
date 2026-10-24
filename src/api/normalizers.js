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
