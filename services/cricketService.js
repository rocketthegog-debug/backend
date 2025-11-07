import axios from 'axios'
import http from 'http'
import https from 'https'

// API Key Management with rotation
let apiKeys = []
let currentKeyIndex = 0
let keyRateLimitMap = new Map() // Track rate limits per key: Map<key, {blockedUntil: timestamp}>
let lastApiCallTime = 0 // Throttling: 10 seconds between calls
const THROTTLE_DELAY = 10000 // 10 seconds
let keysInitialized = false

// Initialize API keys from environment variable (comma-separated)
const initializeApiKeys = () => {
  if (keysInitialized) return // Prevent multiple initializations
  
  const keysString = process.env.CRICKET_API_KEY || ''
  if (!keysString) {
    console.error('❌ CRICKET_API_KEY is not set in environment variables')
    return
  }
  
  // Split by comma and trim whitespace
  apiKeys = keysString.split(',').map(key => key.trim()).filter(key => key.length > 0)
  
  if (apiKeys.length === 0) {
    console.error('❌ No valid API keys found in CRICKET_API_KEY')
  } else {
    console.log(`🔑 Loaded ${apiKeys.length} API key(s)`)
    // Initialize rate limit tracking for all keys
    apiKeys.forEach(key => {
      keyRateLimitMap.set(key, { blockedUntil: null })
    })
    keysInitialized = true
  }
}

// Initialize on module load - will be called after dotenv.config() in server.js
// Also provide a function to re-initialize if needed
export const reinitializeApiKeys = () => {
  keysInitialized = false
  initializeApiKeys()
}

// Try to initialize immediately (in case dotenv was already loaded)
initializeApiKeys()

// Get next available API key (rotates through keys, skips rate-limited ones)
const getApiKey = () => {
  if (apiKeys.length === 0) {
    console.error('❌ No API keys available')
    return null
  }
  
  const now = Date.now()
  let attempts = 0
  let key = null
  
  // Try to find an available key (not rate limited)
  while (attempts < apiKeys.length) {
    const keyInfo = keyRateLimitMap.get(apiKeys[currentKeyIndex])
    const isBlocked = keyInfo && keyInfo.blockedUntil && now < keyInfo.blockedUntil
    
    if (!isBlocked) {
      key = apiKeys[currentKeyIndex]
      break
    }
    
    // Move to next key
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length
    attempts++
  }
  
  // If all keys are blocked, use current key anyway (will fail but we'll try)
  if (!key) {
    key = apiKeys[currentKeyIndex]
    console.warn(`⚠️ All API keys may be rate limited, using: ${key.substring(0, 10)}...`)
  }
  
  return key
}

// Mark API key as rate limited
const markKeyAsRateLimited = (key, blockDuration = 16 * 60 * 1000) => {
  const blockedUntil = Date.now() + blockDuration
  keyRateLimitMap.set(key, { blockedUntil })
  console.warn(`🚫 API key rate limited: ${key.substring(0, 10)}... (blocked until ${new Date(blockedUntil).toISOString()})`)
  
  // Move to next key
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length
  console.log(`🔄 Rotated to next API key (index: ${currentKeyIndex})`)
}

