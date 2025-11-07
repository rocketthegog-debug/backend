import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  walletBalance: {
    type: Number,
    default: 0,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  referredBy: {
    type: String,
    default: null,
    index: true,
  },
  totalReferrals: {
    type: Number,
    default: 0,
  },
  isRestricted: {
    type: Boolean,
    default: false,
    index: true,
  },
  // Click to earn rate limiting fields
  lastClickTime: {
    type: Date,
    default: null,
  },
  consecutiveClicks: {
    type: Number,
    default: 0,
  },
  cooldownUntil: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

userSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  
  // Generate unique referral code if not exists (only for new documents)
  if (!this.referralCode && this.isNew) {
    // Generate a unique referral code based on phone, timestamp, and random string
    const timestamp = Date.now().toString(36).slice(-6).toUpperCase()
    const randomStr = Math.random().toString(36).slice(2, 6).toUpperCase()
    const phoneSuffix = this.phone.slice(-4)
    this.referralCode = `REF${phoneSuffix}${timestamp}${randomStr}`
  }
  
  next()
})

export default mongoose.model('User', userSchema)

