import express from 'express'
import axios from 'axios'
import {
  getCurrentMatches,
  getUpcomingMatches,
  getAllMatches,
  getSeriesList,
  getMatchDetails,
  getCacheStatus,
  refreshCache,
} from '../services/cricketService.js'

const router = express.Router()

// Get cache status
router.get('/cache-status', async (req, res) => {
  try {
    const status = getCacheStatus()
    res.json({
      success: true,
      cache: status,
    })
  } catch (error) {
    console.error('Error getting cache status:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Manually refresh cache
router.post('/cache-refresh', async (req, res) => {
  try {
    const status = await refreshCache()
    res.json({
      success: true,
      message: 'Cache refreshed successfully',
      cache: status,
    })
  } catch (error) {
    console.error('Error refreshing cache:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Test endpoint to check API directly
router.get('/test-api', async (req, res) => {
  try {
    const CRICKET_API_KEY = process.env.CRICKET_API_KEY
    
    console.log('🧪 Testing cricket API directly with key:', CRICKET_API_KEY ? `${CRICKET_API_KEY.substring(0, 10)}...` : 'MISSING')
    const response = await axios.get('https://api.cricapi.com/v1/matches', {
      params: {
        apikey: CRICKET_API_KEY,
        offset: 0,
      },
      timeout: 10000,
    })
    
    console.log('✅ Direct API test response:', {
      status: response.data.status,
      reason: response.data.reason,
      dataCount: response.data.data ? response.data.data.length : 0,
      firstMatch: response.data.data?.[0] ? {
        name: response.data.data[0].name,
        teams: response.data.data[0].teams,
        matchStarted: response.data.data[0].matchStarted,
        matchEnded: response.data.data[0].matchEnded,
        score: response.data.data[0].score,
      } : null
    })
    
    res.json({
      success: true,
      apiResponse: {
        status: response.data.status,
        reason: response.data.reason,
        dataCount: response.data.data ? response.data.data.length : 0,
        sampleMatch: response.data.data?.[0] || null,
        fullResponse: response.data, // Include full response for debugging
      }
    })
  } catch (error) {
    console.error('❌ Test API error:', error.message)
    console.error('❌ Error details:', error.response?.data)
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No response data',
      statusCode: error.response?.status,
    })
  }
})
// Get all matches (live + upcoming)
router.get('/matches', async (req, res) => {
  try {
    const matches = await getAllMatches()
    const cacheStatus = getCacheStatus()
    
    // Check if we have data
    const hasData = matches.live.length > 0 || matches.upcoming.length > 0
    
    // If no data and rate limited, include rate limit info
    if (!hasData && cacheStatus.rateLimit?.isInCooldown) {
      return res.json({
        success: true,
        data: {
          live: [],
          upcoming: [],
        },
        message: `API rate limited. Retrying in ${cacheStatus.rateLimit.cooldownRemainingMinutes} minutes.`,
        rateLimit: cacheStatus.rateLimit,
      })
    }
    
    res.json({
      success: true,
      data: {
        live: Array.isArray(matches.live) 
          ? matches.live 
          : Array.isArray(matches.live?.data) 
          ? matches.live.data 
          : Array.isArray(matches.live?.matches)
          ? matches.live.matches
          : Array.isArray(matches.live?.results)
          ? matches.live.results
          : [],
        upcoming: Array.isArray(matches.upcoming)
          ? matches.upcoming
          : Array.isArray(matches.upcoming?.data)
          ? matches.upcoming.data
          : Array.isArray(matches.upcoming?.matches)
          ? matches.upcoming.matches
          : Array.isArray(matches.upcoming?.results)
          ? matches.upcoming.results
          : [],
      },
    })
  } catch (error) {
    console.error('❌ Error in /matches route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch matches',
      error: error.message,
      data: { live: [], upcoming: [] },
    })
  }
})

// Get current/live matches only
router.get('/matches/current', async (req, res) => {
  try {
    const matches = await getCurrentMatches()
    res.json({
      success: true,
      data: matches,
    })
  } catch (error) {
    console.error('Error in /matches/current route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current matches',
      error: error.message,
    })
  }
})

// Get upcoming matches only
router.get('/matches/upcoming', async (req, res) => {
  try {
    const matches = await getUpcomingMatches()
    res.json({
      success: true,
      data: matches,
    })
  } catch (error) {
    console.error('Error in /matches/upcoming route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming matches',
      error: error.message,
    })
  }
})

// Get match details by ID
router.get('/matches/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params
    const match = await getMatchDetails(matchId)
    
    // Log the response structure for debugging
    console.log('📤 Backend - Sending match details:', {
      hasMatch: !!match,
      matchStatus: match?.status,
      hasData: !!match?.data,
      playersCount: match?.data?.players?.length || 0,
      team1SquadCount: match?.data?.team1Squad?.length || 0,
      team2SquadCount: match?.data?.team2Squad?.length || 0,
    })
    
    res.json({
      success: true,
      data: match,
    })
  } catch (error) {
    console.error('Error in /matches/:matchId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch match details',
      error: error.message,
    })
  }
})

// Get series list
router.get('/series', async (req, res) => {
  try {
    const series = await getSeriesList()
    res.json({
      success: true,
      data: series,
    })
  } catch (error) {
    console.error('Error in /series route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch series',
      error: error.message,
    })
  }
})

export default router