// Throttle API calls - ensure 10 seconds between calls
const throttleApiCall = async () => {
  const now = Date.now()
  const timeSinceLastCall = now - lastApiCallTime
  
  if (timeSinceLastCall < THROTTLE_DELAY) {
    const waitTime = THROTTLE_DELAY - timeSinceLastCall
    console.log(`⏳ Throttling API call - waiting ${waitTime}ms`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  
  lastApiCallTime = Date.now()
}

// Correct API base URL for cricapi.com
const BASE_URL = process.env.CRICKET_API_BASE_URL || 'https://api.cricapi.com/v1'

// Cache to reduce API calls - updated by background job
const cache = {
  current: null,
  upcoming: null,
  matchDetails: new Map(), // Cache for match details: Map<matchId, { data, timestamp }>
  lastFetch: {
    current: null,
    upcoming: null,
  },
  isUpdatingCurrent: false, // Prevent concurrent updates for current
  isUpdatingUpcoming: false, // Prevent concurrent updates for upcoming
}

// Match details cache duration: 5 minutes (300000 ms)
const MATCH_DETAILS_CACHE_DURATION = 5 * 60 * 1000

// Cache update interval: 60 seconds (configurable)
const CACHE_UPDATE_INTERVAL = parseInt(process.env.CACHE_UPDATE_INTERVAL || '60000', 10) // Default 60 seconds

// Clear cache function for debugging
export const clearCache = () => {
  cache.current = null
  cache.upcoming = null
  cache.matchDetails.clear()
  cache.lastFetch.current = null
  cache.lastFetch.upcoming = null
  console.log('🧹 Cache cleared')
}

// Get cache status
export const getCacheStatus = () => {
  // Get rate limit info for all keys
  const now = Date.now()
  const keyStatus = apiKeys.map((key, index) => {
    const keyInfo = keyRateLimitMap.get(key)
    const isBlocked = keyInfo && keyInfo.blockedUntil && now < keyInfo.blockedUntil
    return {
      index,
      key: key.substring(0, 10) + '...',
      isBlocked,
      blockedUntil: keyInfo?.blockedUntil ? new Date(keyInfo.blockedUntil).toISOString() : null,
      isCurrent: index === currentKeyIndex,
    }
  })

  return {
    current: {
      hasData: !!cache.current?.data,
      dataLength: Array.isArray(cache.current?.data) ? cache.current.data.length : 0,
      lastFetch: cache.lastFetch.current ? new Date(cache.lastFetch.current).toISOString() : null,
    },
    upcoming: {
      hasData: !!cache.upcoming?.data,
      dataLength: Array.isArray(cache.upcoming?.data) ? cache.upcoming.data.length : 0,
      lastFetch: cache.lastFetch.upcoming ? new Date(cache.lastFetch.upcoming).toISOString() : null,
    },
    matchDetails: {
      cachedMatches: cache.matchDetails.size,
      cacheDuration: `${MATCH_DETAILS_CACHE_DURATION / 60000} minutes`,
    },
    series: {
      hasData: !!seriesCache.data,
      lastFetch: seriesCache.timestamp ? new Date(seriesCache.timestamp).toISOString() : null,
    },
    isUpdating: cache.isUpdatingCurrent || cache.isUpdatingUpcoming,
    apiKeys: {
      total: apiKeys.length,
      currentIndex: currentKeyIndex,
      keys: keyStatus,
    },
    throttling: {
      lastCallTime: lastApiCallTime ? new Date(lastApiCallTime).toISOString() : null,
      throttleDelay: `${THROTTLE_DELAY / 1000}s`,
    },
  }
}

// Track errors to prevent spam logging
const errorLogThrottle = {
  lastLogged: {},
  shouldLog: (key, error) => {
    // Suppress ECONNRESET errors completely - they're network-level and non-critical
    if (error?.code === 'ECONNRESET' || error?.message?.includes('ECONNRESET')) {
      return false
    }
    
    const now = Date.now()
    const lastLog = errorLogThrottle.lastLogged[key] || 0
    // Only log same error once per 5 minutes
    if (now - lastLog > 300000) {
      errorLogThrottle.lastLogged[key] = now
      return true
    }
    return false
  },
}

// Retry helper function
const retryRequest = async (requestFn, maxRetries = 2, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn()
    } catch (error) {
      // Don't retry on ECONNRESET - just fail fast
      if (error?.code === 'ECONNRESET' || error?.message?.includes('ECONNRESET')) {
        throw error
      }
      if (i === maxRetries - 1) throw error
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
}

// Create axios instance with default headers (API key will be added per-request)
const cricketAPI = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // Increased timeout to 30 seconds
  // Add keep-alive and connection pooling
  httpAgent: new http.Agent({ keepAlive: true, keepAliveMsecs: 30000 }),
  httpsAgent: new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 }),
})

/**
 * Internal function to fetch and update current matches cache
 * Exported for on-demand fetching in serverless environments
 */
