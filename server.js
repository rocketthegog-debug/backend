import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import Transaction from './models/Transaction.js'

// Load environment variables FIRST before importing services
dotenv.config()

// Now import services (they will have access to process.env)
import cricketRoutes from './routes/cricket.js'
import authRoutes from './routes/auth.js'
import walletRoutes from './routes/wallet.js'
import adminRoutes from './routes/admin.js'
import paymentMethodsRoutes from './routes/paymentMethods.js'
import earningsRoutes from './routes/earnings.js'
import referralRoutes from './routes/referral.js'
import { startCacheUpdater, reinitializeApiKeys } from './services/cricketService.js'

// Re-initialize API keys after dotenv.config() to ensure they're loaded
reinitializeApiKeys()

const app = express()

// CORS Configuration - Allow all origins for development
const corsOptions = {
  origin: true, // Allow all origins for development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'apikey'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}

// MongoDB Connection with serverless-optimized options
const mongooseOptions = {
  serverSelectionTimeoutMS: 15000, // Increased timeout for serverless (15s)
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  connectTimeoutMS: 15000, // Give up initial connection after 15s
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 0, // Allow 0 connections for serverless (connections created on demand)
  maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
  retryWrites: true,
  w: 'majority'
}

// Enable buffering for serverless - Mongoose will queue operations until connected
// This is set globally, not in connection options
mongoose.set('bufferCommands', true)

// Connection state management for serverless
let isConnecting = false
let connectionPromise = null

const connectToMongoDB = async () => {
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  // If already connecting, wait for that connection
  if (isConnecting && connectionPromise) {
    return connectionPromise
  }

  // Start new connection
  isConnecting = true
  connectionPromise = mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
    .then(() => {
      console.log('✅ MongoDB Connected')
      isConnecting = false
      return mongoose.connection
    })
    .catch((err) => {
      console.error('❌ MongoDB Connection Error:', err.message)
      isConnecting = false
      connectionPromise = null
      // Don't throw - let Mongoose buffer commands
      return mongoose.connection
    })

  return connectionPromise
}

// Initial connection attempt (non-blocking for serverless)
if (process.env.VERCEL !== '1') {
  // In local dev, connect immediately
  connectToMongoDB()
    .then(async () => {
      startCacheUpdater()
      await cleanupOldTransactions()
    })
    .catch(() => {
      // Connection will be retried on first request
    })
} else {
  // On Vercel, connection will be established on first request
  // Mongoose will buffer commands until connection is ready
}

// Middleware
app.use(cors(corsOptions))

// Handle preflight requests
app.options('*', cors(corsOptions))
app.use(express.json())

// Middleware to ensure MongoDB connection before handling requests (for serverless)
app.use(async (req, res, next) => {
  // Skip connection check for health endpoint
  if (req.path === '/api/health' || req.path === '/') {
    return next()
  }

  // Ensure MongoDB is connected before processing request
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectToMongoDB()
    }
  } catch (error) {
    console.error('MongoDB connection failed in middleware:', error.message)
    // Continue anyway - Mongoose will buffer commands if connection fails
  }
  next()
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

