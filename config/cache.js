/**
 * Cache configuration for HTTP responses
 * Used for setting cache headers in API responses, especially for Vercel edge caching
 */

// Cache durations in seconds
export const CACHE_DURATIONS = {
  // Cache status endpoint - no cache (always fresh)
  CACHE_STATUS: 0,
  
  // Cricket matches - 30 seconds (frequently updated)
  CRICKET_MATCHES: 30,
  
  // Match details - 5 minutes (300 seconds)
  MATCH_DETAILS: 300,
  
  // Series list - 10 minutes (600 seconds)
  SERIES_LIST: 600,
}

/**
 * Set cache headers on the response object
 * @param {Object} res - Express response object
 * @param {number} duration - Cache duration in seconds
 */
export const setCacheHeaders = (res, duration) => {
  if (duration === 0) {
    // No cache - always fresh
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  } else {
    // Set cache with specified duration
    res.setHeader('Cache-Control', `public, s-maxage=${duration}, stale-while-revalidate=${duration * 2}`)
    res.setHeader('CDN-Cache-Control', `public, s-maxage=${duration}`)
    res.setHeader('Vercel-CDN-Cache-Control', `public, s-maxage=${duration}`)
  }
}
