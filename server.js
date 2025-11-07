import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import cricketRoutes from './routes/cricket.js'
import authRoutes from './routes/auth.js'
import walletRoutes from './routes/wallet.js'
import adminRoutes from './routes/admin.js'
import paymentMethodsRoutes from './routes/paymentMethods.js'
import earningsRoutes from './routes/earnings.js'
import referralRoutes from './routes/referral.js'
import Transaction from './models/Transaction.js'
import { startCacheUpdater } from './services/cricketService.js'

dotenv.config()

const app = express()

// CORS Configuration - Allow all origins for development
const corsOptions = {
  origin: true, // Allow all origins for development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'apikey'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}

// Middleware
app.use(cors(corsOptions))

// Handle preflight requests
app.options('*', cors(corsOptions))
app.use(express.json())

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected')
    // Start cache updater after MongoDB connection
    startCacheUpdater()
  })
  .catch((err) => console.error('❌ MongoDB Connection Error:', err))

// Routes
app.use('/api/cricket', cricketRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/payment-methods', paymentMethodsRoutes)
app.use('/api/earnings', earningsRoutes)
app.use('/api/referral', referralRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CrickBuzz API is running' })
})

// Cleanup job: Delete transactions that are not confirmed/processed within 5 days
const cleanupOldTransactions = async () => {
  try {
    const fiveDaysAgo = new Date()
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

    // Delete transactions that are not completed and older than 5 days
    const result = await Transaction.deleteMany({
      status: { $ne: 'completed' },
      createdAt: { $lt: fiveDaysAgo }
    })

    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} old unconfirmed transactions`)
    }
  } catch (error) {
    console.error('❌ Error cleaning up old transactions:', error)
  }
}

// Run cleanup job every 24 hours
setInterval(cleanupOldTransactions, 24 * 60 * 60 * 1000)

// Run cleanup job on server start
cleanupOldTransactions()

const PORT = process.env.PORT || 5001

// Export app for Vercel serverless functions
export default app

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
  })
}