export const updateCurrentMatchesCache = async () => {
  if (cache.isUpdatingCurrent) {
    console.log('⏳ Current matches cache update already in progress, skipping...')
    return // Skip if already updating
  }

  try {
    cache.isUpdatingCurrent = true
    
    // Throttle API call
    await throttleApiCall()
    
    let apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('CRICKET_API_KEY is not configured')
    }

    console.log('🔄 Updating current matches cache...')
    
    // Try with current key, rotate if rate limited
    let response = null
    let lastError = null
    const maxKeyAttempts = apiKeys.length
    
    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      try {
        response = await axios.get(`${BASE_URL}/matches`, {
          params: {
            apikey: apiKey,
            offset: 0,
          },
          timeout: 30000,
        })
        
        // Success - break out of retry loop
        break
      } catch (error) {
        lastError = error
        const errorMessage = error.message || error.response?.data?.reason || ''
        const isRateLimited = errorMessage.toLowerCase().includes('blocked') || 
                              errorMessage.toLowerCase().includes('limit') ||
                              errorMessage.toLowerCase().includes('exceeded') ||
                              error.response?.status === 429
        
        if (isRateLimited) {
          console.warn(`⚠️ API key rate limited: ${apiKey.substring(0, 10)}...`)
          markKeyAsRateLimited(apiKey)
          
          // Get next key
          apiKey = getApiKey()
          if (!apiKey) {
            throw new Error('All API keys are rate limited')
          }
          
          // Wait a bit before retrying with next key
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        
        // Non-rate-limit error - throw it
        throw error
      }
    }
    
    if (!response) {
      throw lastError || new Error('Failed to fetch matches after trying all keys')
    }
      
      if (response.data && response.data.status === 'success' && response.data.data && Array.isArray(response.data.data)) {
        const allMatches = response.data.data
        const liveMatches = allMatches.filter(match => {
          const isLive = match.matchStarted === true && match.matchEnded === false
          const hasScore = match.score && Array.isArray(match.score) && match.score.length > 0
          const isCompletedWithScore = match.matchStarted === true && match.matchEnded === true && hasScore
          return isLive || isCompletedWithScore
        })

        const sortedLive = liveMatches.sort((a, b) => {
          const dateA = new Date(a.dateTimeGMT || a.date || 0)
          const dateB = new Date(b.dateTimeGMT || b.date || 0)
          return dateB - dateA
        }).slice(0, 10)

        // Store in cache
        cache.current = { data: sortedLive }
        cache.lastFetch.current = Date.now()
        console.log(`✅ Cache updated: ${sortedLive.length} live/recent matches`)
        return { data: sortedLive }
      }
      
      // Handle API failure response
      if (response.data && response.data.status === 'failure') {
        const reason = response.data.reason || ''
        const isRateLimited = reason.toLowerCase().includes('blocked') || 
                              reason.toLowerCase().includes('limit') ||
                              reason.toLowerCase().includes('exceeded')
        
        if (isRateLimited) {
          console.warn('⚠️ API rate limited during cache update:', reason)
          markKeyAsRateLimited(apiKey)
          // Keep existing cache
          return cache.current || { data: [] }
        }
        console.error('❌ API returned failure:', reason)
      }

      return cache.current || { data: [] }
    } catch (error) {
      const errorMessage = error.message || error.response?.data?.reason || ''
      const isRateLimited = errorMessage.toLowerCase().includes('blocked') || 
                            errorMessage.toLowerCase().includes('limit') ||
                            errorMessage.toLowerCase().includes('exceeded') ||
                            error.response?.status === 429
      
      if (isRateLimited) {
        console.warn('⚠️ Rate limited during cache update, keeping existing cache')
        if (apiKey) {
          markKeyAsRateLimited(apiKey)
        }
        return cache.current || { data: [] }
      }
      
      console.error('❌ Error updating current matches cache:', error.message)
      return cache.current || { data: [] }
    } finally {
      cache.isUpdatingCurrent = false
    }
  }

/**
 * Internal function to fetch and update upcoming matches cache
 * Exported for on-demand fetching in serverless environments
 */
export const updateUpcomingMatchesCache = async () => {
  if (cache.isUpdatingUpcoming) {
    console.log('⏳ Upcoming matches cache update already in progress, skipping...')
    return // Skip if already updating
  }

  try {
    cache.isUpdatingUpcoming = true
    
    // Throttle API call
    await throttleApiCall()
    
    let apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('CRICKET_API_KEY is not configured')
    }

    console.log('🔄 Updating upcoming matches cache...')
    
    // Try with current key, rotate if rate limited
    let response = null
    let lastError = null
    const maxKeyAttempts = apiKeys.length
    
    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      try {
        response = await axios.get(`${BASE_URL}/matches`, {
          params: {
            apikey: apiKey,
            offset: 0,
          },
          timeout: 30000,
        })
        
        // Success - break out of retry loop
        break
      } catch (error) {
        lastError = error
        const errorMessage = error.message || error.response?.data?.reason || ''
        const isRateLimited = errorMessage.toLowerCase().includes('blocked') || 
                              errorMessage.toLowerCase().includes('limit') ||
                              errorMessage.toLowerCase().includes('exceeded') ||
                              error.response?.status === 429
        
        if (isRateLimited) {
          console.warn(`⚠️ API key rate limited: ${apiKey.substring(0, 10)}...`)
          markKeyAsRateLimited(apiKey)
          
          // Get next key
          apiKey = getApiKey()
          if (!apiKey) {
            throw new Error('All API keys are rate limited')
          }
          
          // Wait a bit before retrying with next key
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        
        // Non-rate-limit error - throw it
        throw error
      }
    }
    
    if (!response) {
      throw lastError || new Error('Failed to fetch matches after trying all keys')
    }
      
      if (response.data && response.data.status === 'success' && response.data.data && Array.isArray(response.data.data)) {
        const allMatches = response.data.data
        const upcomingMatches = allMatches.filter(match => 
          match.matchStarted === false
        ).slice(0, 20)

        // Store in cache
        cache.upcoming = { data: upcomingMatches }
        cache.lastFetch.upcoming = Date.now()
        console.log(`✅ Cache updated: ${upcomingMatches.length} upcoming matches`)
        return { data: upcomingMatches }
      }
      
      // Handle API failure response
      if (response.data && response.data.status === 'failure') {
        const reason = response.data.reason || ''
        const isRateLimited = reason.toLowerCase().includes('blocked') || 
                              reason.toLowerCase().includes('limit') ||
                              reason.toLowerCase().includes('exceeded')
        
        if (isRateLimited) {
          console.warn('⚠️ API rate limited during cache update:', reason)
          markKeyAsRateLimited(apiKey)
          return cache.upcoming || { data: [] }
        }
        console.error('❌ API returned failure:', reason)
      }

      return cache.upcoming || { data: [] }
    } catch (error) {
      const errorMessage = error.message || error.response?.data?.reason || ''
      const isRateLimited = errorMessage.toLowerCase().includes('blocked') || 
                            errorMessage.toLowerCase().includes('limit') ||
                            errorMessage.toLowerCase().includes('exceeded') ||
                            error.response?.status === 429
      
      if (isRateLimited) {
        console.warn('⚠️ Rate limited during cache update, keeping existing cache')
        if (apiKey) {
          markKeyAsRateLimited(apiKey)
        }
        return cache.upcoming || { data: [] }
      }
      
      console.error('❌ Error updating upcoming matches cache:', error.message)
      return cache.upcoming || { data: [] }
    } finally {
      cache.isUpdatingUpcoming = false
    }
  }

