import express from 'express'
import User from '../models/User.js'
import ReferralSettings from '../models/ReferralSettings.js'
import Transaction from '../models/Transaction.js'

const router = express.Router()

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { phone, name, password, referralCode } = req.body

    // Validation
    if (!phone || !name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone, name, and password are required',
      })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists',
      })
    }

    // Get referral settings first to check if program is active
    const referralSettings = await ReferralSettings.getSettings()

    // Handle referral code if provided
    let referrer = null
    if (referralCode) {
      // Check if referral program is active
      if (!referralSettings.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Referral program is currently inactive',
        })
      }
      
      referrer = await User.findOne({ referralCode })
      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code',
        })
      }
      // Prevent self-referral
      if (referrer.phone === phone) {
        return res.status(400).json({
          success: false,
          message: 'Cannot use your own referral code',
        })
      }
    }

    // Create new user
    const user = new User({
      phone,
      name,
      password, // In production, hash this password
      walletBalance: 0,
      isAdmin: false,
      referredBy: referrer ? referrer.phone : null,
    })

    await user.save()

    // Process referral rewards if applicable
    if (referrer && referralSettings.isActive) {
      try {
        // Credit referrer
        referrer.walletBalance += referralSettings.referrerReward
        referrer.totalReferrals += 1
        await referrer.save()

        // Credit referred user
        user.walletBalance += referralSettings.referredReward
        await user.save()

        // Create transaction records for tracking
        const referrerTransaction = new Transaction({
          userId: referrer.phone,
          amount: referralSettings.referrerReward,
          paymentType: 'order',
          status: 'completed',
        })
        await referrerTransaction.save()

        const referredTransaction = new Transaction({
          userId: user.phone,
          amount: referralSettings.referredReward,
          paymentType: 'order',
          status: 'completed',
        })
        await referredTransaction.save()

        console.log(`Referral reward processed: Referrer ${referrer.phone} got ${referralSettings.referrerReward}, Referred ${user.phone} got ${referralSettings.referredReward}`)
      } catch (rewardError) {
        console.error('Error processing referral rewards:', rewardError)
        // Don't fail registration if reward processing fails
      }
    }

    // Return user without password
    const userResponse = user.toObject()
    delete userResponse.password

    res.status(201).json({
      success: true,
      message: referrer ? 'User registered successfully with referral bonus!' : 'User registered successfully',
      data: userResponse,
    })
  } catch (error) {
    console.error('Error in /register route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: error.message,
    })
  }
})

// Login user
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body

    // Validation
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone and password are required',
      })
    }

    // Find user
    const user = await User.findOne({ phone })
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password',
      })
    }

    // Check password (In production, use bcrypt to compare hashed passwords)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password',
      })
    }

    // Check if user is restricted
    if (user.isRestricted) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been restricted. Please contact support.',
      })
    }

    // Return user without password
    const userResponse = user.toObject()
    delete userResponse.password

    res.json({
      success: true,
      message: 'Login successful',
      data: userResponse,
    })
  } catch (error) {
    console.error('Error in /login route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message,
    })
  }
})

// Get user by ID
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await User.findOne({ phone: userId }).select('-password')
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    res.json({
      success: true,
      data: user,
    })
  } catch (error) {
    console.error('Error in /user/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message,
    })
  }
})

export default router

