import express from 'express'
import Transaction from '../models/Transaction.js'
import User from '../models/User.js'

const router = express.Router()

// Middleware to check if user is admin (simple check - in production use JWT)
const isAdmin = async (req, res, next) => {
  try {
    const { adminUserId } = req.body // Or get from headers/token
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

    next()
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Admin verification failed',
      error: error.message,
    })
  }
}

// Get all pending/processing transactions
router.get('/transactions', async (req, res) => {
  try {
    const { status = 'processing', paymentType } = req.query

    const query = { status }
    if (paymentType) query.paymentType = paymentType

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name phone')

    res.json({
      success: true,
      data: transactions,
    })
  } catch (error) {
    console.error('Error in /admin/transactions route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message,
    })
  }
})

// Update transaction status (confirm or cancel)
router.put('/transactions/:_id/status', async (req, res) => {
  try {
    const { _id } = req.params
    const { status, adminUserId } = req.body // status: 'completed' or 'cancelled'

    if (!status || !['completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (completed or cancelled)',
      })
    }

    // Verify admin
    if (adminUserId) {
      const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
      if (!admin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }
    }

    const transaction = await Transaction.findById(_id)
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    // Only allow updating if status is processing
    if (transaction.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not in processing status',
      })
    }

    // Update transaction status
    transaction.status = status
    await transaction.save()

    // If completed and recharge - update wallet balance
    if (status === 'completed' && transaction.paymentType === 'recharge') {
      const user = await User.findOne({ phone: transaction.userId })
      if (user) {
        user.walletBalance += transaction.amount
        await user.save()
      }
    }

    // If completed and withdrawal - deduct from wallet (balance already checked during creation)
    if (status === 'completed' && transaction.paymentType === 'withdrawal') {
      const user = await User.findOne({ phone: transaction.userId })
      if (user) {
        user.walletBalance -= transaction.amount
        await user.save()
      }
    }

    // If cancelled and withdrawal was processing, nothing to do (balance wasn't deducted)

    res.json({
      success: true,
      message: `Transaction ${status === 'completed' ? 'confirmed' : 'cancelled'} successfully`,
      data: transaction,
    })
  } catch (error) {
    console.error('Error in /admin/transactions/:_id/status route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction status',
      error: error.message,
    })
  }
})

// Get transaction by ID
router.get('/transactions/:_id', async (req, res) => {
  try {
    const { _id } = req.params
    const transaction = await Transaction.findById(_id)

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    res.json({
      success: true,
      data: transaction,
    })
  } catch (error) {
    console.error('Error in /admin/transactions/:_id route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message,
    })
  }
})

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 })
    res.json({
      success: true,
      data: users,
    })
  } catch (error) {
    console.error('Error in /admin/users route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    })
  }
})

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { adminUserId } = req.body

    // Verify admin
    if (adminUserId) {
      const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
      if (!admin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }
    }

    // Find user by phone or _id
    const user = await User.findOne({ 
      $or: [
        { phone: userId },
        { _id: userId }
      ]
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Prevent deleting admin users
    if (user.isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete admin users',
      })
    }

    // Prevent admin from deleting themselves
    if (adminUserId && user.phone === adminUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      })
    }

    // Delete all transactions associated with this user
    await Transaction.deleteMany({ userId: user.phone })

    // Delete the user
    await User.findByIdAndDelete(user._id)

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: {
        deletedUserId: user._id,
        deletedUserPhone: user.phone,
      },
    })
  } catch (error) {
    console.error('Error in DELETE /admin/users/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message,
    })
  }
})

// Update user
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { adminUserId, name, password } = req.body

    // Verify admin
    if (adminUserId) {
      const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
      if (!admin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }
    }

    // Find user by phone or _id
    const user = await User.findOne({ 
      $or: [
        { phone: userId },
        { _id: userId }
      ]
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Update fields if provided
    if (name !== undefined) {
      user.name = name
    }
    if (password !== undefined && password.trim() !== '') {
      user.password = password.trim()
    }

    await user.save()

    // Return user without password
    const userResponse = user.toObject()
    delete userResponse.password

    res.json({
      success: true,
      message: 'User updated successfully',
      data: userResponse,
    })
  } catch (error) {
    console.error('Error in PUT /admin/users/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message,
    })
  }
})

