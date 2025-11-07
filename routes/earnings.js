import express from 'express'
import Transaction from '../models/Transaction.js'
import User from '../models/User.js'

const router = express.Router()

// Helper function to calculate cooldown time based on consecutive clicks
const calculateCooldown = (consecutiveClicks) => {
  if (consecutiveClicks <= 5) {
    return 0 // No cooldown for 5 or fewer clicks
  }
  // After 5 clicks: random between 2-10 minutes, increasing with more clicks
  // Formula: min(2 + (consecutiveClicks - 5), 10) minutes base, then add randomness
  const extraClicks = consecutiveClicks - 5
  const baseMinutes = Math.min(2 + extraClicks, 10) // 2-10 minutes based on clicks
  // Random variation: ±1 minute around base
  const randomVariation = (Math.random() - 0.5) * 2 // -1 to +1
  const finalMinutes = Math.max(2, Math.min(10, baseMinutes + randomVariation))
  return finalMinutes * 60 * 1000 // Convert to milliseconds
}

// Helper function to check and update rate limit from database
const checkRateLimit = async (user) => {
  const now = Date.now()
  const oneMinute = 60 * 1000
  
  // Check if cooldown is active
  if (user.cooldownUntil && now < user.cooldownUntil.getTime()) {
    const cooldownRemaining = Math.ceil((user.cooldownUntil.getTime() - now) / 1000) // seconds
    return {
      allowed: false,
      cooldownRemaining,
      cooldownMinutes: Math.ceil(cooldownRemaining / 60),
      consecutiveClicks: user.consecutiveClicks || 0,
    }
  }
  
  // If no previous clicks, initialize
  if (!user.lastClickTime) {
    user.lastClickTime = new Date(now)
    user.consecutiveClicks = 1
    user.cooldownUntil = null
    await user.save()
    return { allowed: true, cooldownRemaining: 0, consecutiveClicks: 1 }
  }
  
  const timeSinceLastClick = now - user.lastClickTime.getTime()
  
  // Reset consecutive count if more than 1 minute has passed
  if (timeSinceLastClick > oneMinute) {
    user.consecutiveClicks = 1
    user.lastClickTime = new Date(now)
    user.cooldownUntil = null
    await user.save()
    return { allowed: true, cooldownRemaining: 0, consecutiveClicks: 1 }
  }
  
  // Increment consecutive clicks
  user.consecutiveClicks = (user.consecutiveClicks || 0) + 1
  user.lastClickTime = new Date(now)
  
  // Check if cooldown is needed (more than 5 consecutive clicks)
  if (user.consecutiveClicks > 5) {
    const cooldownMs = calculateCooldown(user.consecutiveClicks)
    user.cooldownUntil = new Date(now + cooldownMs)
    await user.save()
    
    return {
      allowed: false,
      cooldownRemaining: Math.ceil(cooldownMs / 1000), // seconds
      cooldownMinutes: Math.ceil(cooldownMs / 60000),
      consecutiveClicks: user.consecutiveClicks,
    }
  }
  
  // Update and allow click
  await user.save()
  return { allowed: true, cooldownRemaining: 0, consecutiveClicks: user.consecutiveClicks }
}