/**
 * Background cache updater - runs periodically
 */
let cacheUpdateInterval = null

export const startCacheUpdater = () => {
  if (cacheUpdateInterval) {
    console.log('⚠️ Cache updater already running')
    return
  }

  console.log(`🔄 Starting cache updater (interval: ${CACHE_UPDATE_INTERVAL / 1000}s)`)

  // Initial cache load with delay to avoid immediate rate limit
  setTimeout(async () => {
    await Promise.all([
      updateCurrentMatchesCache(),
      updateUpcomingMatchesCache(),
    ])
  }, 2000) // Wait 2 seconds before first update

  // Set up periodic updates
  cacheUpdateInterval = setInterval(async () => {
    // Check if all keys are blocked
    const now = Date.now()
    const allKeysBlocked = apiKeys.every(key => {
      const keyInfo = keyRateLimitMap.get(key)
      return keyInfo && keyInfo.blockedUntil && now < keyInfo.blockedUntil
    })
    
    if (allKeysBlocked) {
      const firstBlockedKey = apiKeys.find(key => {
        const keyInfo = keyRateLimitMap.get(key)
        return keyInfo && keyInfo.blockedUntil && now < keyInfo.blockedUntil
      })
      const keyInfo = keyRateLimitMap.get(firstBlockedKey)
      const remainingMs = keyInfo.blockedUntil - now
      const remainingMinutes = Math.ceil(remainingMs / 60000)
      console.log(`⏸️ Skipping cache update - all keys blocked (${remainingMinutes} min remaining)`)
      return
    }

    // Update cache (will handle key rotation automatically)
    await Promise.all([
      updateCurrentMatchesCache(),
      updateUpcomingMatchesCache(),
    ])
  }, CACHE_UPDATE_INTERVAL)

  console.log('✅ Cache updater started')
}

export const stopCacheUpdater = () => {
  if (cacheUpdateInterval) {
    clearInterval(cacheUpdateInterval)
    cacheUpdateInterval = null
    console.log('🛑 Cache updater stopped')
  }
}

// Export cache update functions for manual refresh
export const refreshCache = async () => {
  console.log('🔄 Manually refreshing cache...')
  await Promise.all([
    updateCurrentMatchesCache(),
    updateUpcomingMatchesCache(),
  ])
  return getCacheStatus()
}

/**
 * Get current/live matches - returns cached data, or fetches if cache is empty (for serverless)
 */
export const getCurrentMatches = async () => {
  // Return cached data if available and not empty
  if (cache.current && cache.current.data && Array.isArray(cache.current.data) && cache.current.data.length > 0) {
    return cache.current
  }
  
  // If cache is empty, fetch data on-demand (especially important for Vercel serverless)
  // This ensures data is available even if background cache updater hasn't run
  console.log('🔄 Cache empty for current matches, fetching on-demand...')
  try {
    const result = await updateCurrentMatchesCache()
    return result || { data: [] }
  } catch (error) {
    console.error('❌ Error fetching current matches on-demand:', error.message)
    return { data: [] }
  }
}

/**
 * Get upcoming matches - returns cached data, or fetches if cache is empty (for serverless)
 */
export const getUpcomingMatches = async () => {
  // Return cached data if available and not empty
  if (cache.upcoming && cache.upcoming.data && Array.isArray(cache.upcoming.data) && cache.upcoming.data.length > 0) {
    return cache.upcoming
  }
  
  // If cache is empty, fetch data on-demand (especially important for Vercel serverless)
  // This ensures data is available even if background cache updater hasn't run
  console.log('🔄 Cache empty for upcoming matches, fetching on-demand...')
  try {
    const result = await updateUpcomingMatchesCache()
    return result || { data: [] }
  } catch (error) {
    console.error('❌ Error fetching upcoming matches on-demand:', error.message)
    return { data: [] }
  }
}

/**
 * Get match details by ID with enhanced data (with caching)
 */