// Restrict/Unrestrict user
router.put('/users/:userId/restrict', async (req, res) => {
  try {
    const { userId } = req.params
    const { adminUserId, isRestricted } = req.body

    // Verify admin
    if (adminUserId) {
      const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
      if (!admin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }
    }

    if (typeof isRestricted !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isRestricted must be a boolean value',
      })
    }

    // Find user by phone or _id
    const user = await User.findOne({ 
      $or: [
        { phone: userId },
        { _id: userId }
      ]
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Prevent restricting admin users
    if (user.isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot restrict admin users',
      })
    }

    // Prevent admin from restricting themselves
    if (adminUserId && user.phone === adminUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot restrict your own account',
      })
    }

    // Update restriction status
    user.isRestricted = isRestricted
    await user.save()

    res.json({
      success: true,
      message: `User ${isRestricted ? 'restricted' : 'unrestricted'} successfully`,
      data: {
        userId: user._id,
        phone: user.phone,
        name: user.name,
        isRestricted: user.isRestricted,
      },
    })
  } catch (error) {
    console.error('Error in PUT /admin/users/:userId/restrict route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update user restriction',
      error: error.message,
    })
  }
})

// Get loss tracking for all users (admin only)
router.get('/loss-tracking', async (req, res) => {
  try {
    const { adminUserId } = req.query

    // Verify admin
    if (adminUserId) {
      const admin = await User.findOne({ phone: adminUserId, isAdmin: true })
      if (!admin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        })
      }
    }

    // Get all users with their recharge and earnings data
    const users = await User.find({ isAdmin: false }).select('name phone walletBalance createdAt')

    const lossTracking = await Promise.all(
      users.map(async (user) => {
        // Calculate total recharged (CP - Cost Price)
        const totalRecharged = await Transaction.aggregate([
          {
            $match: {
              userId: user.phone,
              paymentType: 'recharge',
              status: 'completed',
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ])

        // Calculate total earnings (Loss - what we gave them for free)
        const totalEarnings = await Transaction.aggregate([
          {
            $match: {
              userId: user.phone,
              paymentType: 'click-earn',
              status: 'completed',
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ])

        // Calculate total withdrawn
        const totalWithdrawn = await Transaction.aggregate([
          {
            $match: {
              userId: user.phone,
              paymentType: 'withdrawal',
              status: 'completed',
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ])

        const cp = totalRecharged.length > 0 ? totalRecharged[0].total : 0
        const loss = totalEarnings.length > 0 ? totalEarnings[0].total : 0
        const totalWithdrawnAmount = totalWithdrawn.length > 0 ? totalWithdrawn[0].total : 0

        // Net loss = Earnings given (what we lost)
        const netLoss = loss

        return {
          userId: user.phone,
          userName: user.name,
          cp: parseFloat(cp.toFixed(2)),
          loss: parseFloat(loss.toFixed(2)),
          totalWithdrawn: parseFloat(totalWithdrawnAmount.toFixed(2)),
          netLoss: parseFloat(netLoss.toFixed(2)),
          walletBalance: parseFloat(user.walletBalance.toFixed(2)),
          joinedDate: user.createdAt,
        }
      })
    )

    // Calculate total loss across all users
    const totalCP = lossTracking.reduce((sum, user) => sum + user.cp, 0)
    const totalLoss = lossTracking.reduce((sum, user) => sum + user.loss, 0)
    const totalWithdrawn = lossTracking.reduce((sum, user) => sum + user.totalWithdrawn, 0)
    const totalNetLoss = lossTracking.reduce((sum, user) => sum + user.netLoss, 0)

    res.json({
      success: true,
      data: {
        users: lossTracking.sort((a, b) => b.netLoss - a.netLoss), // Sort by highest loss
        summary: {
          totalCP: parseFloat(totalCP.toFixed(2)),
          totalLoss: parseFloat(totalLoss.toFixed(2)),
          totalWithdrawn: parseFloat(totalWithdrawn.toFixed(2)),
          totalNetLoss: parseFloat(totalNetLoss.toFixed(2)),
          totalUsers: lossTracking.length,
        },
      },
    })
  } catch (error) {
    console.error('Error in /admin/loss-tracking route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loss tracking',
      error: error.message,
    })
  }
})

export default router

