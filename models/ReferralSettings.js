import mongoose from 'mongoose'

const referralSettingsSchema = new mongoose.Schema({
  referrerReward: {
    type: Number,
    default: 10,
    required: true,
  },
  referredReward: {
    type: Number,
    default: 10,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

referralSettingsSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

// Ensure only one settings document exists
referralSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      referrerReward: 10,
      referredReward: 10,
      isActive: true,
    })
  }
  return settings
}

export default mongoose.model('ReferralSettings', referralSettingsSchema)

