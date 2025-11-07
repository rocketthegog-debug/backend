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

// MongoDB Connection with serverless-optimized options
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  connectTimeoutMS: 10000, // Give up initial connection after 10s
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 1, // Maintain at least 1 socket connection
  maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
}

// Configure mongoose to not buffer commands (for serverless)
// This prevents Mongoose from buffering commands when connection is not ready
mongoose.set('bufferCommands', false)

mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
  .then(async () => {
    console.log('✅ MongoDB Connected')
    // Start cache updater after MongoDB connection
    if (process.env.VERCEL !== '1') {
      startCacheUpdater()
      // Run cleanup after connection is established
      await cleanupOldTransactions()
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err)
    // In serverless, connection errors are expected on cold starts
    // The connection will be retried on next request
  })

// Routes
app.use('/api/cricket', cricketRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/payment-methods', paymentMethodsRoutes)
app.use('/api/earnings', earningsRoutes)
app.use('/api/referral', referralRoutes)

// Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'CrickBuzz API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      cricket: '/api/cricket',
      auth: '/api/auth',
      wallet: '/api/wallet',
      earnings: '/api/earnings',
      referral: '/api/referral',
      admin: '/api/admin'
    }
  })
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'CrickBuzz API is running',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
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

// Run cleanup job every 24 hours (only if not on Vercel)
if (process.env.VERCEL !== '1') {
  setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      await cleanupOldTransactions()
    }
  }, 24 * 60 * 60 * 1000)
}

const PORT = process.env.PORT || 5001

// Export app for Vercel serverless functions
export default app

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
  })
}