export const getMatchDetails = async (matchId) => {
  try {
    // Check cache first - ALWAYS return from cache if available
    const cached = cache.matchDetails.get(matchId)
    if (cached && (Date.now() - cached.timestamp) < MATCH_DETAILS_CACHE_DURATION) {
      console.log('✅ Match details served from cache:', matchId)
      return cached.data
    }
    
    // If cache expired but exists, return it anyway (stale cache is better than no data)
    if (cached) {
      console.log('⚠️ Cache expired but returning stale data:', matchId)
      return cached.data
    }
    
    // Throttle API call
    await throttleApiCall()
    
    let apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('CRICKET_API_KEY is not configured')
    }
    
    console.log('🔄 Fetching match details from API:', matchId)
    
    // Helper function to make API call with key rotation
    const makeApiCall = async (url, params) => {
      let currentKey = apiKey
      let lastError = null
      const maxKeyAttempts = apiKeys.length
      
      for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
        try {
          const response = await cricketAPI.get(url, {
            params: { ...params, apikey: currentKey },
          })
          return response
        } catch (error) {
          lastError = error
          const errorMessage = error.message || error.response?.data?.reason || ''
          const isRateLimited = errorMessage.toLowerCase().includes('blocked') || 
                                errorMessage.toLowerCase().includes('limit') ||
                                errorMessage.toLowerCase().includes('exceeded') ||
                                error.response?.status === 429
          
          if (isRateLimited) {
            console.warn(`⚠️ API key rate limited: ${currentKey.substring(0, 10)}...`)
            markKeyAsRateLimited(currentKey)
            
            // Get next key
            currentKey = getApiKey()
            if (!currentKey) {
              throw new Error('All API keys are rate limited')
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
          
          // Non-rate-limit error - throw it
          throw error
        }
      }
      
      throw lastError || new Error('Failed to fetch after trying all keys')
    }
    
    // Fetch match info with key rotation
    const matchInfoResponse = await makeApiCall(`/match_info`, { id: matchId })
    
    let matchData = matchInfoResponse.data
    
    // If match info is successful, try to get additional details
    if (matchData.status === 'success' && matchData.data) {
      // Extract squad data and organize by teams
      const extractSquadData = (squadResponse) => {
        if (!squadResponse || !squadResponse.data || !Array.isArray(squadResponse.data)) {
          return { team1Squad: [], team2Squad: [], team1PlayingXI: [], team2PlayingXI: [], players: [] }
        }
        
        const team1Data = squadResponse.data[0] || {}
        const team2Data = squadResponse.data[1] || {}
        
        const team1Players = team1Data.players || []
        const team2Players = team2Data.players || []
        
        // Convert players to a more usable format
        const formatPlayers = (players) => {
          return players.map((player) => ({
            name: player.name,
            id: player.id,
            role: player.role,
            battingStyle: player.battingStyle,
            bowlingStyle: player.bowlingStyle,
            country: player.country,
            image: player.playerImg || null,
          }))
        }
        
        return {
          team1Squad: formatPlayers(team1Players),
          team2Squad: formatPlayers(team2Players),
          team1PlayingXI: formatPlayers(team1Players.slice(0, 11)), // First 11 are usually playing XI
          team2PlayingXI: formatPlayers(team2Players.slice(0, 11)),
          players: [...formatPlayers(team1Players), ...formatPlayers(team2Players)],
        }
      }
      
      // Try to fetch squad data if hasSquad is true
      let squadData = null
      let squadResponseData = null
      if (matchData.data.hasSquad) {
        try {
          // Throttle before next API call
          await throttleApiCall()
          
          // Try to fetch squad using match_squad endpoint if available
          const squadResponse = await makeApiCall(`/match_squad`, { id: matchId })
          if (squadResponse.data && Array.isArray(squadResponse.data.data)) {
            squadResponseData = squadResponse.data
            squadData = extractSquadData(squadResponse.data)
            console.log('✅ Squad data fetched:', {
              team1Squad: squadData.team1Squad.length,
              team2Squad: squadData.team2Squad.length,
              team1PlayingXI: squadData.team1PlayingXI.length,
              team2PlayingXI: squadData.team2PlayingXI.length,
              totalPlayers: squadData.players.length,
            })
          }
        } catch (error) {
          console.log('⚠️ Squad endpoint not available or failed:', error.message)
        }
      }
      
      // Try to fetch detailed scorecard data for player information
      let scorecardData = null
      try {
        // Throttle before next API call
        await throttleApiCall()
        
        const scorecardResponse = await makeApiCall(`/match_scorecard`, { id: matchId })
        if (scorecardResponse.data && scorecardResponse.data.data) {
          scorecardData = scorecardResponse.data
          console.log('✅ Scorecard data fetched')
        }
      } catch (error) {
        console.log('⚠️ Scorecard endpoint not available or failed:', error.message)
      }
      
      // Try alternative endpoint: matchScorecard (without underscore)
      if (!scorecardData) {
        try {
          // Throttle before next API call
          await throttleApiCall()
          
          const altScorecardResponse = await makeApiCall(`/matchScorecard`, { id: matchId })
          if (altScorecardResponse.data && altScorecardResponse.data.data) {
            scorecardData = altScorecardResponse.data
            console.log('✅ Alternative scorecard data fetched')
          }
        } catch (error) {
          console.log('⚠️ Alternative scorecard endpoint not available')
        }
      }
      
      // Extract players from score data if available
      const extractPlayersFromScore = (scoreArray) => {
        const players = []
        if (!Array.isArray(scoreArray)) return players
        
        scoreArray.forEach((inning) => {
          // Extract batsmen
          if (inning.batsmen && Array.isArray(inning.batsmen)) {
            inning.batsmen.forEach((batsman) => {
              if (typeof batsman === 'object' && batsman.name) {
                players.push({
                  name: batsman.name,
                  runs: batsman.r,
                  balls: batsman.b,
                  fours: batsman['4s'],
                  sixes: batsman['6s'],
                  strikeRate: batsman.sr,
                  role: 'Batsman',
                  image: batsman.image || batsman.img || null,
                })
              }
            })
          }
          
          // Extract bowlers
          if (inning.bowlers && Array.isArray(inning.bowlers)) {
            inning.bowlers.forEach((bowler) => {
              if (typeof bowler === 'object' && bowler.name) {
                players.push({
                  name: bowler.name,
                  overs: bowler.o,
                  runs: bowler.r,
                  wickets: bowler.w,
                  maidens: bowler.m,
                  economy: bowler.econ,
                  role: 'Bowler',
                  image: bowler.image || bowler.img || null,
                })
              }
            })
          }
        })
        
        return players
      }
      
      // Extract and organize batting data from scorecard - simplified
      const organizeBattingData = (scorecardData, squadData, matchData) => {
        if (!scorecardData || !scorecardData.data) return null
        
        const scorecard = scorecardData.data.scorecard || []
        if (!Array.isArray(scorecard) || scorecard.length === 0) return null
        
        // Find the current/last active inning (the one currently batting or most recent)
        const currentInning = scorecard.find(inning => {
          const batting = inning.batting || []
          return batting.some(entry => entry.batsman && !entry.dismissal)
        }) || scorecard[scorecard.length - 1] // Fallback to last inning
        
        if (!currentInning) return null
        
        const batting = currentInning.batting || []
        const bowling = currentInning.bowling || []
        const teamName = currentInning.team || matchData.data.teams?.[scorecard.indexOf(currentInning)] || ''
        
        // Get the other team (bowling team)
        const teams = matchData.data.teams || []
        const bowlingTeam = teams.find(t => t !== teamName) || teams[1] || ''
        
        // Current batsmen (not dismissed)
        const currentBatsmen = []
        const dismissedBatsmen = []
        const allBattedNames = new Set()
        
        batting.forEach((entry) => {
          if (entry.batsman && entry.batsman.name) {
            allBattedNames.add(entry.batsman.name.toLowerCase())
            
            const batsmanData = {
              name: entry.batsman.name,
              runs: entry.r || 0,
              balls: entry.b || 0,
              dismissal: entry.dismissal || null,
            }
            
            if (entry.dismissal) {
              dismissedBatsmen.push(batsmanData)
            } else {
              currentBatsmen.push(batsmanData)
            }
          }
        })
        
        // Get next batsman (first from squad who hasn't batted)
        const teamSquad = scorecard.indexOf(currentInning) === 0 
          ? (squadData?.team1Squad || [])
          : (squadData?.team2Squad || [])
        
        let nextBatsman = null
        if (Array.isArray(teamSquad)) {
          for (const player of teamSquad) {
            const playerName = typeof player === 'string' ? player : (player.name || '')
            if (playerName && !allBattedNames.has(playerName.toLowerCase())) {
              nextBatsman = { name: playerName }
              break
            }
          }
        }
        
        // Current bowlers (top 2)
        const currentBowlers = bowling.slice(0, 2).map(bowler => ({
          name: bowler.bowler?.name || bowler.name || '',
          overs: bowler.o || 0,
          runs: bowler.r || 0,
          wickets: bowler.w || 0,
        })).filter(b => b.name)
        
        return {
          battingTeam: teamName,
          bowlingTeam: bowlingTeam,
          currentBatsmen: currentBatsmen.slice(0, 2),
          nextBatsman,
          dismissedBatsmen: dismissedBatsmen.slice(0, 5), // Show only last 5 dismissed
          currentBowlers,
          totalRuns: currentInning.totalRuns || matchData.data.score?.[scorecard.indexOf(currentInning)]?.r || 0,
          totalWickets: currentInning.totalWickets || matchData.data.score?.[scorecard.indexOf(currentInning)]?.w || 0,
          totalOvers: currentInning.totalOvers || matchData.data.score?.[scorecard.indexOf(currentInning)]?.o || 0,
        }
      }
      
      // Extract players from scorecard data
      const extractPlayersFromScorecard = (scorecardData) => {
        const players = []
        if (!scorecardData || !scorecardData.data) return players
        
        // The scorecard structure: data.scorecard is an array of innings
        const scorecard = scorecardData.data.scorecard || []
        
        if (!Array.isArray(scorecard)) return players
        
        // Process each inning
        scorecard.forEach((inning) => {
          // Extract batsmen from batting array
          if (inning.batting && Array.isArray(inning.batting)) {
            inning.batting.forEach((battingEntry) => {
              if (battingEntry.batsman && battingEntry.batsman.name) {
                players.push({
                  name: battingEntry.batsman.name,
                  id: battingEntry.batsman.id,
                  runs: battingEntry.r,
                  balls: battingEntry.b,
                  fours: battingEntry['4s'],
                  sixes: battingEntry['6s'],
                  strikeRate: battingEntry.sr,
                  role: 'Batsman',
                  image: null, // Will be merged from squad data
                })
              }
            })
          }
          
          // Extract bowlers from bowling array
          if (inning.bowling && Array.isArray(inning.bowling)) {
            inning.bowling.forEach((bowlingEntry) => {
              if (bowlingEntry.bowler && bowlingEntry.bowler.name) {
                players.push({
                  name: bowlingEntry.bowler.name,
                  id: bowlingEntry.bowler.id,
                  overs: bowlingEntry.o,
                  runs: bowlingEntry.r,
                  wickets: bowlingEntry.w,
                  maidens: bowlingEntry.m,
                  economy: bowlingEntry.eco,
                  role: 'Bowler',
                  image: null, // Will be merged from squad data
                })
              }
            })
          }
        })
        
        return players
      }
      
      // Combine all player sources
      const playersFromScore = extractPlayersFromScore(matchData.data.score || [])
      const playersFromScorecard = extractPlayersFromScorecard(scorecardData)
      const playersFromSquad = squadData?.players || []
      const playersFromMatchData = matchData.data.players || matchData.data.playerInfo || []
      
      // Debug: Log score structure to understand what we're working with
      console.log('🔍 Score data structure:', {
        scoreIsArray: Array.isArray(matchData.data.score),
        scoreLength: matchData.data.score?.length || 0,
        scoreSample: matchData.data.score ? JSON.stringify(matchData.data.score[0]).substring(0, 200) : 'no score',
        playersFromScore: playersFromScore.length,
        playersFromScorecard: playersFromScorecard.length,
        playersFromSquad: playersFromSquad.length,
        playersFromMatchData: playersFromMatchData.length,
        hasScorecardData: !!scorecardData,
      })
      
      // Merge players, avoiding duplicates and enriching with squad data (images, roles)
      const allPlayersMap = new Map()
      
      // First, add all squad players (for images and roles)
      if (Array.isArray(playersFromSquad)) {
        playersFromSquad.forEach((player) => {
          if (player.name) {
            allPlayersMap.set(player.name.toLowerCase(), { ...player })
          }
        })
      }
      
      // Add players from scorecard (most detailed performance data)
      playersFromScorecard.forEach((player) => {
        if (player.name) {
          const key = player.name.toLowerCase()
          if (!allPlayersMap.has(key)) {
            allPlayersMap.set(key, player)
          } else {
            // Merge performance data with squad data (keep image from squad)
            const existing = allPlayersMap.get(key)
            allPlayersMap.set(key, { 
              ...existing, 
              ...player,
              image: existing.image || player.image, // Prefer squad image
            })
          }
        }
      })
      
      // Add players from score (most current)
      playersFromScore.forEach((player) => {
        if (player.name) {
          const key = player.name.toLowerCase()
          if (!allPlayersMap.has(key)) {
            allPlayersMap.set(key, player)
          } else {
            // Merge data
            const existing = allPlayersMap.get(key)
            allPlayersMap.set(key, { ...existing, ...player })
          }
        }
      })
      
      // Add players from match data
      if (Array.isArray(playersFromMatchData)) {
        playersFromMatchData.forEach((player) => {
          const playerName = typeof player === 'string' ? player : (player.name || player.playerName || player.player)
          if (playerName && playerName !== 'Unknown Player') {
            const key = playerName.toLowerCase()
            if (!allPlayersMap.has(key)) {
              allPlayersMap.set(key, typeof player === 'string' ? { name: playerName } : player)
            }
          }
        })
      }
      
      const allPlayers = Array.from(allPlayersMap.values())
      
      // Enhance the data structure
      const enhancedData = {
        ...matchData,
        data: {
          ...matchData.data,
          // Extract squad from extracted squad data
          team1Squad: squadData?.team1Squad || [],
          team2Squad: squadData?.team2Squad || [],
          team1PlayingXI: squadData?.team1PlayingXI || [],
          team2PlayingXI: squadData?.team2PlayingXI || [],
          // Extract players with more details from multiple sources
          players: allPlayers.length > 0 ? allPlayers : (matchData.data.players || matchData.data.playerInfo || []),
          // Organized batting data (simplified - current state only)
          battingData: organizeBattingData(scorecardData, squadData, matchData),
          // Match statistics
          stats: matchData.data.stats || matchData.data.statistics || {},
          // Recent events/commentary
          commentary: matchData.data.commentary || matchData.data.recentEvents || [],
          // Additional match info
          tossWinner: matchData.data.tossWinner || null,
          tossChoice: matchData.data.tossChoice || null,
          matchWinner: matchData.data.matchWinner || null,
        }
      }
      
      console.log('✅ Enhanced match data:', {
        playersCount: enhancedData.data.players.length,
        team1SquadCount: enhancedData.data.team1Squad.length,
        team2SquadCount: enhancedData.data.team2Squad.length,
        team1PlayingXICount: enhancedData.data.team1PlayingXI.length,
        team2PlayingXICount: enhancedData.data.team2PlayingXI.length,
      })
      
      // ALWAYS store in cache (even if enhanced or not)
      cache.matchDetails.set(matchId, {
        data: enhancedData,
        timestamp: Date.now(),
      })
      console.log('💾 Match details cached:', matchId)
      
      return enhancedData
    }
    
    // Cache even if no enhanced data - ALWAYS cache
    cache.matchDetails.set(matchId, {
      data: matchData,
      timestamp: Date.now(),
    })
    console.log('💾 Match details cached (basic):', matchId)
    
    return matchData
  } catch (error) {
    console.error('Error fetching match details:', error.message)
    
    // ALWAYS return cached data if available (even if expired)
    const cached = cache.matchDetails.get(matchId)
    if (cached) {
      console.log('⚠️ Error occurred, returning cached data:', matchId)
      return cached.data
    }
    
    throw error
  }
}

