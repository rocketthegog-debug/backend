/**
 * Cache Configuration for Vercel
 * 
 * Vercel respects HTTP Cache-Control headers for edge caching.
 * This configuration defines cache durations for different endpoints.
 */

// Cache durations in seconds
export const CACHE_DURATIONS = {
  // Cricket matches - cache for 30 seconds (matches frontend polling)
  CRICKET_MATCHES: 30,
  
  // Match details - cache for 5 minutes (300 seconds)
  MATCH_DETAILS: 300,
  
  // Series list - cache for 10 minutes (600 seconds)
  SERIES_LIST: 600,
  
  // Cache status - no cache (always fresh)
  CACHE_STATUS: 0,
  
  // User data - no cache (always fresh)
  USER_DATA: 0,
  
  // Transactions - cache for 10 seconds
  TRANSACTIONS: 10,
  
  // Wallet balance - cache for 5 seconds
  WALLET_BALANCE: 5,
  
  // Admin data - no cache (always fresh)
  ADMIN_DATA: 0,
}

/**
 * Get Cache-Control header string for a given duration
 * @param {number} maxAge - Maximum age in seconds
 * @param {boolean} mustRevalidate - Whether to require revalidation
 * @returns {string} Cache-Control header value
 */
export const getCacheControlHeader = (maxAge, mustRevalidate = true) => {
  if (maxAge === 0) {
    return 'no-cache, no-store, must-revalidate'
  }
  
  const directives = [`public`, `max-age=${maxAge}`, `s-maxage=${maxAge}`]
  
  if (mustRevalidate) {
    directives.push('must-revalidate')
  }
  
  return directives.join(', ')
}

/**
 * Set cache headers on Express response
 * @param {object} res - Express response object
 * @param {number} maxAge - Maximum age in seconds
 * @param {boolean} mustRevalidate - Whether to require revalidation
 */
export const setCacheHeaders = (res, maxAge, mustRevalidate = true) => {
  res.set('Cache-Control', getCacheControlHeader(maxAge, mustRevalidate))
  
  // Add ETag support for better caching
  // Vercel will handle ETag validation automatically
  res.set('Vary', 'Accept-Encoding')
}

export default {
  CACHE_DURATIONS,
  getCacheControlHeader,
  setCacheHeaders,
}

