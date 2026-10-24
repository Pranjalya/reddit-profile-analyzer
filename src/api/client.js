export const BASE_URL = 'https://arctic-shift.photon-reddit.com/api';

/**
 * Fetches all available records for an endpoint using a sliding window based on timestamp and count.
 * Handles rate limits politely and preserves partial items on 429/network failure.
 */
export async function fetchWithSlidingWindow(endpoint, author, maxItems = Infinity, onBatchProgress = null) {
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