/**
 * Get series list (with caching)
 */
const seriesCache = {
  data: null,
  timestamp: null,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
}

export const getSeriesList = async () => {
  try {
    // Check cache first
    if (seriesCache.data && seriesCache.timestamp && 
        (Date.now() - seriesCache.timestamp) < seriesCache.CACHE_DURATION) {
      console.log('✅ Series list served from cache')
      return seriesCache.data
    }
    
    // Throttle API call
    await throttleApiCall()
    
    let apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('CRICKET_API_KEY is not configured')
    }
    
    // Try with key rotation
    let response = null
    let lastError = null
    const maxKeyAttempts = apiKeys.length
    
    for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
      try {
        response = await cricketAPI.get('/series', {
          params: {
            apikey: apiKey,
            offset: 0,
          },
        })
        break
      } catch (error) {
        lastError = error
        const errorMessage = error.message || error.response?.data?.reason || ''
        const isRateLimited = errorMessage.toLowerCase().includes('blocked') || 
                              errorMessage.toLowerCase().includes('limit') ||
                              errorMessage.toLowerCase().includes('exceeded') ||
                              error.response?.status === 429
        
        if (isRateLimited) {
          markKeyAsRateLimited(apiKey)
          apiKey = getApiKey()
          if (!apiKey) {
            throw new Error('All API keys are rate limited')
          }
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        throw error
      }
    }
    
    if (!response) {
      throw lastError || new Error('Failed to fetch series')
    }
    
    // Store in cache
    if (response.data.status === 'success') {
      seriesCache.data = response.data
      seriesCache.timestamp = Date.now()
      console.log('💾 Series list cached')
      return response.data
    }
    
    return response.data
  } catch (error) {
    console.error('Error fetching series list:', error.message)
    
    // Return cached data if available
    if (seriesCache.data) {
      console.log('⚠️ Error occurred, returning cached series data')
      return seriesCache.data
    }
    
    throw error
  }
}

