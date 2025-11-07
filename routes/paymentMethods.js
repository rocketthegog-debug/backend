import express from 'express'
import PaymentMethod from '../models/PaymentMethod.js'

const router = express.Router()

// Get payment method for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const paymentMethod = await PaymentMethod.findOne({ userId })
    
    if (!paymentMethod) {
      return res.json({
        success: true,
        data: null,
        message: 'No payment method found',
      })
    }

    res.json({
      success: true,
      data: paymentMethod,
    })
  } catch (error) {
    console.error('Error in GET /payment-methods/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment method',
      error: error.message,
    })
  }
})

// Create or update payment method (with weekly restriction)
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { accountHolderName, accountNumber, ifscCode, upiId, bankName } = req.body

    // Validation
    if (!accountHolderName || !accountNumber || !ifscCode) {
      return res.status(400).json({
        success: false,
        message: 'Account holder name, account number, and IFSC code are required',
      })
    }

    // Check if payment method exists
    const existingPaymentMethod = await PaymentMethod.findOne({ userId })

    if (existingPaymentMethod) {
      // Check if user can update (once per week restriction)
      const now = new Date()
      const lastUpdated = new Date(existingPaymentMethod.lastUpdatedAt)
      const daysSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60 * 24)
      
      if (daysSinceUpdate < 7) {
        const nextUpdateDate = new Date(lastUpdated)
        nextUpdateDate.setDate(nextUpdateDate.getDate() + 7)
        
        const day = nextUpdateDate.getDate()
        const month = nextUpdateDate.getMonth() + 1
        const year = nextUpdateDate.getFullYear()
        
        return res.status(400).json({
          success: false,
          message: `You will be able to update it on ${day}/${month}/${year}`,
          nextUpdateDate: `${day}/${month}/${year}`,
          daysRemaining: Math.ceil(7 - daysSinceUpdate),
        })
      }

      // Update existing payment method
      existingPaymentMethod.accountHolderName = accountHolderName
      existingPaymentMethod.accountNumber = accountNumber
      existingPaymentMethod.ifscCode = ifscCode
      existingPaymentMethod.upiId = upiId || null
      existingPaymentMethod.bankName = bankName || null
      existingPaymentMethod.lastUpdatedAt = now
      
      await existingPaymentMethod.save()

      return res.json({
        success: true,
        message: 'Payment method updated successfully',
        data: existingPaymentMethod,
      })
    }

    // Create new payment method
    const paymentMethod = new PaymentMethod({
      userId,
      accountHolderName,
      accountNumber,
      ifscCode,
      upiId: upiId || null,
      bankName: bankName || null,
    })

    await paymentMethod.save()

    res.json({
      success: true,
      message: 'Payment method created successfully',
      data: paymentMethod,
    })
  } catch (error) {
    console.error('Error in POST /payment-methods/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to save payment method',
      error: error.message,
    })
  }
})

// Get payment method for admin (for withdrawals)
router.get('/admin/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const paymentMethod = await PaymentMethod.findOne({ userId })
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found for this user',
      })
    }

    res.json({
      success: true,
      data: paymentMethod,
    })
  } catch (error) {
    console.error('Error in GET /payment-methods/admin/:userId route:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment method',
      error: error.message,
    })
  }
})

export default router


