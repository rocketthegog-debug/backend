import express from 'express'
import User from '../models/User.js'
import ReferralSettings from '../models/ReferralSettings.js'

const router = express.Router()

// Get referral link and stats for a user
router.get('/link/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await User.findOne({ phone: userId })
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Ensure user has a referral code
    if (!user.referralCode) {
      // Generate referral code if missing (with uniqueness check)
      let attempts = 0
      let isUnique = false
      let newCode = ''
      
      while (!isUnique && attempts < 10) {
        const timestamp = Date.now().toString(36).slice(-6).toUpperCase()
        const randomStr = Math.random().toString(36).slice(2, 5).toUpperCase()
        const phoneSuffix = user.phone.slice(-4)
        newCode = `REF${phoneSuffix}${timestamp}${randomStr}`
        
        // Check if code already exists
        const existing = await User.findOne({ referralCode: newCode })
        if (!existing) {
          isUnique = true
        }
        attempts++
      }
      
      // Fallback if still not unique
      if (!isUnique) {
        const timestamp = Date.now().toString(36).slice(-6).toUpperCase()
        const randomStr = Math.random().toString(36).slice(2, 8).toUpperCase()
        const phoneSuffix = user.phone.slice(-4)
        newCode = `REF${phoneSuffix}${timestamp}${randomStr}`
      }
      
      user.referralCode = newCode
      await user.save()
    }

    // Get referral settings to show reward info
    const settings = await ReferralSettings.getSettings()
    
    // Check if referral program is active
    if (!settings.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Referral program is currently inactive',
        data: {
          isActive: false,
        },
      })
    }
    
    // Get referral stats
    const referredUsers = await User.find({ referredBy: user.phone }).select('name phone createdAt')
    
    // Generate referral link (using current request origin or env variable)
    const frontendUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:5173')
    const referralLink = `${frontendUrl}?ref=${user.referralCode}`

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referralLink,
        totalReferrals: user.totalReferrals,
        referredUsers: referredUsers.map(u => ({
          name: u.name,
          phone: u.phone,
          joinedAt: u.createdAt,
        })),
        rewardInfo: {
          referrerReward: settings.referrerReward,
          referredReward: settings.referredReward,
        },
        isActive: true,
      },
    })
  } catch (error) {
    console.error('Error in /referral/link route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral link',
      error: error.message,
    })
  }
})

// Admin: Get referral settings
router.get('/settings', async (req, res) => {
  try {
    const { adminUserId } = req.query
    
    if (adminUserId) {
      const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
      if (!admin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }
    }

    const settings = await ReferralSettings.getSettings()
    
    res.json({
      success: true,
      data: settings,
    })
  } catch (error) {
    console.error('Error in /referral/settings route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral settings',
      error: error.message,
    })
  }
})

// Admin: Update referral settings
router.put('/settings', async (req, res) => {
  try {
    const { adminUserId, referrerReward, referredReward, isActive } = req.body

    if (!adminUserId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required',
      })
    }

    const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
    if (!admin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      })
    }

    // Validation
    if (referrerReward !== undefined && referrerReward < 0) {
      return res.status(400).json({
        success: false,
        message: 'Referrer reward must be non-negative',
      })
    }

    if (referredReward !== undefined && referredReward < 0) {
      return res.status(400).json({
        success: false,
        message: 'Referred reward must be non-negative',
      })
    }

    // Update settings
    const settings = await ReferralSettings.getSettings()
    if (referrerReward !== undefined) settings.referrerReward = referrerReward
    if (referredReward !== undefined) settings.referredReward = referredReward
    if (isActive !== undefined) settings.isActive = isActive

    await settings.save()

    res.json({
      success: true,
      message: 'Referral settings updated successfully',
      data: settings,
    })
  } catch (error) {
    console.error('Error in /referral/settings PUT route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update referral settings',
      error: error.message,
    })
  }
})

// Verify referral code (for frontend validation)
router.get('/verify/:referralCode', async (req, res) => {
  try {
    const { referralCode } = req.params
    
    const user = await User.findOne({ referralCode })
    
    if (!user) {
      return res.json({
        success: false,
        valid: false,
        message: 'Invalid referral code',
      })
    }

    res.json({
      success: true,
      valid: true,
      data: {
        referrerName: user.name,
      },
    })
  } catch (error) {
    console.error('Error in /referral/verify route:', error)
    res.status(500).json({
      success: false,
      valid: false,
      message: 'Failed to verify referral code',
      error: error.message,
    })
  }
})

export default router