/**
 * Helper function to extract matches from API response
 */
const extractMatches = (data) => {
  // Handle format returned by getCurrentMatches/getUpcomingMatches: { data: [...] }
  if (data?.data && Array.isArray(data.data)) {
    return data.data
  }
  // Handle cricapi.com direct API response format: { data: [...], status: 'success', info: {...} }
  if (data?.data && Array.isArray(data.data)) {
    return data.data
  }
  // Handle different response formats
  if (Array.isArray(data)) {
    return data
  }
  if (data?.matches && Array.isArray(data.matches)) {
    return data.matches
  }
  if (data?.results && Array.isArray(data.results)) {
    return data.results
  }
  console.log('⚠️ extractMatches: Could not extract matches from:', {
    type: typeof data,
    isArray: Array.isArray(data),
    keys: data ? Object.keys(data) : 'null',
    sample: JSON.stringify(data).substring(0, 200)
  })
  return []
}

/**
 * Get all matches (current, live, upcoming combined) - returns cached data only
 */
export const getAllMatches = async () => {
  try {
    const [liveMatches, upcomingMatches] = await Promise.all([
      getCurrentMatches(),
      getUpcomingMatches(),
    ])

    const live = extractMatches(liveMatches)
    const upcoming = extractMatches(upcomingMatches)

    return {
      live,
      upcoming,
    }
  } catch (error) {
    console.error('❌ Error fetching all matches:', error.message)
    return {
      live: [],
      upcoming: [],
    }
  }
}

