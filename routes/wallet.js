import express from 'express'
import User from '../models/User.js'
import Transaction from '../models/Transaction.js'

const router = express.Router()

// Get wallet balance
router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await User.findOne({ phone: userId })
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    res.json({
      success: true,
      data: {
        balance: user.walletBalance,
      },
    })
  } catch (error) {
    console.error('Error in /balance route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet balance',
      error: error.message,
    })
  }
})

// Create withdrawal request
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount } = req.body

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

    // Find user
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

    // Check if user has sufficient balance
    if (user.walletBalance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance',
      })
    }

    // Create withdrawal transaction with "processing" status
    const transaction = new Transaction({
      userId,
      amount,
      paymentType: 'withdrawal',
      status: 'processing', // Goes directly to processing for admin review
    })

    await transaction.save()

    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully. It will be processed by admin.',
      data: transaction,
    })
  } catch (error) {
    console.error('Error in /withdraw route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create withdrawal request',
      error: error.message,
    })
  }
})

// Create recharge request
router.post('/recharge', async (req, res) => {
  try {
    const { userId, amount, utr } = req.body

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

    // Find user
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

    // Create recharge transaction with "processing" status
    const transaction = new Transaction({
      userId,
      utr: utr || null,
      amount,
      paymentType: 'recharge',
      status: 'processing', // Goes to processing for admin verification
    })

    await transaction.save()

    res.json({
      success: true,
      message: 'Recharge request submitted successfully. Admin will verify and process it.',
      data: transaction,
    })
  } catch (error) {
    console.error('Error in /recharge route:', error)
    console.error('Error stack:', error.stack)
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    })
    res.status(500).json({
      success: false,
      message: 'Failed to create recharge request',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  }
})

// Update recharge with UTR (using transaction _id)
router.put('/recharge/:_id/utr', async (req, res) => {
  try {
    const { _id } = req.params
    const { utr } = req.body

    if (!utr) {
      return res.status(400).json({
        success: false,
        message: 'UTR is required',
      })
    }

    const transaction = await Transaction.findById(_id)
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    // Check if user is restricted
    const user = await User.findOne({ phone: transaction.userId })
    if (user && user.isRestricted) {
      return res.status(403).json({
        success: false,
        message: 'User account is restricted. Cannot update transaction.',
      })
    }

    transaction.utr = utr
    await transaction.save()

    res.json({
      success: true,
      message: 'UTR updated successfully',
      data: transaction,
    })
  } catch (error) {
    console.error('Error in /recharge/:_id/utr route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update UTR',
      error: error.message,
    })
  }
})

// Get user transactions
router.get('/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { status, paymentType, limit = 50 } = req.query

    const query = { userId }
    if (status) query.status = status
    if (paymentType) query.paymentType = paymentType

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    res.json({
      success: true,
      data: transactions,
    })
  } catch (error) {
    console.error('Error in /transactions route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message,
    })
  }
})

export default router