// Click to earn endpoint
router.post('/click', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      })
    }

    // Get user and wallet balance
    const user = await User.findOne({ phone: userId })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Check if user is restricted
    if (user.isRestricted) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been restricted. Please contact support.',
      })
    }

    const walletBalance = user.walletBalance || 0

    // Get today's click count (transactions with paymentType 'click-earn' created today)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const todayClicks = await Transaction.countDocuments({
      userId,
      paymentType: 'click-earn',
      createdAt: { $gte: today },
    })

    // Determine tier based on wallet balance
    let tier = null
    let maxClicks = 0
    let maxEarning = 0
    let commonRange = { min: 0, max: 0 }
    let rareRange = { min: 0, max: 0 }

    if (walletBalance >= 10000) {
      tier = '10k'
      maxClicks = 1000
      maxEarning = 20
      commonRange = { min: 2, max: 10 }
      rareRange = { min: 10, max: 20 }
    } else if (walletBalance >= 5000) {
      tier = '5k'
      maxClicks = 500
      maxEarning = 10
      commonRange = { min: 1, max: 5 }
      rareRange = { min: 5, max: 10 }
    } else if (walletBalance >= 2000) {
      tier = '2k'
      maxClicks = 300
      maxEarning = 5
      commonRange = { min: 0.5, max: 2.5 }
      rareRange = { min: 2.5, max: 5 }
    } else if (walletBalance >= 1000) {
      tier = '1k'
      maxClicks = 200
      maxEarning = 3
      commonRange = { min: 0.3, max: 1.5 }
      rareRange = { min: 1.5, max: 3 }
    } else if (walletBalance >= 500) {
      tier = '500'
      maxClicks = 180
      maxEarning = 2.5
      commonRange = { min: 0.2, max: 1.2 }
      rareRange = { min: 1.2, max: 2.5 }
    } else if (walletBalance >= 200) {
      tier = '200'
      maxClicks = 150
      maxEarning = 2
      commonRange = { min: 0.2, max: 0.9 }
      rareRange = { min: 1.2, max: 2 }
    } else if (walletBalance >= 100) {
      tier = '100'
      maxClicks = 100
      maxEarning = 1
      commonRange = { min: 0.2, max: 0.6 }
      rareRange = { min: 0.8, max: 1 }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Minimum wallet balance of ₹100 required to earn',
        data: {
          walletBalance,
          requiredBalance: 100,
        },
      })
    }

    // Check if daily click limit reached
    if (todayClicks >= maxClicks) {
      return res.status(400).json({
        success: false,
        message: `Daily click limit reached (${maxClicks} clicks per day)`,
        data: {
          clicksToday: todayClicks,
          maxClicks,
          resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      })
    }

    // Check rate limit (consecutive clicks cooldown)
    const rateLimitCheck = await checkRateLimit(user)
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${rateLimitCheck.cooldownMinutes} minute(s) before clicking again. Too many consecutive clicks.`,
        data: {
          cooldownRemaining: rateLimitCheck.cooldownRemaining,
          cooldownMinutes: rateLimitCheck.cooldownMinutes,
          consecutiveClicks: rateLimitCheck.consecutiveClicks,
          retryAfter: new Date(Date.now() + rateLimitCheck.cooldownRemaining * 1000),
        },
      })
    }

    // Calculate earning amount based on probability
    let earningAmount = 0
    const random = Math.random()
    
    // 95% chance for common range, 5% chance for rare range
    if (random < 0.95) {
      // Common range - uniform distribution (95% probability)
      earningAmount = commonRange.min + Math.random() * (commonRange.max - commonRange.min)
    } else {
      // Rare range - uniform distribution (5% probability)
      earningAmount = rareRange.min + Math.random() * (rareRange.max - rareRange.min)
    }

    // Round to 2 decimal places
    earningAmount = Math.round(earningAmount * 100) / 100

    // Create click-earn transaction
    const transaction = new Transaction({
      userId,
      amount: earningAmount,
      paymentType: 'click-earn',
      status: 'completed',
      createdAt: new Date(),
    })

    await transaction.save()

    // Update user wallet balance
    user.walletBalance += earningAmount
    await user.save()

    res.json({
      success: true,
      message: `Earned ₹${earningAmount.toFixed(2)}!`,
      data: {
        earningAmount,
        walletBalance: user.walletBalance,
        clicksToday: todayClicks + 1,
        maxClicks,
        clicksRemaining: maxClicks - (todayClicks + 1),
        tier,
        consecutiveClicks: rateLimitCheck.consecutiveClicks || 1,
        cooldownWarning: rateLimitCheck.consecutiveClicks >= 4 ? `Warning: ${5 - rateLimitCheck.consecutiveClicks} clicks until cooldown` : null,
      },
    })
  } catch (error) {
    console.error('Error in POST /earnings/click route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to process click earning',
      error: error.message,
    })
  }
})

// Get click earning stats
router.get('/click-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findOne({ phone: userId })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    const walletBalance = user.walletBalance || 0

    // Get today's clicks
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const todayClicks = await Transaction.countDocuments({
      userId,
      paymentType: 'click-earn',
      createdAt: { $gte: today },
    })

    // Determine tier
    let tier = null
    let maxClicks = 0
    let maxEarning = 0

    if (walletBalance >= 10000) {
      tier = '10k'
      maxClicks = 1000
      maxEarning = 20
    } else if (walletBalance >= 5000) {
      tier = '5k'
      maxClicks = 500
      maxEarning = 10
    } else if (walletBalance >= 2000) {
      tier = '2k'
      maxClicks = 300
      maxEarning = 5
    } else if (walletBalance >= 1000) {
      tier = '1k'
      maxClicks = 200
      maxEarning = 3
    } else if (walletBalance >= 500) {
      tier = '500'
      maxClicks = 180
      maxEarning = 2.5
    } else if (walletBalance >= 200) {
      tier = '200'
      maxClicks = 150
      maxEarning = 2
    } else if (walletBalance >= 100) {
      tier = '100'
      maxClicks = 100
      maxEarning = 1
    }

    res.json({
      success: true,
      data: {
        walletBalance,
        clicksToday: todayClicks,
        maxClicks: tier ? maxClicks : 0,
        clicksRemaining: tier ? maxClicks - todayClicks : 0,
        tier: tier || 'none',
        maxEarning: tier ? maxEarning : 0,
        canEarn: walletBalance >= 100,
        consecutiveClicks: user.consecutiveClicks || 0,
        cooldownUntil: user.cooldownUntil || null,
        isCooldownActive: user.cooldownUntil && Date.now() < user.cooldownUntil.getTime(),
      },
    })
  } catch (error) {
    console.error('Error in GET /earnings/click-stats/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch click stats',
      error: error.message,
    })
  }
})

// Get user earnings summary
router.get('/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { timeRange } = req.query // 'all', 'today', 'week', 'month'

    // Get all completed transactions that represent earnings (orders and click-earn)
    const query = {
      userId,
      status: 'completed',
      paymentType: { $in: ['order', 'click-earn'] },
    }

    // Add time filter if specified
    const now = new Date()
    if (timeRange === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      query.createdAt = { $gte: today }
    } else if (timeRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      query.createdAt = { $gte: weekAgo }
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
      query.createdAt = { $gte: monthAgo }
    }

    const transactions = await Transaction.find(query).sort({ createdAt: -1 })

    // Calculate earnings
    const totalEarnings = transactions.reduce((sum, tx) => sum + tx.amount, 0)

    // Calculate time-specific earnings
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)

    const allTransactions = await Transaction.find({
      userId,
      status: 'completed',
      paymentType: 'order',
    }).sort({ createdAt: -1 })

    const todayEarnings = allTransactions
      .filter(tx => new Date(tx.createdAt) >= today)
      .reduce((sum, tx) => sum + tx.amount, 0)

    const weekEarnings = allTransactions
      .filter(tx => new Date(tx.createdAt) >= weekAgo)
      .reduce((sum, tx) => sum + tx.amount, 0)

    const monthEarnings = allTransactions
      .filter(tx => new Date(tx.createdAt) >= monthAgo)
      .reduce((sum, tx) => sum + tx.amount, 0)

    res.json({
      success: true,
      data: {
        total: totalEarnings,
        today: todayEarnings,
        thisWeek: weekEarnings,
        thisMonth: monthEarnings,
        count: transactions.length,
      },
    })
  } catch (error) {
    console.error('Error in /earnings/summary/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings summary',
      error: error.message,
    })
  }
})

// Get user earnings history
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { timeRange = 'all', limit = 50 } = req.query

    // Get all completed transactions that represent earnings (orders and click-earn)
    const query = {
      userId,
      status: 'completed',
      paymentType: { $in: ['order', 'click-earn'] },
    }

    // Add time filter if specified
    const now = new Date()
    if (timeRange === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      query.createdAt = { $gte: today }
    } else if (timeRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      query.createdAt = { $gte: weekAgo }
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
      query.createdAt = { $gte: monthAgo }
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    res.json({
      success: true,
      data: transactions,
    })
  } catch (error) {
    console.error('Error in /earnings/history/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings history',
      error: error.message,
    })
  }
})

// Create earnings transaction (when an order is completed)
router.post('/create', async (req, res) => {
  try {
    const { userId, amount, orderId } = req.body

    // Validation
    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'User ID and amount are required',
      })
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      })
    }

    // Create earnings transaction (this represents an order payment that's completed)
    const transaction = new Transaction({
      userId,
      amount,
      paymentType: 'order',
      status: 'completed', // Earnings are immediately completed
      createdAt: new Date(),
    })

    await transaction.save()

    res.json({
      success: true,
      message: 'Earnings transaction created successfully',
      data: transaction,
    })
  } catch (error) {
    console.error('Error in POST /earnings/create route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create earnings transaction',
      error: error.message,
    })
  }
})

// Update earnings transaction status (for admin)
router.put('/:transactionId/status', async (req, res) => {
  try {
    const { transactionId } = req.params
    const { status } = req.body

    if (!status || !['completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (completed or cancelled)',
      })
    }

    const transaction = await Transaction.findById(transactionId)

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    if (transaction.paymentType !== 'order') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not an earnings transaction',
      })
    }

    transaction.status = status
    await transaction.save()

    res.json({
      success: true,
      message: 'Earnings transaction updated successfully',
      data: transaction,
    })
  } catch (error) {
    console.error('Error in PUT /earnings/:transactionId/status route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update earnings transaction',
      error: error.message,
    })
  }
})

export default router


